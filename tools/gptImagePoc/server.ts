import { createHash, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendFile, mkdir, readFile, readdir, stat, unlink, writeAtomic } from "@toonflow/file";
import { file } from "@toonflow/file/bun";

const host = "127.0.0.1";
const port = Number(process.env.TOONFLOW_GPT_IMAGE_POC_PORT ?? 3301);
if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 1455) throw new Error("POC port must be a valid port other than OAuth callback port 1455");
const redirectUri = "http://localhost:1455/auth/callback";
const clientId = "app_EMoamEEZ73f0CkXaXp7hrann";
const authUrl = "https://auth.openai.com/oauth/authorize";
const tokenUrl = "https://auth.openai.com/oauth/token";
const codexImagesUrl = "https://chatgpt.com/backend-api/codex/images/generations";
const codexEditsUrl = "https://chatgpt.com/backend-api/codex/images/edits";
const baseDirectory = join(tmpdir(), "toonflow-gpt-image-poc");
const dataDirectory = join(baseDirectory, "data");
const outputDirectory = join(baseDirectory, "outputs");
const referenceDirectory = join(baseDirectory, "references");
const authPath = join(baseDirectory, "auth.json");
const logPath = join(baseDirectory, "requests.jsonl");
const loginHtml = `<!doctype html><meta charset="utf-8"><title>Toonflow GPT Image</title><style>body{font:16px system-ui;margin:3rem auto;max-width:40rem;color:#222}main{border:1px solid #ddd;padding:2rem;border-radius:10px}</style><main><h1>Toonflow GPT Image</h1><p>授权回调已完成。请关闭此页并返回 POC 页面查看登录状态。</p></main>`;
const modelCandidates = [
  "gpt-image-2.6-flare",
];
const qualities = ["auto", "low", "medium", "high", "xhigh", "max"];
const sizes: Record<string, string> = { "1:1": "1024x1024", "16:9": "1536x864", "9:16": "864x1536" };
const pendingLogins = new Map<string, { verifier: string; expiresAt: number }>();

type AuthRecord = { accessToken: string; refreshToken: string; expiresAt: number; accountId: string; email: string };
type HistoryRecord = { id: string; createdAt: string; mode: "text" | "edit"; prompt: string; model: string; ratio: string; size?: string; quality: string; reportedQuality?: string; referenceCount: number; fileName: string; mediaType: string; bytes: number; width: number; height: number; durationMs: number; status: "success" };

await Promise.all([mkdir(baseDirectory, { recursive: true }), mkdir(dataDirectory, { recursive: true }), mkdir(outputDirectory, { recursive: true }), mkdir(referenceDirectory, { recursive: true })]);

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function sameOrigin(request: Request) {
  return request.headers.get("origin") === `http://${host}:${port}`
    && request.headers.get("host") === `${host}:${port}`;
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return {};
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>; }
  catch { return {}; }
}
function emailFromToken(token: string) {
  const payload = decodeJwtPayload(token);
  return typeof payload.email === "string" ? payload.email : "";
}
function accountIdFromToken(token: string) {
  const payload = decodeJwtPayload(token);
  const auth = payload["https://api.openai.com/auth"];
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) return "";
  const accountId = (auth as Record<string, unknown>).chatgpt_account_id;
  return typeof accountId === "string" ? accountId : "";
}
function safeError(value: unknown, auth?: AuthRecord) {
  let text = errorText(value).slice(0, 1200);
  for (const secret of [auth?.accessToken, auth?.refreshToken, auth?.accountId]) {
    if (secret) text = text.replaceAll(secret, "[REDACTED]");
  }
  return text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED JWT]").replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]");
}
async function appendLog(record: Record<string, unknown>) {
  await appendFile(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, "utf8");
}
async function readAuth(): Promise<AuthRecord | undefined> {
  try {
    const value = JSON.parse(await readFile(authPath, "utf8")) as Partial<AuthRecord>;
    if (typeof value.accessToken !== "string" || typeof value.refreshToken !== "string" || typeof value.expiresAt !== "number") return undefined;
    return { accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: value.expiresAt,
      accountId: typeof value.accountId === "string" ? value.accountId : "", email: typeof value.email === "string" ? value.email : "" };
  } catch { return undefined; }
}
async function writeAuth(value: AuthRecord) {
  await writeAtomic(authPath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}
async function exchangeToken(fields: Record<string, string>) {
  const response = await fetch(tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams(fields), signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string") throw new Error(`OAuth token exchange failed (HTTP ${response.status}): ${typeof body.error_description === "string" ? body.error_description : typeof body.error === "string" ? body.error : "invalid token response"}`);
  return body;
}
async function saveTokenResponse(body: Record<string, unknown>, prior?: AuthRecord): Promise<AuthRecord> {
  const accessToken = String(body.access_token ?? "");
  const refreshToken = typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : prior?.refreshToken ?? "";
  const idToken = typeof body.id_token === "string" ? body.id_token : "";
  const value: AuthRecord = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
    accountId: prior?.accountId || accountIdFromToken(accessToken) || accountIdFromToken(idToken),
    email: prior?.email || emailFromToken(idToken) || emailFromToken(accessToken),
  };
  if (!value.accessToken || !value.refreshToken || !value.accountId) throw new Error("OAuth 登录响应缺少可用于图片服务的账户信息");
  await writeAuth(value);
  return value;
}
async function ensureFreshAuth() {
  const auth = await readAuth();
  if (!auth) throw new Error("请先完成独立 ChatGPT 登录");
  if (auth.expiresAt > Date.now() + 60000) return auth;
  const body = await exchangeToken({ grant_type: "refresh_token", client_id: clientId, refresh_token: auth.refreshToken });
  return saveTokenResponse(body, auth);
}
function parseImage(data: Uint8Array) {
  const b = Buffer.from(data);
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mediaType: "image/png", width: b.readUInt32BE(16), height: b.readUInt32BE(20), extension: "png" };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < b.length) {
      if (b[offset] !== 0xff) { offset++; continue; }
      const marker = b[offset + 1]!;
      const length = b.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { mediaType: "image/jpeg", width: b.readUInt16BE(offset + 7), height: b.readUInt16BE(offset + 5), extension: "jpg" };
      }
      if (length < 2) break;
      offset += length + 2;
    }
  }
  if (b.length >= 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { mediaType: "image/webp", width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), extension: "webp" };
    if (chunk === "VP8L" && b[20] === 0x2f) return { mediaType: "image/webp", width: 1 + (((b[22]! & 0x3f) << 8) | b[21]!), height: 1 + (((b[24]! & 0x0f) << 10) | (b[23]! << 2) | ((b[22]! & 0xc0) >> 6)), extension: "webp" };
  }
  throw new Error("返回内容不是可识别的 PNG/JPEG/WebP 图片");
}
function parseDataUrl(value: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("参考图必须是 PNG、JPEG 或 WebP data URL");
  const data = Buffer.from(match[2]!, "base64");
  if (!data.length || data.length > 12 * 1024 * 1024) throw new Error("参考图必须小于 12 MB");
  const info = parseImage(data);
  if (info.mediaType !== match[1]) throw new Error("参考图 MIME 与文件内容不一致");
  return { data, mediaType: info.mediaType, info };
}
function promptForRatio(prompt: string, ratio: string) {
  if (ratio === "auto") return prompt;
  const direction = ratio === "1:1" ? "正方形" : ratio === "16:9" ? "横向宽屏" : "竖向";
  return `${prompt}\n\n输出图片的画布宽高比为 ${ratio}，使用${direction}构图并填满画布。`;
}
async function generation(request: Request) {
  if (!sameOrigin(request)) return json({ error: "origin rejected" }, 403);
  const started = Date.now();
  const auth = await ensureFreshAuth();
  let params: Record<string, unknown>;
  try { params = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "invalid JSON" }, 400); }
  const prompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
  const mode = params.mode === "edit" ? "edit" : "text";
  const model = typeof params.model === "string" ? params.model : "";
  const ratio = typeof params.ratio === "string" ? params.ratio : "";
  const quality = typeof params.quality === "string" ? params.quality : "";
  if (!prompt || prompt.length > 10000) return json({ error: "prompt must contain 1–10000 characters" }, 400);
  if (!modelCandidates.includes(model)) return json({ error: "请从已知候选模型中明确选择模型" }, 400);
  if (!(ratio === "auto" || Object.hasOwn(sizes, ratio))) return json({ error: "ratio must be auto, 1:1, 16:9, or 9:16" }, 400);
  if (!qualities.includes(quality)) return json({ error: "unsupported quality" }, 400);
  let reference: ReturnType<typeof parseDataUrl> | undefined;
  try { if (mode === "edit") reference = parseDataUrl(typeof params.referenceDataUrl === "string" ? params.referenceDataUrl : ""); }
  catch (error) { return json({ error: errorText(error) }, 400); }
  const size = ratio === "auto" ? undefined : sizes[ratio];
  const body = {
    prompt: promptForRatio(prompt, ratio), model,
    ...(size ? { size } : {}),
    quality,
    ...(reference ? { images: [{ image_url: `data:${reference.mediaType};base64,${reference.data.toString("base64")}` }] } : {}),
  };
  const logRequest = { mode, model, ratio, ...(size ? { size } : {}), quality, referenceCount: reference ? 1 : 0, prompt };
  let responseStatus = 0;
  try {
    if (reference) {
      const referenceName = `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}.${reference.info.extension}`;
      await writeAtomic(join(referenceDirectory, referenceName), reference.data);
    }
    const response = await fetch(reference ? codexEditsUrl : codexImagesUrl, {
      method: "POST", redirect: "error", headers: {
        authorization: `Bearer ${auth.accessToken}`, "chatgpt-account-id": auth.accountId,
        originator: "codex_cli_rs", "content-type": "application/json", accept: "application/json",
      }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000),
    });
    responseStatus = response.status;
    const responseText = await response.text();
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(responseText) as Record<string, unknown>; }
    catch { throw new Error(`上游返回不可解析内容 (HTTP ${response.status})`); }
    if (!response.ok) {
      const error = payload.error;
      const message = typeof error === "string" ? error : error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string" ? String((error as Record<string, unknown>).message) : `HTTP ${response.status}`;
      throw new Error(`ChatGPT subscription image request failed: ${safeError(message, auth)}`);
    }
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const first = rows[0] as Record<string, unknown> | undefined;
    if (!first || typeof first.b64_json !== "string" || !first.b64_json) throw new Error("上游成功响应中没有图片数据");
    const bytes = Buffer.from(first.b64_json, "base64");
    const imageInfo = parseImage(bytes);
    const id = randomUUID();
    const fileName = `${id}.${imageInfo.extension}`;
    const outputPath = join(outputDirectory, fileName);
    await writeAtomic(outputPath, bytes, { exclusive: true });
    const history: HistoryRecord = {
      id, createdAt: new Date().toISOString(), mode, prompt, model, ratio, ...(size ? { size } : {}), quality,
      ...(typeof payload.quality === "string" && payload.quality ? { reportedQuality: payload.quality } : {}),
      referenceCount: reference ? 1 : 0, fileName, mediaType: imageInfo.mediaType, bytes: bytes.length,
      width: imageInfo.width, height: imageInfo.height, durationMs: Date.now() - started, status: "success",
    };
    await writeAtomic(join(dataDirectory, `${id}.json`), `${JSON.stringify(history, null, 2)}\n`, { exclusive: true });
    await appendLog({ type: "image", request: logRequest, response: { status: response.status, keys: Object.keys(payload), reportedQuality: typeof payload.quality === "string" ? payload.quality : null, mediaType: imageInfo.mediaType, bytes: bytes.length, width: imageInfo.width, height: imageInfo.height }, durationMs: Date.now() - started, status: "success", resultId: id });
    return json(history);
  } catch (error) {
    const message = safeError(error, auth);
    await appendLog({ type: "image", request: logRequest, response: { status: responseStatus }, durationMs: Date.now() - started, status: "error", error: message });
    return json({ error: message }, 502);
  }
}

const callbackServer = Bun.serve({
  hostname: "localhost", port: 1455,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/auth/callback" || request.method !== "GET") return new Response("Not found", { status: 404 });
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const pending = pendingLogins.get(state);
    pendingLogins.delete(state);
    if (!pending || pending.expiresAt < Date.now() || !code) return new Response("登录状态无效或已过期，请返回 POC 页面重新登录。", { status: 400 });
    try {
      const token = await exchangeToken({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: redirectUri, code_verifier: pending.verifier });
      await saveTokenResponse(token);
      await appendLog({ type: "oauth", status: "success", at: new Date().toISOString() });
      return new Response(loginHtml, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    } catch (error) {
      await appendLog({ type: "oauth", status: "error", error: safeError(error) });
      return new Response("登录失败，请返回 POC 页面检查日志后重试。", { status: 502 });
    }
  },
});

const server = Bun.serve({
  hostname: host, port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") return new Response(await readFile(join(import.meta.dir, "index.html"), "utf8"), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    if (url.pathname === "/api/status" && request.method === "GET") {
      const auth = await readAuth();
      return json({ authenticated: Boolean(auth), email: auth?.email ?? "", expiresAt: auth?.expiresAt ?? null, callbackPort: callbackServer.port, models: modelCandidates, qualities });
    }
    if (url.pathname === "/api/login/start" && request.method === "POST") {
      if (!sameOrigin(request)) return json({ error: "origin rejected" }, 403);
      const verifier = randomBytes(32).toString("base64url");
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      const state = randomBytes(32).toString("base64url");
      pendingLogins.set(state, { verifier, expiresAt: Date.now() + 10 * 60 * 1000 });
      const authorize = new URL(authUrl);
      Object.entries({ client_id: clientId, response_type: "code", redirect_uri: redirectUri, scope: "openid profile email offline_access api.connectors.read api.connectors.invoke", code_challenge: challenge, code_challenge_method: "S256", state, id_token_add_organizations: "true", codex_cli_simplified_flow: "true", originator: "codex_cli_rs" }).forEach(([key, value]) => authorize.searchParams.set(key, value));
      await appendLog({ type: "oauth", status: "started", redirectUri });
      return json({ url: authorize.toString() });
    }
    if (url.pathname === "/api/logout" && request.method === "POST") {
      if (!sameOrigin(request)) return json({ error: "origin rejected" }, 403);
      try { await unlink(authPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await appendLog({ type: "oauth", status: "logged-out" });
      return json({ ok: true });
    }
    if (url.pathname === "/api/generate" && request.method === "POST") return generation(request);
    if (url.pathname === "/api/history" && request.method === "GET") {
      const records = await readdir(dataDirectory).catch(() => [] as string[]);
      const history = await Promise.all(records.filter(name => /^[0-9a-f-]{36}\.json$/.test(name)).map(async name => {
        try { return JSON.parse(await readFile(join(dataDirectory, name), "utf8")) as HistoryRecord; } catch { return undefined; }
      }));
      return json(history.filter(Boolean).sort((a, b) => b!.createdAt.localeCompare(a!.createdAt)));
    }
    if (url.pathname === "/requests.jsonl" && request.method === "GET") {
      try { return new Response(await readFile(logPath, "utf8"), { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } }); }
      catch { return new Response("No request log yet", { status: 404 }); }
    }
    if (url.pathname.startsWith("/files/") && request.method === "GET") {
      const name = url.pathname.slice("/files/".length);
      if (!/^[0-9a-f-]{36}\.(?:png|jpg|webp)$/.test(name)) return new Response("Not found", { status: 404 });
      const path = join(outputDirectory, name);
      try {
        const info = await stat(path);
        if (!info.isFile()) return new Response("Not found", { status: 404 });
        const record = await file(path);
        const mediaType = name.endsWith(".png") ? "image/png" : name.endsWith(".jpg") ? "image/jpeg" : "image/webp";
        return new Response(record, { headers: { "content-type": mediaType, "content-length": String(info.size), "cache-control": "no-store", "x-content-type-options": "nosniff" } });
      } catch { return new Response("Not found", { status: 404 }); }
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`GPT Image POC listening on http://${host}:${server.port}`);
console.log("OAuth callback listening on http://localhost:1455/auth/callback");
console.log(`Credentials and test outputs are isolated under ${baseDirectory}`);
