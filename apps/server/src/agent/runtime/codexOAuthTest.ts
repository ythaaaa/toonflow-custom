import { InMemoryCredentialStore, getSupportedThinkingLevels, type AuthInteraction, type Model, type Provider } from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { currentIdentity } from "@/utils/multiTenant/context";
import { isEnabled } from "@/utils/multiTenant/mode";
import { thinkingLevels, type ThinkingLevel } from "@/lib/modelReasoning";

const providerId = "toonflowCodexOAuthTest";
const providerLabel = "ChatGPT/Codex OAuth PoC";
const catalogUrl = new URL("https://chatgpt.com/backend-api/codex/models");
const codexPackageUrl = "https://registry.npmjs.org/@openai%2fcodex/latest";
const codexVersionCacheMs = 6 * 60 * 60 * 1000;
const baseProvider = openaiCodexProvider();
const baseModels = baseProvider.getModels();
let codexVersionCache: { value: string; expiresAt: number } | undefined;
let codexVersionRequest: Promise<string> | undefined;

type AccountCatalogEntry = {
  slug?: unknown;
  display_name?: unknown;
  visibility?: unknown;
  supported_in_api?: unknown;
  supported_reasoning_levels?: unknown;
};

type AccountModel = { model: Model<"openai-codex-responses">; reasoningLevels: ThinkingLevel[] };
type DeviceCode = { verificationUri: string; userCode: string; expiresAt?: number };
type OAuthStatus = {
  status: "disconnected" | "starting" | "waiting" | "connected" | "error";
  deviceCode?: DeviceCode;
  message?: string;
  catalogError?: string;
  models: { providerId: string; providerLabel: string; modelId: string; label: string; contextWindow: number; maxOutputTokens: number; reasoningLevels: ThinkingLevel[] }[];
};
type AccountState = {
  runtime: ModelRuntime;
  credentials: InMemoryCredentialStore;
  provider: Provider;
  models: AccountModel[];
  catalogFetchedAt: number;
  catalogRequest?: Promise<AccountModel[]>;
  login?: {
    controller: AbortController;
    ready: Promise<DeviceCode>;
    resolveReady(value: DeviceCode): void;
    rejectReady(error: Error): void;
  };
  status: OAuthStatus["status"];
  deviceCode?: DeviceCode;
  message?: string;
  catalogError?: string;
};

const accounts = new Map<string, AccountState>();

async function getCodexClientVersion() {
  if (codexVersionCache && codexVersionCache.expiresAt > Date.now()) return codexVersionCache.value;
  if (codexVersionRequest) return codexVersionRequest;
  const request = (async () => {
    const response = await fetch(codexPackageUrl, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`读取 Codex 客户端版本失败（HTTP ${response.status}）`);
    const data: unknown = await response.json();
    const version = data && typeof data === "object" && "version" in data ? data.version : undefined;
    if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Codex 客户端版本目录格式无效");
    codexVersionCache = { value: version, expiresAt: Date.now() + codexVersionCacheMs };
    return version;
  })();
  codexVersionRequest = request;
  try { return await request; }
  finally { if (codexVersionRequest === request) codexVersionRequest = undefined; }
}

function requireCodexOAuthTest() {
  if (isEnabled()) {
    throw Object.assign(new Error("Codex OAuth PoC 在多租户环境中不可用"), { status: 404 });
  }
}

function accountKey() {
  const actor = currentIdentity();
  return actor ? `${actor.role}:${actor.id}` : "standalone";
}

async function getAccountState() {
  requireCodexOAuthTest();
  const key = accountKey();
  const existing = accounts.get(key);
  if (existing) return existing;

  const credentials = new InMemoryCredentialStore();
  const runtime = await ModelRuntime.create({ credentials, modelsPath: null, refreshOnCreate: false });
  const provider: Provider = {
    ...baseProvider,
    id: providerId,
    name: providerLabel,
    getModels: () => baseModels.map(model => ({ ...model, provider: providerId })),
  };
  runtime.registerNativeProvider(provider);
  const state: AccountState = { runtime, credentials, provider, models: [], catalogFetchedAt: 0, status: "disconnected" };
  accounts.set(key, state);
  return state;
}

function getSupportedRemoteLevels(model: Model<"openai-codex-responses">, remote: AccountCatalogEntry) {
  if (!Array.isArray(remote.supported_reasoning_levels)) return getSupportedThinkingLevels(model);
  const remoteLevels = new Set(remote.supported_reasoning_levels.flatMap(level => {
    if (!level || typeof level !== "object" || !("effort" in level) || typeof level.effort !== "string") return [];
    return [level.effort];
  }));
  return thinkingLevels.filter(level => {
    const wire = model.thinkingLevelMap?.[level] ?? (level === "off" ? "none" : level);
    return wire !== null && remoteLevels.has(wire);
  });
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Codex OAuth 请求失败";
  return message.replace(/Bearer\s+\S+/gi, "Bearer [已隐藏]").replace(/(access|refresh)_token[=:]\s*[^\s,;]+/gi, "$1=[已隐藏]");
}

async function refreshCatalog(state: AccountState, fresh = false): Promise<AccountModel[]> {
  if (!fresh && state.models.length && Date.now() - state.catalogFetchedAt < 60_000) return state.models;
  if (state.catalogRequest) return state.catalogRequest;

  const request = (async () => {
    const clientVersion = await getCodexClientVersion();
    const auth = await state.runtime.getAuth(providerId);
    const credential = await state.credentials.read(providerId);
    if (!auth?.auth.apiKey || credential?.type !== "oauth" || typeof credential.accountId !== "string") {
      throw new Error("Codex OAuth 尚未授权或凭据已失效");
    }
    const url = new URL(catalogUrl);
    url.searchParams.set("client_version", clientVersion);
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        authorization: `Bearer ${auth.auth.apiKey}`,
        "chatgpt-account-id": credential.accountId,
        accept: "application/json",
        originator: "pi",
        "user-agent": "Toonflow Pi AI/0.85.1",
      },
    });
    if (!response.ok) throw new Error(`Codex 账号模型目录请求失败（HTTP ${response.status}）`);
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("models" in data) || !Array.isArray(data.models)) {
      throw new Error("Codex 账号模型目录返回结构无效");
    }

    const entries = new Map<string, AccountCatalogEntry>();
    for (const raw of data.models) {
      if (!raw || typeof raw !== "object" || !("slug" in raw) || typeof raw.slug !== "string" || !raw.slug.trim()) continue;
      const item = raw as AccountCatalogEntry;
      if (item.supported_in_api === false || item.visibility === "hide" || item.visibility === "hidden") continue;
      if (!entries.has(raw.slug)) entries.set(raw.slug, item);
    }
    const models = baseModels.flatMap(model => {
      const remote = entries.get(model.id);
      if (!remote) return [];
      const reasoningLevels = getSupportedRemoteLevels(model, remote);
      const thinkingLevelMap = Object.fromEntries(thinkingLevels.map(level => {
        if (!reasoningLevels.includes(level)) return [level, null];
        return [level, model.thinkingLevelMap?.[level] ?? (level === "off" ? null : level)];
      }));
      const name = typeof remote.display_name === "string" && remote.display_name.trim() ? remote.display_name : model.name;
      return [{ model: { ...model, name, provider: providerId, reasoning: reasoningLevels.length > 0, thinkingLevelMap }, reasoningLevels }];
    });
    if (!models.length) throw new Error(`Codex ${clientVersion} 目录返回 ${entries.size} 个可用模型，但没有与 Pi AI 当前内置目录匹配的模型`);

    state.models = models;
    state.catalogFetchedAt = Date.now();
    state.catalogError = undefined;
    state.provider = { ...state.provider, getModels: () => models.map(item => item.model) };
    state.runtime.registerNativeProvider(state.provider);
    return models;
  })();

  state.catalogRequest = request;
  try { return await request; }
  catch (error) {
    state.catalogError = errorMessage(error);
    throw error;
  } finally {
    if (state.catalogRequest === request) state.catalogRequest = undefined;
  }
}

export async function listCodexOAuthTestModels() {
  if (isEnabled()) return [];
  const state = accounts.get(accountKey());
  if (!state) return [];
  try {
    return (await refreshCatalog(state)).map(({ model, reasoningLevels }) => ({
      providerId, providerLabel, modelId: model.id, label: model.name, contextWindow: model.contextWindow,
      maxOutputTokens: model.maxTokens, reasoningLevels,
    }));
  } catch { return []; }
}

export async function getCodexOAuthTestStatus(refresh = false): Promise<OAuthStatus> {
  if (isEnabled()) return { status: "disconnected", models: [] };
  const state = accounts.get(accountKey());
  if (!state) return { status: "disconnected", models: [] };
  const credential = await state.credentials.read(providerId);
  if (credential?.type === "oauth") {
    state.status = "connected";
    state.deviceCode = undefined;
    state.message = undefined;
  }
  else if (state.status === "connected") state.status = "disconnected";
  if (state.status === "connected" && refresh) {
    try { await refreshCatalog(state, true); }
    catch { /* The catalog error is returned separately; do not report a valid credential as signed out. */ }
  }
  return {
    status: state.status,
    ...(state.deviceCode ? { deviceCode: state.deviceCode } : {}),
    ...(state.message ? { message: state.message } : {}),
    ...(state.catalogError ? { catalogError: state.catalogError } : {}),
    models: state.models.map(({ model, reasoningLevels }) => ({
      providerId, providerLabel, modelId: model.id, label: model.name, contextWindow: model.contextWindow,
      maxOutputTokens: model.maxTokens, reasoningLevels,
    })),
  };
}

export async function startCodexOAuthTestLogin() {
  const state = await getAccountState();
  if (state.status === "connected") return getCodexOAuthTestStatus(true);
  let login = state.login;
  if (!login) {
    let resolveReady!: (value: DeviceCode) => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<DeviceCode>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const controller = new AbortController();
    login = { controller, ready, resolveReady, rejectReady };
    state.login = login;
    state.status = "starting";
    state.deviceCode = undefined;
    state.message = undefined;
    state.catalogError = undefined;
    const interaction: AuthInteraction = {
      signal: controller.signal,
      prompt: async prompt => {
        if (prompt.type !== "select" || !prompt.options.some(option => option.id === "device_code")) {
          throw new Error("Pi AI Codex OAuth 没有提供设备授权流程");
        }
        return "device_code";
      },
      notify: event => {
        if (event.type !== "device_code") return;
        const deviceCode = {
          verificationUri: event.verificationUri,
          userCode: event.userCode,
          ...(event.expiresInSeconds === undefined ? {} : { expiresAt: Date.now() + event.expiresInSeconds * 1000 }),
        };
        state.status = "waiting";
        state.deviceCode = deviceCode;
        state.login && state.login.resolveReady(deviceCode);
      },
    };
    void state.runtime.login(providerId, "oauth", interaction).then(async () => {
      state.status = "connected";
      state.deviceCode = undefined;
      state.message = undefined;
      try { await refreshCatalog(state, true); }
      catch { /* The status response exposes the catalog error without discarding OAuth. */ }
    }).catch(error => {
      const message = errorMessage(error);
      state.status = controller.signal.aborted ? "disconnected" : "error";
      state.deviceCode = undefined;
      state.message = controller.signal.aborted ? undefined : message;
      state.login?.rejectReady(new Error(message));
    }).finally(() => {
      state.login = undefined;
    });
  }
  await login.ready;
  return getCodexOAuthTestStatus();
}

export async function logoutCodexOAuthTest() {
  const state = await getAccountState();
  state.login?.controller.abort(new DOMException("PoC 登录已取消", "AbortError"));
  await state.runtime.logout(providerId);
  state.models = [];
  state.catalogFetchedAt = 0;
  state.deviceCode = undefined;
  state.catalogError = undefined;
  state.message = undefined;
  state.login = undefined;
  state.status = "disconnected";
  return { status: state.status };
}

export async function getCodexOAuthTestModel(modelId: string) {
  requireCodexOAuthTest();
  const state = await getAccountState();
  const accountModels = await refreshCatalog(state);
  const accountModel = accountModels.find(item => item.model.id === modelId);
  if (!accountModel) throw Object.assign(new Error("所选 Codex 模型不在当前账号返回的模型目录中"), { status: 400 });
  const runtimeModel = state.runtime.getModel(providerId, modelId);
  if (!runtimeModel) throw Object.assign(new Error("Pi AI Codex 模型运行时未能加载所选模型"), { status: 503 });
  return { state, accountModel, runtimeModel, baseUrl: accountModel.model.baseUrl };
}

export const codexOAuthTestProviderId = providerId;
