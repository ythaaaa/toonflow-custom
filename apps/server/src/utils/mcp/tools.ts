import { resolveRequestLocale, runWithLocale, t } from "@/lib/i18n";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Request } from "express";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { realpath, stat, mkdir, readdir, readFile } from "@toonflow/file";
import { z } from "zod";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CanvasContext } from "@toonflow/tools-scaffold/runtime";
import type { McpTool } from "@toonflow/mcp";
import { createAgentTools } from "@/agent/tools";
import { run as runAgent } from "@/agent";
import conf from "@/utils/conf";
import { callControl, getConnection, listConnections } from "@/utils/mcp/control";
import { appOperations, runAppOperation, type InstallDetails } from "@/utils/mcp/operations";
import { listTools } from "@/utils/plugins/tools";
import { runPluginDevelopment } from "@/utils/plugins/development";
import { installMarketPlugin, installMarketPluginSchema, resolveMarketPlugin, searchPluginMarket, searchPluginMarketSchema } from "@/lib/pluginMarket";
import { isLocalHostRequest, isLocalWorkspaceRequest } from "@/utils/workspace";
import { isWithin, lockWorkspaceFiles, protectWorkspaceRoot, renameWorkspaceFile, removeWorkspaceFile, resolveWorkspacePath, writeWorkspaceFile } from "@/utils/workspace/files";
import { getRuntimePlatform } from "@/lib/platform";
import { thinkingLevels } from "@/lib/modelReasoning";
import {
  createEpisode as createDramaEpisode, createScene as createDramaScene, createShot as createDramaShot,
  listDramaProjects as listDramaProjectFiles, readEpisodeScript, saveEpisodeDraft, saveEpisodeScriptVersion, updateScriptReview,
  updateEpisode as updateDramaEpisode, updateScene as updateDramaScene, updateShot as updateDramaShot,
  type DramaEpisode, type DramaProject, type DramaScene, type DramaShot, type DramaWorkspaceFiles,
} from "@toonflow/drama-workspace";

const targetSchema = z.strictObject({ connectionId: z.uuid().optional(), directory: z.string().min(1).max(4096).optional(), canvasId: z.string().min(1).max(256).optional() });
const requestSchema = z.strictObject({ target: targetSchema.optional(), args: z.record(z.string(), z.unknown()) });
const localMcpRequest = new AsyncLocalStorage<boolean>();
export function runInMcpRequest<T>(request: Request, operation: () => T): T {
  // 逐次判定实际调用来源，不能沿用初始化 MCP 会话时的本机权限。
  const local = isLocalHostRequest(request) && !getRuntimePlatform().mobile
    && !Object.keys(request.headers).some(key => key === "forwarded" || key === "x-real-ip" || key.startsWith("x-forwarded-"));
  return localMcpRequest.run(local, () => runWithLocale(resolveRequestLocale(request.get("accept-language")), operation));
}

let authorizationController = new AbortController();
for (const key of ["settings.mcp.enabled", "settings.mcp.token"] as const) conf.onDidChange(key, () => {
  authorizationController.abort();
  authorizationController = new AbortController();
});

async function resolveDirectory(directory?: string) {
  if (!directory || !isAbsolute(directory)) throw new Error("请在 target.directory 指定绝对工作目录，或先打开项目");
  const path = await realpath(directory);
  if (!(await stat(path)).isDirectory()) throw new Error("工作目录不是文件夹");
  if (!getRuntimePlatform().local) {
    const root = await realpath(resolve(dirname(conf.path), "workspaces"));
    if (!isWithin(root, path)) throw new Error("服务器部署只能使用 data/workspaces 内的工作区");
  }
  return path;
}

async function resolveTarget(target: z.infer<typeof targetSchema> = {}, requireDirectory = true) {
  const requestedDirectory = target.directory ? await resolveDirectory(target.directory) : undefined;
  const connection = getConnection(target.connectionId, requestedDirectory);
  if (target.connectionId && requestedDirectory && connection?.state.directory !== requestedDirectory) throw new Error("目标页面的工作区已切换，请重新获取 getAppState");
  if (target.canvasId && connection?.state.canvasId !== target.canvasId) throw new Error("目标画布已切换，请重新获取 getAppState");
  const directory = requireDirectory ? requestedDirectory ?? await resolveDirectory(connection?.state.directory ?? undefined) : undefined;
  return { connection, directory };
}

async function getInstallTarget(target: z.infer<typeof targetSchema>, signal: AbortSignal) {
  const { connection } = await resolveTarget(target, false);
  if (!connection) throw new Error("请先打开 Toonflow 桌面或网页");
  if (!isLocalWorkspaceRequest(connection.response.req)) throw new Error(t`请在桌面端或服务器本机确认安装插件`);
  const directory = target.directory ? connection.state.directory ?? undefined : undefined;
  const installSignal = AbortSignal.any([signal, connection.signal]);
  installSignal.throwIfAborted();
  return {
    signal: installSignal,
    async confirm(details: InstallDetails) {
      const confirmed = await callControl(connection.id, "confirmPluginInstall", details, installSignal, directory);
      installSignal.throwIfAborted();
      if (confirmed !== true) throw new Error(`${t`安装插件`} · ${t`已取消`}`);
      return installSignal;
    },
  };
}

async function refreshResources(details: Record<string, unknown>, signal: AbortSignal) {
  const refreshErrors: string[] = [];
  for (const connection of listConnections()) {
    try { await callControl(connection.id, "refreshResources", details, signal); }
    catch (error) { refreshErrors.push(error instanceof Error ? error.message : String(error)); }
  }
  return refreshErrors.length ? { refreshErrors } : {};
}

function wrapTool(name: string, description: string, schema: object, execute: (args: Record<string, unknown>, target: z.infer<typeof targetSchema>, signal: AbortSignal) => Promise<unknown>): McpTool {
  // 插件 JSON Schema 的根引用在包裹后仍指向原来的参数对象。
  const argsSchema = JSON.parse(JSON.stringify(schema).replace(/"\$ref":"#(?=\/|")/g, '"$ref":"#/properties/args'));
  return {
    name, description,
    inputSchema: { type: "object", properties: { target: z.toJSONSchema(targetSchema), args: argsSchema }, required: ["args"], additionalProperties: false },
    async execute(input, signal) {
      const { args, target = {} } = requestSchema.parse(input);
      return execute(args, target, signal);
    },
  };
}

const uiSchemas = {
  openProject: z.strictObject({ directory: z.string().min(1).max(4096) }),
  switchPanel: z.strictObject({ panel: z.enum(["canvas", "document"]) }),
  getDocument: z.strictObject({}),
  openDocument: z.strictObject({ path: z.string().max(4096).optional(), canvasPath: z.string().max(4096).optional(), nodeId: z.string().max(256).optional(), handleId: z.string().max(256).optional() }),
  writeDocument: z.strictObject({ text: z.string().max(10_000_000), expectedText: z.string().max(10_000_000) }),
  getSettings: z.strictObject({}),
  updateSettings: z.strictObject({ patch: z.record(z.string(), z.json()).refine(patch => !["mcp", "stores"].some(key => Object.hasOwn(patch, key)), "不能通过 MCP 修改连接凭证或项目列表") }),
};
const uiDescriptions: Record<keyof typeof uiSchemas, string> = {
  openProject: "在目标 Toonflow 页面打开已有工作目录，并等待工作区就绪；操作前获取 getAppState 的 connectionId。",
  switchPanel: "切换工作区的 canvas 画布或 document 文档面板，先保存当前编辑。",
  getDocument: "读取当前文档内容和选择状态。writeDocument 必须携带本次读取的 text 作为 expectedText。",
  openDocument: "打开工作区中的文档文件(path)，或画布中的文本节点(canvasPath、nodeId，可选handleId)。",
  writeDocument: "通过文档编辑器保存当前文档；expectedText 必须匹配当前内容，防止覆盖用户新输入。",
  getSettings: "读取页面当前设置，访问凭证脱敏。",
  updateSettings: "合并保存指定顶层设置项，同时更新页面；不修改 mcp 凭证与 stores 项目列表，嵌套设置应先读取再合并。",
};

const dramaProjectSchema = z.strictObject({ projectId: z.string().min(1).max(256) });
const dramaEpisodeSchema = dramaProjectSchema.extend({ episodeId: z.string().min(1).max(256) });
const dramaManifestPath = (path: string) => path;

function dramaFiles(directory: string): DramaWorkspaceFiles {
  async function pathOf(path: string, allowMissingParents = false) {
    return (await resolveWorkspacePath(directory, path, allowMissingParents)).path;
  }
  return {
    async list(path = "") {
      const target = await pathOf(path);
      const entries = await readdir(target, { withFileTypes: true });
      return { entries: entries.filter(item => item.isFile() || item.isDirectory()).map(item => ({ name: item.name, path: path ? `${path}/${item.name}` : item.name, type: item.isDirectory() ? "directory" as const : "file" as const })) };
    },
    async readText(path) { return readFile(await pathOf(path), "utf8"); },
    async readJson<T>(path: string) { return JSON.parse(await readFile(await pathOf(path), "utf8")) as T; },
    async write(path, content, exclusive = false) {
      const target = await pathOf(path, true);
      await mkdir(dirname(target), { recursive: true });
      await writeWorkspaceFile(target, typeof content === "string" ? content : content instanceof Blob ? Buffer.from(await content.arrayBuffer()) : content instanceof ArrayBuffer ? Buffer.from(content) : content, exclusive);
    },
    async writeJson(path, content, exclusive = false) { return this.write(path, `${JSON.stringify(content, null, 2)}\n`, exclusive); },
    async mkdir(path) { await mkdir(await pathOf(path, true), { recursive: true }); },
  };
}

async function resolveDramaWorkspace(target: z.infer<typeof targetSchema>) {
  if (!target.directory) throw new Error("短剧业务工具必须显式提供 target.directory，以隔离工作区数据");
  return resolveDirectory(target.directory);
}

async function loadDramaProject(directory: string, projectId: string) {
  const files = dramaFiles(directory);
  const entry = (await listDramaProjectFiles(files)).find(item => item.project.id === projectId);
  if (!entry) throw new Error(`当前工作区不存在项目 ${projectId}`);
  if (entry.path !== ".toonflow/drama/project.json" && entry.path !== `.toonflow/drama/projects/${entry.project.id}/project.json`) throw new Error("短剧项目索引 ID 与其工作区目录不匹配");
  const projectRoot = entry.path.replace(/\/project\.json$/, "");
  const scriptRoot = `${projectRoot}/scripts/`;
  const scriptPaths = [
    ...entry.project.episodes.flatMap(episode => [episode.draftPath, episode.scriptPath]),
    ...Object.values(entry.project.scriptVersions).flatMap(versions => versions.map(version => version.path)),
  ].filter((path): path is string => Boolean(path));
  if (scriptPaths.some(path => !path.startsWith(scriptRoot) || path.split("/").some(part => part === ".."))) throw new Error("短剧项目包含指向项目目录之外的剧本路径，已拒绝访问");
  return { files, project: entry.project, manifestPath: dramaManifestPath(entry.path) };
}

async function withDramaWriteLock<T>(directory: string, operation: () => Promise<T>) {
  const dramaPath = (await resolveWorkspacePath(directory, ".toonflow/drama", true)).path;
  const release = lockWorkspaceFiles([dramaPath]);
  try { return await operation(); }
  finally { release(); }
}

function requireEpisode(project: DramaProject, episodeId: string): DramaEpisode {
  const episode = project.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error(`当前项目不存在剧集 ${episodeId}`);
  return episode;
}

const dramaSceneFields = {
  heading: z.string().max(1000).optional(), time: z.string().max(100).optional(), location: z.string().max(1000).optional(),
  interiorExterior: z.enum(["内景", "外景"]).optional(), dayPart: z.enum(["白天", "夜晚", "黄昏", "清晨"]).optional(),
  characters: z.array(z.string().max(200)).max(100).optional(), charactersText: z.string().max(4000).optional(), description: z.string().max(20000).optional(),
  sourceScriptVersionId: z.string().max(256).optional(), archived: z.boolean().optional(), order: z.number().int().positive().optional(),
};
const dramaSceneCreateFields = { ...dramaSceneFields };
delete (dramaSceneCreateFields as Partial<typeof dramaSceneFields>).archived;
delete (dramaSceneCreateFields as Partial<typeof dramaSceneFields>).order;
const dramaShotFields = {
  sceneId: z.string().min(1).max(256).optional(), description: z.string().max(20000).optional(), action: z.string().max(10000).optional(), expression: z.string().max(4000).optional(),
  size: z.string().max(200).optional(), angle: z.string().max(200).optional(), composition: z.string().max(4000).optional(), movement: z.string().max(4000).optional(),
  dialogue: z.string().max(10000).optional(), sound: z.string().max(4000).optional(), duration: z.number().min(0).max(3600).optional(),
  imagePrompt: z.string().max(20000).optional(), videoPrompt: z.string().max(20000).optional(), referencePath: z.string().max(4096).optional(),
  firstFrameAssetId: z.string().max(256).optional(), lastFrameAssetId: z.string().max(256).optional(), referenceAssetIds: z.array(z.string().max(256)).max(100).optional(), aspectRatio: z.string().regex(/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/).max(32).optional(),
  productionStatus: z.enum(["待制作", "制作中", "已完成"]).optional(), reviewStatus: z.enum(["草稿", "待审核", "已确认", "已归档"]).optional(), status: z.enum(["草稿", "待审核", "已确认", "已归档"]).optional(), order: z.number().int().positive().optional(),
};

function getDramaTools(): McpTool[] {
  const tools: McpTool[] = [];
  const add = (name: string, description: string, schema: z.ZodType, execute: (args: any, directory: string, signal: AbortSignal) => Promise<unknown>) => {
    tools.push(wrapTool(name, description, z.toJSONSchema(schema), async (args, target, signal) => execute(schema.parse(args), await resolveDramaWorkspace(target), signal)));
  };
  add("listDramaProjects", "列出 target.directory 工作区中的短剧项目摘要。必须明确指定工作区。", z.strictObject({}), async (_args, directory) => (await listDramaProjectFiles(dramaFiles(directory))).map(({ project }) => ({ id: project.id, name: project.name, genre: project.genre, style: project.style, seasons: project.seasons.length, episodes: project.episodes.length, updatedAt: project.updatedAt })));
  add("getDramaProject", "读取指定工作区内 projectId 对应的短剧项目结构。", dramaProjectSchema, async ({ projectId }, directory) => (await loadDramaProject(directory, projectId)).project);
  add("listEpisodes", "列出指定项目的剧集，可按 seasonId 筛选。", dramaProjectSchema.extend({ seasonId: z.string().max(256).optional() }), async ({ projectId, seasonId }, directory) => {
    const { project } = await loadDramaProject(directory, projectId);
    return project.episodes.filter(item => !seasonId || item.seasonId === seasonId).map(({ id, seasonId: sid, number, title, outline, scriptVersion, formalVersionId, status }) => ({ id, seasonId: sid, number, title, outline, scriptVersion, formalVersionId, status }));
  });
  add("getEpisode", "读取指定项目中的单集结构及稳定的场景、镜头 ID。", dramaEpisodeSchema, async ({ projectId, episodeId }, directory) => { const { project } = await loadDramaProject(directory, projectId); return requireEpisode(project, episodeId); });
  add("getEpisodeScripts", "读取工作稿和全部历史正式/草稿版本内容；工作稿与正式版本分开返回。", dramaEpisodeSchema, async ({ projectId, episodeId }, directory) => {
    const { files, project, manifestPath } = await loadDramaProject(directory, projectId);
    const episode = requireEpisode(project, episodeId);
    const draft = await readEpisodeScript(files, project, episodeId, manifestPath);
    const versions = await Promise.all((project.scriptVersions[episodeId] ?? []).map(async version => ({ ...version, formal: episode.formalVersionId === version.id, content: await files.readText(version.path) })));
    return { episodeId, formalVersionId: episode.formalVersionId ?? null, draftPath: episode.draftPath ?? null, draft, versions };
  });
  add("getEpisodeScenes", "读取指定剧集的场景列表。", dramaEpisodeSchema, async ({ projectId, episodeId }, directory) => requireEpisode((await loadDramaProject(directory, projectId)).project, episodeId).scenes);
  add("getEpisodeShots", "读取指定剧集的镜头列表，包含提示词、时长、画幅及素材关联字段。", dramaEpisodeSchema, async ({ projectId, episodeId }, directory) => requireEpisode((await loadDramaProject(directory, projectId)).project, episodeId).shots);
  add("getDramaAssets", "读取指定项目的素材与人物参考目录。", dramaProjectSchema, async ({ projectId }, directory) => { const { project } = await loadDramaProject(directory, projectId); return { assets: project.assets, characters: project.characters }; });
  add("saveEpisodeDraft", "保存指定剧集的工作稿并执行文件与项目索引回读校验；不修改正式版本。", dramaEpisodeSchema.extend({ content: z.string().max(2_000_000) }), async ({ projectId, episodeId, content }, directory) => withDramaWriteLock(directory, async () => { const { files, project, manifestPath } = await loadDramaProject(directory, projectId); const path = await saveEpisodeDraft(files, project, episodeId, content, manifestPath); return { episodeId, draftPath: path, verified: (await files.readText(path)) === content, formalVersionId: project.episodes.find(item => item.id === episodeId)?.formalVersionId ?? null }; }));
  add("createScriptVersion", "创建新的历史剧本版本，不覆盖已有版本；新版本初始状态为草稿，设为正式版须走 Toonflow 审核确认流程。", dramaEpisodeSchema.extend({ content: z.string().max(2_000_000) }), async ({ projectId, episodeId, content }, directory) => withDramaWriteLock(directory, async () => { const { files, project, manifestPath } = await loadDramaProject(directory, projectId); const version = await saveEpisodeScriptVersion(files, project, episodeId, content, manifestPath); return { episodeId, version, formalVersionId: project.episodes.find(item => item.id === episodeId)?.formalVersionId ?? null, verified: (await files.readText(version.path)) === content }; }));
  add("confirmScriptVersion", "将指定剧集中的历史版本设为正式版。该操作独立于保存工作稿和创建版本；旧正式版本会按现有规则归档。", dramaEpisodeSchema.extend({ versionId: z.string().min(1).max(256), confirmed: z.literal(true) }), async ({ projectId, episodeId, versionId }, directory) => withDramaWriteLock(directory, async () => { const { files, project, manifestPath } = await loadDramaProject(directory, projectId); await updateScriptReview(files, project, episodeId, versionId, "已确认", manifestPath); const saved = (await loadDramaProject(directory, projectId)).project; const formalVersionId = saved.episodes.find(item => item.id === episodeId)?.formalVersionId; return { episodeId, formalVersionId, verified: formalVersionId === versionId }; }));
  add("createEpisode", "在指定季度创建剧集，自动分配稳定 ID 与季度内集数。", dramaProjectSchema.extend({ seasonId: z.string().min(1).max(256), title: z.string().max(500).optional(), outline: z.string().max(20000).optional() }), async ({ projectId, seasonId, title, outline }, directory) => withDramaWriteLock(directory, async () => { const data = await loadDramaProject(directory, projectId); return { episode: await createDramaEpisode(data.files, data.project, seasonId, { title, outline }, data.manifestPath), verified: true }; }));
  add("updateEpisode", "更新剧集标题、大纲或非正式状态；正式状态只能通过 confirmScriptVersion 设置。", dramaEpisodeSchema.extend({ title: z.string().max(500).optional(), outline: z.string().max(20000).optional(), status: z.enum(["草稿", "待审核", "已归档"]).optional() }), async ({ projectId, episodeId, title, outline, status }, directory) => withDramaWriteLock(directory, async () => { const data = await loadDramaProject(directory, projectId); return { episode: await updateDramaEpisode(data.files, data.project, episodeId, { title, outline, status }, data.manifestPath), verified: true }; }));
  add("createScene", "在指定剧集创建场景，系统分配稳定 ID 和顺序号。", dramaEpisodeSchema.extend(dramaSceneCreateFields), async ({ projectId, episodeId, ...input }, directory) => withDramaWriteLock(directory, async () => { const data = await loadDramaProject(directory, projectId); return { scene: await createDramaScene(data.files, data.project, episodeId, input, data.manifestPath), verified: true }; }));
  add("updateScene", "按稳定 sceneId 更新指定剧集中的场景，不允许跨剧集写入。", dramaEpisodeSchema.extend({ sceneId: z.string().min(1).max(256), ...dramaSceneFields }), async ({ projectId, episodeId, sceneId, ...patch }, directory) => withDramaWriteLock(directory, async () => { const data = await loadDramaProject(directory, projectId); return { scene: await updateDramaScene(data.files, data.project, episodeId, sceneId, patch, data.manifestPath), verified: true }; }));
  add("createShot", "在指定剧集和场景创建镜头，系统分配稳定 ID 与镜号。", dramaEpisodeSchema.extend({ ...dramaShotFields, sceneId: z.string().min(1).max(256) }), async ({ projectId, episodeId, ...input }, directory) => withDramaWriteLock(directory, async () => { const data = await loadDramaProject(directory, projectId); return { shot: await createDramaShot(data.files, data.project, episodeId, input, data.manifestPath), verified: true }; }));
  add("updateShot", "按稳定 shotId 更新指定剧集中的镜头；关联场景必须属于同一剧集。", dramaEpisodeSchema.extend({ shotId: z.string().min(1).max(256), ...dramaShotFields }), async ({ projectId, episodeId, shotId, ...patch }, directory) => withDramaWriteLock(directory, async () => { const data = await loadDramaProject(directory, projectId); return { shot: await updateDramaShot(data.files, data.project, episodeId, shotId, patch, data.manifestPath), verified: true }; }));
  const batchSchema = z.strictObject({ operations: z.array(z.strictObject({ tool: z.enum(["saveEpisodeDraft", "createScriptVersion", "confirmScriptVersion", "createEpisode", "updateEpisode", "createScene", "updateScene", "createShot", "updateShot"]), args: z.record(z.string(), z.unknown()) })).min(1).max(25) });
  tools.push(wrapTool("applyDramaBatch", "在同一工作区、同一项目内顺序执行最多25项短剧写操作；每项单独回读核验，失败时停止后续操作并返回已完成、失败与未执行项。此操作不提供跨多个文件的事务回滚。", z.toJSONSchema(batchSchema), async (raw, target, signal) => {
    const { operations } = batchSchema.parse(raw);
    const directory = await resolveDramaWorkspace(target);
    const projectIds = new Set(operations.map(item => item.args.projectId).filter((id): id is string => typeof id === "string"));
    if (projectIds.size !== 1 || operations.some(item => typeof item.args.projectId !== "string")) throw new Error("批量写入必须为每项提供同一个 projectId");
    const results: { index: number; tool: string; status: "verified" | "failed"; result?: unknown; error?: string }[] = [];
    for (const [index, operation] of operations.entries()) {
      signal.throwIfAborted();
      const tool = tools.find(item => item.name === operation.tool);
      try {
        if (!tool) throw new Error("短剧写工具不存在");
        const result = await tool.execute({ target: { directory }, args: operation.args }, signal);
        results.push({ index, tool: operation.tool, status: "verified", result });
      } catch (error) {
        results.push({ index, tool: operation.tool, status: "failed", error: error instanceof Error ? error.message : String(error) });
        break;
      }
    }
    return { results, completed: results.filter(item => item.status === "verified").length, failed: results.filter(item => item.status === "failed").length, notRun: operations.length - results.length, partialWritesPossible: results.some(item => item.status === "verified") && results.some(item => item.status === "failed") };
  }));
  return tools;
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    // 自定义鉴权头没有固定名称，保留头名并隐藏所有非空值。
    if (key === "headers" && item && typeof item === "object" && !Array.isArray(item)) {
      return [key, Object.fromEntries(Object.entries(item).map(([name, header]) => [name, header ? "[REDACTED]" : header]))];
    }
    return [key, /(?:api.?key|access.?token|refresh.?token|password|secret|authorization)$|^token$/i.test(key) ? (item ? "[REDACTED]" : "") : redactSecrets(item)];
  }));
}

async function assertFileNotOpen(directory: string, path: string) {
  const target = (await resolveWorkspacePath(directory, relative(directory, resolve(directory, path)), true)).path;
  for (const { state } of listConnections()) {
    if (state.directory !== directory) continue;
    const document = state.document as { selection?: { filePath?: string; canvasPath?: string } } | undefined;
    const openPaths = [state.canvasId, document?.selection?.filePath, document?.selection?.canvasPath];
    for (const file of openPaths) {
      if (!file) continue;
      const opened = (await resolveWorkspacePath(directory, relative(directory, resolve(directory, file)), true)).path;
      if (isWithin(target, opened)) throw new Error("文件正在 Toonflow 中打开，请使用画布或文档工具修改，关闭后再执行文件操作");
    }
  }
}

export async function getMcpTools(): Promise<McpTool[]> {
  const authorizationSignal = authorizationController.signal;
  let pluginError: string | undefined;
  const tools: McpTool[] = [{
    name: "getAppState", description: t`列出连接的 Toonflow 页面及其 connectionId、工作目录、画布、项目列表和节点能力。控制多个页面时用 target.connectionId 明确操作对象。市场搜索无需连接页面，服务端工作区工具可显式指定 target.directory。`,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      const workspaceRoot = resolve(dirname(conf.path), "workspaces");
      await mkdir(workspaceRoot, { recursive: true });
      return { connections: listConnections(), workspaceRoot, ...(pluginError ? { pluginError } : {}) };
    },
  }];
  tools.push(wrapTool("searchPluginMarket", t`搜索 Toonflow 插件市场，返回可用于申请安装的插件 ID。`, z.toJSONSchema(searchPluginMarketSchema, { io: "input" }), async (args, _target, signal) =>
    searchPluginMarket(args, signal)));
  tools.push(wrapTool("installMarketPlugin", t`按市场插件 ID 向目标 Toonflow 页面请求安装，用户允许后下载并安装。`, z.toJSONSchema(installMarketPluginSchema), async (args, target, signal) => {
    const page = await getInstallTarget(target, signal);
    const plugin = resolveMarketPlugin(args, page.signal);
    const source = [t`插件市场`, plugin.supplier, plugin.fileName].filter(Boolean).join(" · ");
    await page.confirm({ name: `${plugin.name} (${plugin.identifier})`, type: plugin.type, version: plugin.version, source });
    const result = await installMarketPlugin(plugin, page.signal);
    return { ...result, ...await refreshResources(result, signal) };
  }));
  for (const [name, schema] of Object.entries(uiSchemas)) {
    tools.push(wrapTool(name, uiDescriptions[name as keyof typeof uiSchemas], z.toJSONSchema(schema), async (input, target, signal) => {
      const args = schema.parse(input);
      const { connection, directory } = await resolveTarget(target, !["openProject", "getSettings", "updateSettings"].includes(name));
      if (!connection) throw new Error("请先打开 Toonflow 桌面或网页");
      if (name === "openProject") await resolveDirectory((args as { directory: string }).directory);
      const result = await callControl(connection.id, name, args, signal, directory);
      return name === "getSettings" || name === "updateSettings" ? redactSecrets(result) : result;
    }));
  }
  const canvasStub: CanvasContext = { id: "mcp", tools: [], async call() { throw new Error("尚未绑定画布"); } };
  // ACT: 插件损坏时仍保留应用管理工具，允许读取错误并修复插件。
  const definitions = await createAgentTools(dirname(conf.path), canvasStub, undefined, false).catch(error => {
    pluginError = error instanceof Error ? error.message : String(error);
    return [];
  });
  for (const definition of definitions) {
    if (definition.name === "searchPluginMarket" || definition.name === "installMarketPlugin") continue;
    if (tools.some(tool => tool.name === definition.name)) throw new Error(t`MCP 工具名称重复：${definition.name}`);
    tools.push(wrapTool(definition.name, [definition.description, ...(definition.promptGuidelines ?? [])].join("\n"), definition.parameters, async (args, target, signal) => {
      if (definition.name === "developPlugin" && localMcpRequest.getStore() && !target.connectionId && !target.canvasId
        && (args.action === "guide" || (args.action === "build" && target.directory))) {
        const directory = target.directory ? await resolveDirectory(target.directory) : "";
        const details = await runPluginDevelopment(directory, args, signal);
        return { content: [{ type: "text", text: JSON.stringify(details ?? null) }], details };
      }
      const { connection, directory } = await resolveTarget(target);
      if (["write", "edit"].includes(definition.name) && typeof args.path === "string") await assertFileNotOpen(directory!, args.path);
      const canvas: CanvasContext | undefined = connection ? {
        id: connection.state.canvasId ?? "mcp", tools: connection.state.tools,
        call: (request, callSignal) => callControl(connection.id, request.name, request.args, callSignal ?? signal, directory),
      } : undefined;
      const current = (await createAgentTools(directory!, canvas, undefined, false)).find(tool => tool.name === definition.name);
      if (!current) throw new Error("工具已禁用，或所需 Toonflow 页面未连接，请重新读取工具列表");
      // ACT: 现有插件依赖 createTools 注入的宿主能力；MCP 没有 Pi 对话，访问会话能力时明确报错。
      const context = new Proxy({ cwd: directory, mode: "rpc", hasUI: false, model: undefined, signal }, {
        get(value, key) { if (Reflect.has(value, key)) return Reflect.get(value, key); throw new Error(t`MCP 不提供内置 Agent 会话能力：${String(key)}`); },
      }) as unknown as ExtensionContext;
      return current.execute(crypto.randomUUID(), args, signal, undefined, context);
    }));
  }
  tools.push(...getDramaTools());
  const fileSchema = z.strictObject({
    action: z.enum(["list", "mkdir", "rename", "remove", "readBinary", "writeBinary"]), path: z.string().max(4096).default(""),
    target: z.string().max(4096).optional(), recursive: z.boolean().default(false),
    base64: z.string().max(28_000_000).base64().optional(), exclusive: z.boolean().default(true),
  });
  tools.push(wrapTool("workspaceFiles", "列出、创建目录、重命名或删除工作区文件；readBinary/writeBinary通过base64传输不超过20MB的媒体，写入默认不覆盖。文本读写复用已启用的文件工具；打开中的画布或文档必须通过专门工具修改。", z.toJSONSchema(fileSchema, { io: "input" }), async (input, target, signal) => {
    const args = fileSchema.parse(input);
    const workspaceTool = (await listTools()).find(tool => tool.name === "workspace");
    if (!workspaceTool?.enabled || workspaceTool.loadError) throw new Error("工作区文件工具未启用或加载失败");
    if (!["list", "readBinary"].includes(args.action) && "readOnly" in workspaceTool.config && workspaceTool.config.readOnly === true) throw new Error("当前工作区文件工具为只读模式");
    const { directory } = await resolveTarget(target);
    const source = await resolveWorkspacePath(directory!, args.path);
    signal.throwIfAborted();
    if (args.action === "list") return (await readdir(source.path, { withFileTypes: true })).filter(item => item.isFile() || item.isDirectory()).map(item => ({ name: item.name, type: item.isDirectory() ? "directory" : "file" }));
    if (args.action === "readBinary") {
      const info = await stat(source.path);
      if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error("文件必须是不超过20MB的普通文件");
      return { path: args.path, base64: (await readFile(source.path, { signal })).toString("base64") };
    }
    protectWorkspaceRoot(directory!, source.path);
    await assertFileNotOpen(directory!, args.path);
    const destination = args.action === "rename" && args.target ? await resolveWorkspacePath(directory!, args.target) : undefined;
    if (args.action === "rename" && !destination) throw new Error("重命名需要提供 args.target");
    if (destination) {
      protectWorkspaceRoot(directory!, destination.path);
      destination.path = resolve(dirname(destination.path), basename(resolve(directory!, args.target!)));
    }
    const release = lockWorkspaceFiles([source.path, ...(destination ? [destination.path] : [])]);
    try {
      if (args.action === "writeBinary") {
        if (args.base64 === undefined) throw new Error("写入二进制文件需要 base64");
        const bytes = Buffer.from(args.base64, "base64");
        if (bytes.length > 20 * 1024 * 1024) throw new Error("文件不能超过20MB");
        await writeWorkspaceFile(source.path, bytes, args.exclusive);
      } else if (args.action === "mkdir") await mkdir(source.path);
      else if (destination) await renameWorkspaceFile(source.path, destination.path);
      else await removeWorkspaceFile(directory!, source.path, args.recursive);
    } finally { release(); }
    return { success: true };
  }));
  tools.push(wrapTool("listAppOperations", "按需查询插件、媒体供应商、素材库和 Agent 历史管理操作及其参数。先查询 schema，再调用 appOperation。", z.toJSONSchema(z.strictObject({ name: z.string().optional() })), async args => {
    return appOperations.filter(item => !args.name || item.name === args.name).map(({ name, description, parameters, path }) => {
      const schema = z.toJSONSchema(parameters);
      if (path.startsWith("/api/agent/")) {
        delete schema.properties?.directory;
        schema.required = schema.required?.filter(key => key !== "directory");
      }
      return { name, description, parameters: schema };
    });
  }));
  tools.push(wrapTool("appOperation", "执行 listAppOperations 公布的应用管理操作，parameters 必须符合对应 schema。文件与节点操作使用专门工具；安装来源、覆盖和卸载须符合用户请求。", z.toJSONSchema(z.strictObject({ name: z.string(), parameters: z.record(z.string(), z.json()) })), async (args, target, signal) => {
    const operation = appOperations.find(item => item.name === args.name);
    if (!operation) throw new Error("应用操作不存在，请查询 listAppOperations");
    const parameters = { ...args.parameters as Record<string, unknown> };
    if (operation.path.startsWith("/api/agent/")) parameters.directory = (await resolveTarget(target)).directory;
    const result = await runAppOperation(operation.name, parameters, signal, async details => (await getInstallTarget(target, signal)).confirm(details));
    let refresh = {};
    if (operation.refresh) {
      const name = operation.refresh.nameField ? parameters[operation.refresh.nameField] : (result as { name?: string } | null)?.name;
      refresh = await refreshResources({ type: operation.refresh.type, name,
        ...(operation.name === "deleteMediaProvider" ? { removedProviderId: (parameters.fileName as string).slice(0, -3) } : {}),
      }, signal);
    }
    return { result: redactSecrets(result), ...refresh };
  }));
  const runAgentSchema = z.strictObject({
    prompt: z.string().trim().min(1), providerId: z.string().min(1), modelId: z.string().min(1),
    sessionFile: z.string().regex(/^[\w-]+\.jsonl$/).optional(), thinkingLevel: z.enum(thinkingLevels).optional(),
  });
  tools.push(wrapTool("runAgent", "按用户请求调用 Toonflow 内置 Agent，等待本轮完成并返回对话文件与回复；会使用配置的模型。外部 Agent 可直接操作其他工具，仅需要委托内置 Agent 时调用。支持 MCP 取消，历史保存到工作区。", z.toJSONSchema(runAgentSchema), async (input, target, signal) => {
    const args = runAgentSchema.parse(input);
    const { directory, connection } = await resolveTarget(target);
    const canvas: CanvasContext | undefined = connection ? {
      id: connection.state.canvasId ?? "mcp", tools: connection.state.tools,
      call: (request, callSignal) => callControl(connection.id, request.name, request.args, callSignal ?? signal, directory),
    } : undefined;
    const blocks = new Map<string, string>();
    let sessionFile = args.sessionFile;
    await runAgent({ ...args, cwd: directory!, canvas, signal }, event => {
      if (event.type === "session") sessionFile = event.file;
      if (event.type === "text") blocks.set(event.blockId, event.content ?? (blocks.get(event.blockId) ?? "") + (event.delta ?? ""));
    });
    return { sessionFile, text: [...blocks.values()].join("\n") };
  }));
  return tools.map(tool => ({
    ...tool,
    execute(input, signal) {
      const requestSignal = AbortSignal.any([signal, authorizationSignal]);
      requestSignal.throwIfAborted();
      return tool.execute(input, requestSignal);
    },
  }));
}
