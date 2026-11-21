import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { mkdir, readFile, unlink, writeAtomic } from "@toonflow/file";
import conf from "@/utils/conf";

const callbackPort = Number(process.env.TOONFLOW_GPT_IMAGE_CALLBACK_PORT ?? 1455);
const redirectUri = `http://localhost:${callbackPort}/auth/callback`;
const clientId = "app_EMoamEEZ73f0CkXaXp7hrann";
const authUrl = "https://auth.openai.com/oauth/authorize";
const tokenUrl = "https://auth.openai.com/oauth/token";
const generationUrl = "https://chatgpt.com/backend-api/codex/images/generations";
const editsUrl = "https://chatgpt.com/backend-api/codex/images/edits";
const fixedModel = "gpt-image-2.6-flare";
const sizes: Record<string, string> = { "1:1": "1024x1024", "16:9": "1536x864", "9:16": "864x1536" };
const directory = join(dirname(conf.path), "gptImageSubscription");
const authPath = join(directory, "auth.json");
type AuthRecord = { accessToken: string; refreshToken: string; expiresAt: number; accountId: string; email: string };
type LoginAttempt = { verifier: string; expiresAt: number };
type Input = { model: string; prompt: string; ratio?: string; images?: MediaInput[] };
const pending = new Map<string, LoginAttempt>();
let callbackServer: Server | undefined;
let refreshPromise: Promise<AuthRecord> | undefined;

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) return {};
  try { return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>; }
  catch { return {}; }
}
function accountId(token: string) {
  const auth = decodeJwtPayload(token)["https://api.openai.com/auth"];
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) return "";
  const value = (auth as Record<string, unknown>).chatgpt_account_id;
  return typeof value === "string" ? value : "";
}
function email(token: string) {
  const value = decodeJwtPayload(token).email;
  return typeof value === "string" ? value : "";
}
function safeMessage(value: unknown, auth?: AuthRecord) {
  let message = value instanceof Error ? value.message : String(value);
  for (const secret of [auth?.accessToken, auth?.refreshToken, auth?.accountId]) if (secret) message = message.replaceAll(secret, "[redacted]");
  return message.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted JWT]").replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]").slice(0, 1600);
}
async function readAuth(): Promise<AuthRecord | undefined> {
  try {
    const value = JSON.parse(await readFile(authPath, "utf8")) as Partial<AuthRecord>;
    if (typeof value.accessToken !== "string" || typeof value.refreshToken !== "string" || typeof value.expiresAt !== "number" || typeof value.accountId !== "string") return undefined;
    return { accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: value.expiresAt,
      accountId: value.accountId, email: typeof value.email === "string" ? value.email : "" };
  } catch { return undefined; }
}
async function writeAuth(value: AuthRecord) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeAtomic(authPath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}
async function exchange(fields: Record<string, string>) {
  const response = await fetch(tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(fields), signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string") throw new Error(`ChatGPT OAuth failed (HTTP ${response.status}): ${typeof body.error_description === "string" ? body.error_description : typeof body.error === "string" ? body.error : "invalid token response"}`);
  return body;
}
async function storeTokenResponse(body: Record<string, unknown>, prior?: AuthRecord) {
  const accessToken = String(body.access_token ?? "");
  const refreshToken = typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : prior?.refreshToken ?? "";
  const idToken = typeof body.id_token === "string" ? body.id_token : "";
  const value: AuthRecord = { accessToken, refreshToken, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
    accountId: prior?.accountId || accountId(accessToken) || accountId(idToken), email: prior?.email || email(idToken) || email(accessToken) };
  if (!value.accessToken || !value.refreshToken || !value.accountId) throw new Error("OAuth 响应缺少图片服务所需的账户信息");
  await writeAuth(value);
  return value;
}
async function freshAuth() {
  const auth = await readAuth();
  if (!auth) throw new Error("请先在 Toonflow 中完成独立 ChatGPT 授权");
  if (auth.expiresAt > Date.now() + 60000) return auth;
  refreshPromise ??= exchange({ grant_type: "refresh_token", client_id: clientId, refresh_token: auth.refreshToken })
    .then(body => storeTokenResponse(body, auth)).finally(() => { refreshPromise = undefined; });
  return refreshPromise;
}
function imageInfo(bytes: Buffer) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { mimeType: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1]!;
      const length = bytes.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker))
        return { mimeType: "image/jpeg", width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      if (length < 2) break;
      offset += length + 2;
    }
  }
  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { mimeType: "image/webp", width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (chunk === "VP8L" && bytes[20] === 0x2f) return { mimeType: "image/webp", width: 1 + (((bytes[22]! & 0x3f) << 8) | bytes[21]!), height: 1 + (((bytes[24]! & 0x0f) << 10) | (bytes[23]! << 2) | ((bytes[22]! & 0xc0) >> 6)) };
  }
  throw new Error("上游响应不是可识别的 PNG、JPEG 或 WebP 图片");
}
function promptWithRatio(prompt: string, ratio: string) {
  if (ratio === "auto") return prompt;
  const direction = ratio === "1:1" ? "方形" : ratio === "16:9" ? "横向宽屏" : "竖向";
  return `${prompt}\n\n请按 ${ratio} 宽高比构图，使用${direction}画幅。`;
}
function inputImage(image: MediaInput) {
  let data: string;
  if (image.type === "base64") data = image.data;
  else if (image.type === "binary") data = Buffer.from(image.data).toString("base64");
  else throw new Error("GPT 会员生图参考图需要先导入当前 Toonflow 工作区");
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data);
  const raw = match ? match[2]! : data;
  const mimeType = match?.[1] ?? image.mimeType;
  if (!/^image\/(?:png|jpeg|webp)$/.test(mimeType)) throw new Error("参考图仅支持 PNG、JPEG 或 WebP");
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error("单张参考图需小于 12 MB");
  if (imageInfo(bytes).mimeType !== mimeType) throw new Error("参考图格式标记与文件内容不一致");
  return { image_url: `data:${mimeType};base64,${bytes.toString("base64")}` };
}
export async function generateSubscriptionImage(request: Input, signal?: AbortSignal): Promise<MediaAsset[]> {
  if (request.model !== fixedModel) throw new Error(`仅支持已验证模型 ${fixedModel}`);
  const prompt = request.prompt.trim();
  if (!prompt || prompt.length > 10000) throw new Error("提示词须为 1 到 10000 个字符");
  const ratio = request.ratio || "1:1";
  if (!(ratio in sizes || ratio === "auto")) throw new Error("支持的画幅为 1:1、16:9、9:16 或 auto");
  const images = request.images ?? [];
  if (images.length > 5) throw new Error("最多选择 5 张参考图");
  const auth = await freshAuth();
  const controller = signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000);
  try {
    const size = sizes[ratio];
    const response = await fetch(images.length ? editsUrl : generationUrl, {
      method: "POST", redirect: "error", signal: controller,
      headers: { authorization: `Bearer ${auth.accessToken}`, "chatgpt-account-id": auth.accountId,
        originator: "codex_cli_rs", "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ prompt: promptWithRatio(prompt, ratio), model: fixedModel, quality: "auto", ...(size ? { size } : {}), ...(images.length ? { images: images.map(inputImage) } : {}) }),
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const error = payload?.error;
      const message = typeof error === "string" ? error : error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string" ? String((error as Record<string, unknown>).message) : `HTTP ${response.status}`;
      throw new Error(`ChatGPT subscription image request failed: ${safeMessage(message, auth)}`);
    }
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const encoded = (rows[0] as Record<string, unknown> | undefined)?.b64_json;
    if (typeof encoded !== "string" || !encoded) throw new Error("上游成功响应中没有图片文件");
    const bytes = Buffer.from(encoded, "base64");
    if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new Error("上游图片为空或超过 100 MB");
    const info = imageInfo(bytes);
    return [{ type: "base64", data: bytes.toString("base64"), mimeType: info.mimeType, mediaType: "image" }];
  } catch (error) {
    throw new Error(safeMessage(error, auth));
  }
}
export function getSubscriptionStatus() {
  return readAuth().then(auth => ({ authenticated: Boolean(auth), email: auth?.email ?? "", expiresAt: auth?.expiresAt ?? null, model: fixedModel,
    aspectRatios: ["1:1", "16:9", "9:16"], quality: "auto" as const }));
}
export async function startSubscriptionLogin() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  pending.set(state, { verifier, expiresAt: Date.now() + 10 * 60 * 1000 });
  for (const [key, value] of pending) if (value.expiresAt < Date.now()) pending.delete(key);
  const url = new URL(authUrl);
  const fields = { client_id: clientId, response_type: "code", redirect_uri: redirectUri, scope: "openid profile email offline_access api.connectors.read api.connectors.invoke",
    code_challenge: challenge, code_challenge_method: "S256", state, id_token_add_organizations: "true", codex_cli_simplified_flow: "true", originator: "codex_cli_rs" };
  for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, value);
  return { url: url.toString() };
}
export async function logoutSubscription() {
  try { await unlink(authPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return { ok: true };
}
function callbackHtml(message: string) {
  return `<!doctype html><meta charset="utf-8"><title>Toonflow GPT Image 授权</title><main style="font:16px system-ui;max-width:40rem;margin:4rem auto"><h1>Toonflow GPT Image</h1><p>${message}</p><p>请返回 Toonflow 页面查看授权状态。</p></main>`;
}
export async function startSubscriptionCallbackServer() {
  if (callbackServer?.listening) return;
  callbackServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${callbackPort}`);
    if (req.method !== "GET" || url.pathname !== "/auth/callback") { res.writeHead(404).end("Not found"); return; }
    const state = url.searchParams.get("state") ?? "";
    const attempt = pending.get(state);
    pending.delete(state);
    const code = url.searchParams.get("code") ?? "";
    if (!attempt || attempt.expiresAt < Date.now() || !code) { res.writeHead(400, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(callbackHtml("登录状态无效或已过期，请返回 Toonflow 重新发起授权。")); return; }
    try {
      const token = await exchange({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: redirectUri, code_verifier: attempt.verifier });
      await storeTokenResponse(token);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(callbackHtml("授权已完成。"));
    } catch (error) {
      res.writeHead(502, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(callbackHtml(`授权未完成：${safeMessage(error)}`));
    }
  });
  await new Promise<void>((resolve, reject) => {
    callbackServer!.once("error", reject);
    callbackServer!.listen(callbackPort, "0.0.0.0", () => { callbackServer!.off("error", reject); resolve(); });
  });
}
