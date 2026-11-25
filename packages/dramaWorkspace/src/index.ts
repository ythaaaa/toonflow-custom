export type DramaStatus = "草稿" | "待审核" | "已确认" | "已归档";
export type DramaProductionStatus = "待制作" | "制作中" | "已完成";
export type DramaWorkspaceFiles = {
  list(path?: string): Promise<{ entries: { name: string; path: string; type: "file" | "directory" }[] }>;
  readText(path: string): Promise<string>;
  readJson<T = unknown>(path: string): Promise<T>;
  write(path: string, content: string | Blob | ArrayBuffer, exclusive?: boolean): Promise<void>;
  writeJson(path: string, content: unknown, exclusive?: boolean): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string, recursive?: boolean): Promise<void>;
};
export type DramaSeason = { id: string; name: string; episodes: string[] };
export type DramaEpisode = { id: string; seasonId: string; number: number; title: string; outline: string; scriptVersion: number; scriptPath?: string; draftPath?: string; formalVersionId?: string; characterIds?: string[]; status: DramaStatus; scenes: DramaScene[]; shots: DramaShot[] };
export type DramaScene = { id: string; number: number; order?: number; archived?: boolean; sourceScriptVersionId?: string; heading: string; time: string; location: string; interiorExterior?: "内景" | "外景"; dayPart?: "白天" | "夜晚" | "黄昏" | "清晨"; characters: string[]; charactersText: string; description: string; environment?: string; color?: string; layout?: string; prompt?: string; referenceAssetId?: string };
export type DramaShot = { id: string; number: string; order?: number; archived?: boolean; sceneId: string; characterIds?: string[]; startTime?: string; endTime?: string; description: string; action: string; expression: string; size: string; angle: string; composition?: string; movement: string; dialogue: string; sound: string; duration: number; imagePrompt?: string; videoPrompt?: string; referencePath: string; firstFrameAssetId?: string; lastFrameAssetId?: string; referenceAssetIds?: string[]; aspectRatio?: string; productionStatus?: DramaProductionStatus; reviewStatus?: DramaStatus; status: DramaStatus };
export type DramaCharacter = { id: string; archived?: boolean; name: string; description: string; appearance: string; identity?: string; outfit?: string; visualFeatures?: string[]; prompt?: string; referencePath: string; version: number };
export type DramaAsset = { id: string; kind: "scene" | "prop" | "image"; name: string; description: string; referencePath: string; version: number;
  generatedBy?: "gptImageSubscription"; modelId?: string; generatedAt?: string; requestedAspectRatio?: string; width?: number; height?: number;
  referenceAssetIds?: string[]; projectId?: string; episodeId?: string; sceneId?: string; shotId?: string; characterId?: string };
export type DramaScriptMetadata = { title: string; projectName: string; episodeNumber: number; duration: number; aspectRatio: string; narrativePerspective: string; summary: string };
export type DramaScriptCharacter = { key: string; name: string; identity: string; appearance: string; outfit: string; visualFeatures: string[]; prompt: string };
export type DramaScriptScene = { key: string; name: string; location: string; time: string; interiorExterior: "内景" | "外景"; dayPart: "白天" | "夜晚" | "黄昏" | "清晨"; environment: string; color: string; layout: string; prompt: string; characterKeys: string[] };
export type DramaScriptShot = { number: string; title: string; startTime: string; endTime: string; duration: number; sceneKey: string; characterKeys: string[]; size: string; camera: string; movement: string; action: string; visualDescription: string; sound: string; imagePrompt: string; h3Prompt: string };
export type DramaReferenceRequirement = { kind: "character" | "scene" | "prop" | "shot"; name: string; description: string; characterKeys: string[]; sceneKeys: string[]; shotNumbers: string[] };
export type DramaContinuityConstraint = { category: "character" | "costume" | "prop" | "layout" | "color" | "camera" | "sound" | "other"; description: string; shotNumbers: string[] };
export type DramaPendingQuestion = { id: string; question: string; options: string[]; reason: string };
export type DramaScriptAnalysis = {
  metadata: DramaScriptMetadata;
  characters: DramaScriptCharacter[];
  scenes: DramaScriptScene[];
  shots: DramaScriptShot[];
  referenceAssets: DramaReferenceRequirement[];
  continuityConstraints: DramaContinuityConstraint[];
  pendingQuestions: DramaPendingQuestion[];
};
export type DramaScriptVersion = { id: string; version: number; path: string; createdAt: string; status: DramaStatus; sourceName?: string; sourceFormat?: "txt" | "md"; sourceFingerprint?: string; analysis?: DramaScriptAnalysis };
export type DramaScriptImportInput = { sourceName: string; sourceText: string; sourceFingerprint: string; analysis: DramaScriptAnalysis };
export type DramaScriptImportResult = { deduplicated: boolean; scriptVersionId: string; characterIds: string[]; sceneIds: string[]; shotIds: string[] };
export type DramaProject = { schemaVersion: 1; id: string; name: string; genre: string; style: string; storyOutline: string; targetEpisodes: number; targetDuration: number; createdAt: string; updatedAt: string; seasons: DramaSeason[]; episodes: DramaEpisode[]; characters: DramaCharacter[]; assets: DramaAsset[]; scriptVersions: Record<string, DramaScriptVersion[]> };
export type DramaProjectEntry = { project: DramaProject; path: string; storage: "legacy" | "isolated" };

const legacyManifestPath = ".toonflow/drama/project.json";
const dataPath = ".toonflow/drama";
const projectIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function isMissingError(error: unknown) {
  return error instanceof Error && /404|ENOENT|不存在/i.test(error.message);
}

function validateProjectIdentity(project: DramaProject, path: string) {
  if (project.schemaVersion !== 1 || !projectIdPattern.test(project.id) || !project.name?.trim()
    || !Array.isArray(project.seasons) || !Array.isArray(project.episodes) || !Array.isArray(project.characters) || !Array.isArray(project.assets)) {
    throw new Error(`短剧项目文件格式无效：${path}`);
  }
  if (path !== legacyManifestPath && path !== `${dataPath}/projects/${project.id}/project.json`) {
    throw new Error(`短剧项目目录与稳定 ID 不一致：${path}`);
  }
}

async function ensureDirectory(files: DramaWorkspaceFiles, path: string) {
  if (!path.startsWith(`${dataPath}/`)) throw new Error(`短剧目录超出数据边界：${path}`);
  let current = "";
  for (const part of path.split("/").filter(Boolean)) {
    const entries = await files.list(current);
    const existing = entries.entries.find(entry => entry.name === part);
    current = current ? `${current}/${part}` : part;
    if (existing?.type === "directory") continue;
    if (existing) throw new Error(`目标路径不是目录：${current}`);
    await files.mkdir(current);
  }
}

function normalizeDramaProject(project: DramaProject) {
  project.scriptVersions ??= {};
  for (const episode of project.episodes) {
    episode.scenes ??= [];
    episode.shots ??= [];
    const versions = project.scriptVersions[episode.id] ??= [];
    if (episode.scriptPath && !versions.some(item => item.path === episode.scriptPath)) {
      versions.push({ id: `legacy-${episode.id}-${episode.scriptVersion}`, version: episode.scriptVersion, path: episode.scriptPath, createdAt: project.updatedAt, status: episode.status ?? "草稿" });
    }
    for (const version of versions) version.id ??= `legacy-${episode.id}-${version.version}`;
    if (!episode.formalVersionId) episode.formalVersionId = versions.find(item => item.status === "已确认")?.id;
    episode.scenes.forEach((scene, index) => { scene.order ??= index + 1; scene.archived ??= false; });
    project.characters.forEach(character => { character.archived ??= false; });
    episode.shots.forEach((shot, index) => {
      shot.order ??= index + 1;
      shot.archived ??= false;
      shot.reviewStatus ??= shot.status ?? "草稿";
      shot.productionStatus ??= "待制作";
    });
  }
  return project;
}

function getProjectRoot(manifestPath: string) {
  return manifestPath === legacyManifestPath ? dataPath : manifestPath.replace(/\/project\.json$/, "");
}

function cloneProject(project: DramaProject) {
  return JSON.parse(JSON.stringify(project)) as DramaProject;
}

async function saveProjectSnapshot(files: DramaWorkspaceFiles, project: DramaProject, manifestPath: string) {
  const snapshot = cloneProject(project);
  snapshot.name = snapshot.name.trim();
  validateProjectIdentity(snapshot, manifestPath);
  const stored = await files.readJson<DramaProject>(manifestPath);
  if (stored.id !== snapshot.id) throw new Error("项目稳定 ID 与磁盘记录不一致，已停止覆盖");
  snapshot.updatedAt = new Date().toISOString();
  await files.writeJson(manifestPath, snapshot);
  const saved = await files.readJson<DramaProject>(manifestPath);
  if (JSON.stringify(saved) !== JSON.stringify(snapshot)) throw new Error("项目索引回读校验失败；磁盘内容已保留，请重新载入后再试");
  Object.assign(project, snapshot);
}

export async function readEpisodeScript(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, manifestPath = legacyManifestPath) {
  const episode = project.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error("目标分集不存在");
  const projectRoot = getProjectRoot(manifestPath);
  const normalizePath = (value: string) => {
    let path = value.replaceAll("\\", "/").replace(/^\.\//, "");
    const projectPrefix = `${projectRoot}/`;
    const projectPathIndex = path.indexOf(projectPrefix);
    if (projectPathIndex >= 0) path = path.slice(projectPathIndex);
    else if (path.startsWith("/")) {
      const dramaPathIndex = path.indexOf(`${dataPath}/`);
      if (dramaPathIndex < 0) return;
      path = path.slice(dramaPathIndex);
    } else if (!path.startsWith(`${dataPath}/`)) path = `${projectRoot}/${path}`;
    if (path.split("/").some(part => part === ".." || /[<>:\"|?*\x00-\x1f]/.test(part))) return;
    return path;
  };
  const defaultDraftPath = `${projectRoot}/scripts/${episode.id}/draft.md`;
  const candidates = [...new Set([episode.draftPath ?? defaultDraftPath, episode.scriptPath].filter((path): path is string => !!path)
    .map(normalizePath).filter((path): path is string => !!path))];
  for (const path of candidates) {
    const separator = path.lastIndexOf("/");
    const parent = separator < 0 ? "" : path.slice(0, separator);
    const name = separator < 0 ? path : path.slice(separator + 1);
    try {
      const { entries } = await files.list(parent);
      if (entries.find(item => item.name === name)?.type !== "file") continue;
      const content = await files.readText(path);
      if (path === episode.draftPath || path === defaultDraftPath) episode.draftPath = path;
      return content;
    } catch (error) {
      if (!isMissingError(error)) throw error;
    }
  }
  if (episode.draftPath || episode.scriptPath) throw new Error("当前集的剧本路径无效或对应文件不存在，请检查项目数据目录");
  return "";
}

export async function listDramaProjects(files: DramaWorkspaceFiles) {
  const root = `${dataPath}/projects`;
  const paths = [legacyManifestPath];
  try {
    const { entries } = await files.list(root);
    for (const entry of entries) {
      if (entry.type !== "directory") continue;
      const projectPath = `${root}/${entry.name}/project.json`;
      const projectDirectory = await files.list(`${root}/${entry.name}`);
      if (projectDirectory.entries.some(item => item.name === "project.json" && item.type === "file")) paths.push(projectPath);
    }
  } catch (error) {
    if (!isMissingError(error)) throw error;
  }
  const projects: DramaProjectEntry[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const path of paths) {
    try {
      const project = normalizeDramaProject(await files.readJson<DramaProject>(path));
      validateProjectIdentity(project, path);
      if (ids.has(project.id)) throw new Error(`当前工作区存在重复的短剧项目 ID：${project.id}`);
      const name = project.name.trim().toLocaleLowerCase();
      if (names.has(name)) throw new Error(`当前工作区存在重复的短剧项目名称：${project.name}`);
      ids.add(project.id);
      names.add(name);
      projects.push({ project, path, storage: path === legacyManifestPath ? "legacy" : "isolated" });
    } catch (error) {
      if (path === legacyManifestPath && isMissingError(error)) continue;
      throw error;
    }
  }
  return projects.sort((left, right) => right.project.updatedAt.localeCompare(left.project.updatedAt));
}

export async function saveEpisodeDraft(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, content: string, manifestPath = legacyManifestPath) {
  const episode = project.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error("目标分集不存在");
  const draftPath = episode.draftPath ?? `${getProjectRoot(manifestPath)}/scripts/${episode.id}/draft.md`;
  await ensureDirectory(files, `${getProjectRoot(manifestPath)}/scripts/${episode.id}`);
  await files.write(draftPath, content);
  if (await files.readText(draftPath) !== content) throw new Error("工作稿回读校验失败；磁盘文件已保留，请重试");
  const snapshot = cloneProject(project);
  const target = snapshot.episodes.find(item => item.id === episodeId)!;
  target.draftPath = draftPath;
  snapshot.updatedAt = new Date().toISOString();
  await files.writeJson(manifestPath, snapshot);
  const saved = await files.readJson<DramaProject>(manifestPath);
  if (saved.episodes.find(item => item.id === episodeId)?.draftPath !== draftPath) throw new Error("工作稿已写入，但项目索引回读校验失败；工作稿文件已保留");
  Object.assign(project, snapshot);
  return draftPath;
}

export async function saveEpisodeScriptVersion(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, content: string, manifestPath = legacyManifestPath) {
  const episode = project.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error("目标分集不存在");
  const versions = project.scriptVersions[episodeId] ?? [];
  const version = Math.max(episode.scriptVersion, ...versions.map(item => item.version), 0) + 1;
  const id = crypto.randomUUID();
  const path = `${getProjectRoot(manifestPath)}/scripts/${episode.id}/${id}.md`;
  await ensureDirectory(files, `${getProjectRoot(manifestPath)}/scripts/${episode.id}`);
  await files.write(path, content, true);
  if (await files.readText(path) !== content) throw new Error("剧本版本文件回读校验失败；文件已保留，请重新载入");
  const snapshot = cloneProject(project);
  const target = snapshot.episodes.find(item => item.id === episodeId)!;
  const record: DramaScriptVersion = { id, version, path, createdAt: new Date().toISOString(), status: "草稿" };
  target.scriptVersion = version;
  target.scriptPath = path;
  target.status = "草稿";
  snapshot.scriptVersions[episodeId] ??= [];
  snapshot.scriptVersions[episodeId]!.push(record);
  snapshot.updatedAt = new Date().toISOString();
  try {
    await files.writeJson(manifestPath, snapshot);
    const saved = await files.readJson<DramaProject>(manifestPath);
    const savedVersion = saved.scriptVersions[episodeId]?.find(item => item.id === id);
    if (savedVersion?.path !== path || saved.episodes.find(item => item.id === episodeId)?.scriptPath !== path) throw new Error("剧本文件已保存，但项目索引回读校验失败");
  } catch (error) {
    throw new Error(`剧本文件 ${path} 已保存，但项目索引未能确认；原文件未覆盖。${error instanceof Error ? ` ${error.message}` : ""}`);
  }
  Object.assign(project, snapshot);
  return record;
}

export async function saveDramaProject(files: DramaWorkspaceFiles, project: DramaProject, manifestPath = legacyManifestPath) {
  await saveProjectSnapshot(files, project, manifestPath);
}

export async function createCharacter(files: DramaWorkspaceFiles, project: DramaProject, input: Partial<Omit<DramaCharacter, "id" | "version">>, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const character: DramaCharacter = {
    id: crypto.randomUUID(), archived: false, name: input.name ?? "", description: input.description ?? "",
    appearance: input.appearance ?? "", referencePath: input.referencePath ?? "", version: 1,
  };
  snapshot.characters.push(character);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
  return character;
}

export async function duplicateCharacter(files: DramaWorkspaceFiles, project: DramaProject, characterId: string, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const source = snapshot.characters.find(item => item.id === characterId && !item.archived);
  if (!source) throw new Error("要复制的人物不存在或已归档");
  const character: DramaCharacter = { ...source, id: crypto.randomUUID(), archived: false, version: 1 };
  snapshot.characters.push(character);
  for (const asset of snapshot.assets.filter(item => item.characterId === source.id)) {
    snapshot.assets.push({ ...asset, id: crypto.randomUUID(), characterId: character.id });
  }
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
  return character;
}

export async function archiveCharacter(files: DramaWorkspaceFiles, project: DramaProject, characterId: string, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const character = snapshot.characters.find(item => item.id === characterId);
  if (!character) throw new Error("目标人物不存在");
  character.archived = true;
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
  return character;
}

export async function updateScriptReview(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, versionId: string, status: DramaStatus, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const episode = snapshot.episodes.find(item => item.id === episodeId);
  const version = snapshot.scriptVersions[episodeId]?.find(item => item.id === versionId);
  if (!episode || !version) throw new Error("目标剧本版本不存在");
  if (status === "已确认") {
    const former = snapshot.scriptVersions[episodeId]?.find(item => item.id === episode.formalVersionId);
    if (former && former.id !== versionId) former.status = "已归档";
    episode.formalVersionId = versionId;
  }
  version.status = status;
  episode.status = status === "已确认" ? "已确认" : status === "待审核" ? "待审核" : episode.formalVersionId ? "草稿" : status;
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
}

export async function createDramaProject(files: DramaWorkspaceFiles, input: Pick<DramaProject, "name" | "genre" | "style" | "targetEpisodes" | "targetDuration">) {
  const name = input.name.trim();
  if (!name || name.length > 120) throw new Error("短剧项目名称必须为 1 至 120 个字符");
  const projects = await listDramaProjects(files);
  if (projects.some(item => item.project.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("当前工作区已有同名短剧项目，请修改项目名称");
  const project: DramaProject = {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    ...input,
    name,
    storyOutline: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    seasons: [],
    episodes: [],
    characters: [],
    assets: [],
    scriptVersions: {},
  };
  await ensureDirectory(files, `${dataPath}/projects/${project.id}/scripts`);
  const path = `${dataPath}/projects/${project.id}/project.json`;
  await files.writeJson(path, project, true);
  const saved = await files.readJson<DramaProject>(path);
  validateProjectIdentity(saved, path);
  if (JSON.stringify(saved) !== JSON.stringify(project)) throw new Error("短剧项目创建后回读校验失败；磁盘内容已保留，请重新载入");
  return project;
}

export async function renameDramaProject(files: DramaWorkspaceFiles, projectId: string, name: string) {
  name = name.trim();
  if (!name || name.length > 120) throw new Error("短剧项目名称必须为 1 至 120 个字符");
  const entries = await listDramaProjects(files);
  const entry = entries.find(item => item.project.id === projectId);
  if (!entry) throw new Error("短剧项目不存在或已移动");
  if (entries.some(item => item.project.id !== projectId && item.project.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error("当前工作区已有同名短剧项目，请修改项目名称");
  }
  if (entry.project.name === name) return entry;
  const snapshot = cloneProject(entry.project);
  snapshot.name = name;
  await saveProjectSnapshot(files, snapshot, entry.path);
  return { ...entry, project: snapshot } satisfies DramaProjectEntry;
}

export async function deleteDramaProject(files: DramaWorkspaceFiles, projectId: string) {
  const entries = await listDramaProjects(files);
  const entry = entries.find(item => item.project.id === projectId);
  if (!entry) throw new Error("短剧项目不存在或已删除");
  if (entry.storage === "legacy") throw new Error("该项目使用旧版共享目录结构，无法确认剧本与素材的独占范围；请先完成显式迁移后再删除");
  const projectRoot = `${dataPath}/projects/${entry.project.id}`;
  if (entry.path !== `${projectRoot}/project.json`) throw new Error("短剧项目目录与稳定 ID 不一致，已停止删除");
  const ownedPrefix = `${projectRoot}/`;
  const referencedPaths = [
    ...entry.project.episodes.flatMap(episode => [episode.scriptPath, episode.draftPath]),
    ...Object.values(entry.project.scriptVersions).flatMap(versions => versions.map(version => version.path)),
    ...entry.project.assets.map(asset => asset.referencePath),
    ...entry.project.characters.map(character => character.referencePath),
    ...entry.project.episodes.flatMap(episode => episode.shots.map(shot => shot.referencePath)),
  ].filter((path): path is string => !!path);
  const externalReferences = referencedPaths.filter(path => path !== entry.path && !path.startsWith(ownedPrefix));
  if (externalReferences.length) throw new Error(`项目仍关联独立目录外的文件，已停止删除：${externalReferences[0]}`);
  const assetRoot = `${dataPath}/assets/${entry.project.id}`;
  try {
    await files.list(assetRoot);
    throw new Error("项目仍有关联素材目录，已停止删除；请先确认素材引用与在途生成任务");
  } catch (error) {
    if (!isMissingError(error)) throw error;
  }
  const root = await files.list("");
  const canvasNames = new Set(entry.project.episodes.map(episode => `dramaCanvas${entry.project.id.replaceAll("-", "")}${episode.id.replaceAll("-", "")}.json`));
  const canvas = root.entries.find(item => item.type === "file" && canvasNames.has(item.name));
  if (canvas) throw new Error(`项目仍有关联原生画布 ${canvas.path}，已停止删除；请先归档或移除关联画布`);
  await files.remove(projectRoot, true);
  try {
    await files.list(projectRoot);
    throw new Error("短剧项目目录删除后仍可读取，请刷新后重试");
  } catch (error) {
    if (!isMissingError(error)) throw error;
  }
  return { id: entry.project.id, name: entry.project.name, path: entry.path };
}

export function createSeason(project: DramaProject, name: string, episodeCount: number) {
  const season: DramaSeason = { id: crypto.randomUUID(), name, episodes: [] };
  for (let number = 1; number <= episodeCount; number++) {
    const episode: DramaEpisode = {
      id: crypto.randomUUID(), seasonId: season.id, number, title: `第${String(number).padStart(3, "0")}集`, outline: "", scriptVersion: 0,
      status: "草稿", scenes: [], shots: [],
    };
    project.episodes.push(episode);
    season.episodes.push(episode.id);
  }
  project.seasons.push(season);
  project.targetEpisodes = project.episodes.length;
  project.updatedAt = new Date().toISOString();
  return season;
}

export async function createEpisode(files: DramaWorkspaceFiles, project: DramaProject, seasonId: string, input: { title?: string; outline?: string }, manifestPath: string) {
  const season = project.seasons.find(item => item.id === seasonId);
  if (!season) throw new Error("目标季度不存在");
  const episode: DramaEpisode = {
    id: crypto.randomUUID(), seasonId, number: Math.max(0, ...project.episodes.filter(item => item.seasonId === seasonId).map(item => item.number)) + 1,
    title: input.title?.trim() || `第${String(season.episodes.length + 1).padStart(3, "0")}集`, outline: input.outline ?? "", scriptVersion: 0,
    status: "草稿", scenes: [], shots: [],
  };
  const snapshot = cloneProject(project);
  snapshot.episodes.push(episode);
  snapshot.seasons.find(item => item.id === seasonId)!.episodes.push(episode.id);
  snapshot.targetEpisodes = snapshot.episodes.length;
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
  return episode;
}

export async function updateEpisode(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, patch: Partial<Pick<DramaEpisode, "title" | "outline" | "status" | "characterIds">>, manifestPath: string) {
  const snapshot = cloneProject(project);
  const episode = snapshot.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error("目标分集不存在");
  if (patch.characterIds && patch.characterIds.some(id => !snapshot.characters.some(character => character.id === id))) throw new Error("分集人物关联必须使用此项目中的稳定人物 ID");
  Object.assign(episode, patch);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
  return episode;
}

export async function createScene(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, input: Partial<Omit<DramaScene, "id" | "number" | "order">>, manifestPath: string) {
  const snapshot = cloneProject(project);
  const episode = snapshot.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error("目标分集不存在");
  const scene: DramaScene = {
    id: crypto.randomUUID(), number: Math.max(0, ...episode.scenes.map(item => item.number)) + 1,
    order: Math.max(0, ...episode.scenes.map(item => item.order ?? item.number)) + 1, archived: false,
    heading: input.heading ?? "", time: input.time ?? "", location: input.location ?? "", interiorExterior: input.interiorExterior ?? "内景",
    dayPart: input.dayPart ?? "白天", characters: input.characters ?? [], charactersText: input.charactersText ?? "", description: input.description ?? "",
    ...(input.sourceScriptVersionId ? { sourceScriptVersionId: input.sourceScriptVersionId } : {}),
  };
  episode.scenes.push(scene);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
  return scene;
}

export async function updateScene(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, sceneId: string, patch: Partial<Omit<DramaScene, "id" | "number">>, manifestPath: string) {
  const snapshot = cloneProject(project);
  const episode = snapshot.episodes.find(item => item.id === episodeId);
  const scene = episode?.scenes.find(item => item.id === sceneId);
  if (!scene) throw new Error("目标场景不存在或不属于指定分集");
  if (patch.sourceScriptVersionId && !snapshot.scriptVersions[episodeId]?.some(version => version.id === patch.sourceScriptVersionId)) throw new Error("场景剧本关联必须使用此分集中的稳定剧本版本 ID");
  Object.assign(scene, patch);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
  return scene;
}

export async function duplicateScene(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, sceneId: string, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const episode = snapshot.episodes.find(item => item.id === episodeId);
  const source = episode?.scenes.find(item => item.id === sceneId && !item.archived);
  if (!episode || !source) throw new Error("要复制的场景不存在或已归档");
  const scene: DramaScene = {
    ...source,
    id: crypto.randomUUID(),
    number: Math.max(0, ...episode.scenes.map(item => item.number)) + 1,
    order: Math.max(0, ...episode.scenes.map(item => item.order ?? item.number)) + 1,
    archived: false,
  };
  const referenceAssets = snapshot.assets.filter(item => item.kind === "image" && !item.shotId && (item.sceneId === source.id || item.id === source.referenceAssetId));
  const assetIds = new Map<string, string>();
  for (const asset of referenceAssets) {
    const id = crypto.randomUUID();
    assetIds.set(asset.id, id);
    snapshot.assets.push({ ...asset, id, sceneId: scene.id });
  }
  if (source.referenceAssetId && assetIds.has(source.referenceAssetId)) scene.referenceAssetId = assetIds.get(source.referenceAssetId);
  episode.scenes.push(scene);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
  return scene;
}

export async function archiveScene(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, sceneId: string, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const scene = snapshot.episodes.find(item => item.id === episodeId)?.scenes.find(item => item.id === sceneId);
  if (!scene) throw new Error("目标场景不存在或不属于指定分集");
  scene.archived = true;
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
  return scene;
}

export async function createShot(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, input: Partial<Omit<DramaShot, "id" | "number" | "order">> & { sceneId?: string }, manifestPath: string) {
  const snapshot = cloneProject(project);
  const episode = snapshot.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error("目标分集不存在");
  if (input.sceneId && !episode.scenes.some(item => item.id === input.sceneId && !item.archived)) throw new Error("镜头必须关联此分集内未归档的场景");
  const maxShotNumber = Math.max(0, ...episode.shots.map(item => Number(item.number.match(/\d+$/)?.[0] ?? 0)));
  const shot: DramaShot = {
    id: crypto.randomUUID(), number: `SH${String(maxShotNumber + 1).padStart(3, "0")}`,
    order: Math.max(0, ...episode.shots.map(item => item.order ?? 0)) + 1, archived: false, sceneId: input.sceneId ?? "",
    description: input.description ?? "", action: input.action ?? "", expression: input.expression ?? "", size: input.size ?? "", angle: input.angle ?? "",
    composition: input.composition ?? "", movement: input.movement ?? "", dialogue: input.dialogue ?? "", sound: input.sound ?? "", duration: input.duration ?? 3,
    imagePrompt: input.imagePrompt ?? "", videoPrompt: input.videoPrompt ?? "", referencePath: input.referencePath ?? "",
    firstFrameAssetId: input.firstFrameAssetId, lastFrameAssetId: input.lastFrameAssetId, referenceAssetIds: input.referenceAssetIds,
    aspectRatio: input.aspectRatio, productionStatus: input.productionStatus ?? "待制作", reviewStatus: input.reviewStatus ?? "草稿", status: input.status ?? "草稿",
  };
  validateShotAssetLinks(project, shot);
  episode.shots.push(shot);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
  return shot;
}

export async function duplicateShot(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, shotId: string, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const episode = snapshot.episodes.find(item => item.id === episodeId);
  const source = episode?.shots.find(item => item.id === shotId && !item.archived);
  if (!episode || !source) throw new Error("要复制的镜头不存在或已归档");
  const sourceScene = episode.scenes.find(item => item.id === source.sceneId && !item.archived);
  const maxShotNumber = Math.max(0, ...episode.shots.map(item => Number(item.number.match(/\d+$/)?.[0] ?? 0)));
  const shot: DramaShot = { ...source, id: crypto.randomUUID(), number: `SH${String(maxShotNumber + 1).padStart(3, "0")}`, sceneId: sourceScene?.id ?? "", archived: false };
  const orderedShots = episode.shots.slice().sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.number.localeCompare(right.number, "en", { numeric: true }));
  const sourceIndex = orderedShots.findIndex(item => item.id === source.id);
  orderedShots.splice(sourceIndex + 1, 0, shot);
  orderedShots.forEach((item, index) => { item.order = index + 1; });
  episode.shots = orderedShots;
  validateShotAssetLinks(snapshot, shot);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
  return shot;
}

export async function archiveShot(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, shotId: string, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const shot = snapshot.episodes.find(item => item.id === episodeId)?.shots.find(item => item.id === shotId);
  if (!shot) throw new Error("目标镜头不存在或不属于指定分集");
  shot.archived = true;
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
  return shot;
}

export async function updateShot(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, shotId: string, patch: Partial<Omit<DramaShot, "id" | "number">>, manifestPath: string) {
  const snapshot = cloneProject(project);
  const episode = snapshot.episodes.find(item => item.id === episodeId);
  const shot = episode?.shots.find(item => item.id === shotId);
  if (!episode || !shot) throw new Error("目标镜头不存在或不属于指定分集");
  if (patch.sceneId && !episode.scenes.some(item => item.id === patch.sceneId && !item.archived)) throw new Error("镜头必须关联此分集内未归档的场景");
  if (patch.characterIds && patch.characterIds.some(id => !project.characters.some(character => character.id === id))) throw new Error("镜头人物关联必须使用此项目中的稳定人物 ID");
  Object.assign(shot, patch);
  validateShotAssetLinks(project, shot);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  Object.assign(project, snapshot);
  return shot;
}

function validateShotAssetLinks(project: DramaProject, shot: DramaShot) {
  const imageIds = new Set(project.assets.filter(item => item.kind === "image").map(item => item.id));
  for (const id of [shot.firstFrameAssetId, shot.lastFrameAssetId].filter((value): value is string => Boolean(value))) {
    if (!imageIds.has(id)) throw new Error(`首帧或尾帧素材 ${id} 不属于当前项目的图片资产`);
  }
  const referenceIds = new Set([...project.assets, ...project.characters].map(item => item.id));
  for (const id of shot.referenceAssetIds ?? []) if (!referenceIds.has(id)) throw new Error(`参考素材 ${id} 不属于当前项目`);
}

function validateDramaScriptAnalysis(analysis: DramaScriptAnalysis) {
  if (!analysis.metadata.title.trim() || analysis.metadata.duration <= 0 || !analysis.metadata.aspectRatio.trim()) throw new Error("剧本分析缺少标题、时长或画幅");
  const characterKeys = new Set<string>();
  for (const character of analysis.characters) {
    if (!character.key.trim() || !character.name.trim() || characterKeys.has(character.key)) throw new Error("剧本分析包含空白或重复的人物标识");
    characterKeys.add(character.key);
  }
  const sceneKeys = new Set<string>();
  for (const scene of analysis.scenes) {
    if (!scene.key.trim() || !scene.name.trim() || sceneKeys.has(scene.key)) throw new Error("剧本分析包含空白或重复的场景标识");
    if (scene.characterKeys.some(key => !characterKeys.has(key))) throw new Error(`场景 ${scene.name} 引用了不存在的人物`);
    sceneKeys.add(scene.key);
  }
  const shotNumbers = new Set<string>();
  for (const shot of analysis.shots) {
    if (!/^SH\d{3,}$/i.test(shot.number) || shotNumbers.has(shot.number)) throw new Error("镜头编号必须是唯一的 SH 编号");
    if (!sceneKeys.has(shot.sceneKey) || shot.characterKeys.some(key => !characterKeys.has(key))) throw new Error(`镜头 ${shot.number} 的人物或场景关联无效`);
    if (shot.duration <= 0 || !shot.startTime.trim() || !shot.endTime.trim()) throw new Error(`镜头 ${shot.number} 缺少有效时间码或时长`);
    shotNumbers.add(shot.number);
  }
  for (const asset of analysis.referenceAssets) {
    if (asset.characterKeys.some(key => !characterKeys.has(key)) || asset.sceneKeys.some(key => !sceneKeys.has(key)) || asset.shotNumbers.some(number => !shotNumbers.has(number))) {
      throw new Error(`参考资产 ${asset.name} 的业务关联无效`);
    }
  }
  for (const constraint of analysis.continuityConstraints) {
    if (constraint.shotNumbers.some(number => !shotNumbers.has(number))) throw new Error(`连续性约束引用了不存在的镜头：${constraint.description}`);
  }
}

async function dramaScriptFingerprint(sourceText: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sourceText));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export async function confirmDramaScriptImport(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, input: DramaScriptImportInput, manifestPath: string): Promise<DramaScriptImportResult> {
  const sourceFormat = input.sourceName.toLowerCase().endsWith(".txt") ? "txt" : input.sourceName.toLowerCase().endsWith(".md") ? "md" : undefined;
  if (!sourceFormat) throw new Error("仅支持 TXT、MD 剧本文件");
  if (!input.sourceText.trim() || new TextEncoder().encode(input.sourceText).byteLength > 1024 * 1024) throw new Error("剧本原文必须为 1 MiB 以内的非空文本");
  if (!/^[a-f0-9]{64}$/.test(input.sourceFingerprint) || await dramaScriptFingerprint(input.sourceText) !== input.sourceFingerprint) throw new Error("剧本原文指纹校验失败，请重新分析后再确认");
  validateDramaScriptAnalysis(input.analysis);
  const episode = project.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error("目标分集不存在");
  const existingVersion = project.scriptVersions[episodeId]?.find(item => item.sourceFingerprint === input.sourceFingerprint);
  if (existingVersion) {
    if (await files.readText(existingVersion.path) !== input.sourceText) throw new Error("相同剧本指纹对应的原文内容不一致，已停止导入");
    const existingSceneIds = new Set(episode.scenes.filter(item => item.sourceScriptVersionId === existingVersion.id).map(item => item.id));
    const existingShots = episode.shots.filter(item => existingSceneIds.has(item.sceneId));
    return {
      deduplicated: true,
      scriptVersionId: existingVersion.id,
      characterIds: [...new Set(existingShots.flatMap(item => item.characterIds ?? episode.characterIds ?? []))],
      sceneIds: [...existingSceneIds],
      shotIds: existingShots.map(item => item.id),
    };
  }

  const projectRoot = getProjectRoot(manifestPath);
  const importDirectory = `${projectRoot}/scripts/${episodeId}/imports`;
  const sourcePath = `${importDirectory}/${input.sourceFingerprint}.${sourceFormat}`;
  await ensureDirectory(files, importDirectory);
  try {
    await files.write(sourcePath, input.sourceText, true);
  } catch (error) {
    try {
      if (await files.readText(sourcePath) !== input.sourceText) throw error;
    } catch {
      throw error;
    }
  }
  if (await files.readText(sourcePath) !== input.sourceText) throw new Error("剧本原文写入后回读不一致，项目索引未修改");

  const snapshot = cloneProject(project);
  const targetEpisode = snapshot.episodes.find(item => item.id === episodeId)!;
  const versions = snapshot.scriptVersions[episodeId] ??= [];
  const version: DramaScriptVersion = {
    id: `import-${input.sourceFingerprint.slice(0, 32)}`,
    version: Math.max(targetEpisode.scriptVersion, ...versions.map(item => item.version), 0) + 1,
    path: sourcePath,
    createdAt: new Date().toISOString(),
    status: "已确认",
    sourceName: input.sourceName,
    sourceFormat,
    sourceFingerprint: input.sourceFingerprint,
    analysis: structuredClone(input.analysis),
  };
  const former = versions.find(item => item.id === targetEpisode.formalVersionId);
  if (former) former.status = "已归档";
  versions.push(version);

  const characterIds = new Map<string, string>();
  for (const item of input.analysis.characters) {
    let character = snapshot.characters.find(candidate => !candidate.archived && candidate.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase());
    if (!character) {
      character = {
        id: crypto.randomUUID(), archived: false, name: item.name, description: item.identity, appearance: item.appearance,
        identity: item.identity, outfit: item.outfit, visualFeatures: item.visualFeatures, prompt: item.prompt, referencePath: "", version: 1,
      };
      snapshot.characters.push(character);
    } else {
      character.description ||= item.identity;
      character.appearance ||= item.appearance;
      character.identity ||= item.identity;
      character.outfit ||= item.outfit;
      character.visualFeatures ??= item.visualFeatures;
      character.prompt ||= item.prompt;
    }
    characterIds.set(item.key, character.id);
  }

  const sceneIds = new Map<string, string>();
  for (const [index, item] of input.analysis.scenes.entries()) {
    const linkedCharacterIds = item.characterKeys.map(key => characterIds.get(key)!);
    const scene: DramaScene = {
      id: crypto.randomUUID(), number: Math.max(0, ...targetEpisode.scenes.map(candidate => candidate.number), index) + 1,
      order: Math.max(0, ...targetEpisode.scenes.map(candidate => candidate.order ?? candidate.number), index) + 1, archived: false,
      sourceScriptVersionId: version.id, heading: item.name, time: item.time, location: item.location,
      interiorExterior: item.interiorExterior, dayPart: item.dayPart, characters: linkedCharacterIds,
      charactersText: item.characterKeys.map(key => input.analysis.characters.find(character => character.key === key)?.name ?? key).join("、"),
      description: item.environment, environment: item.environment, color: item.color, layout: item.layout, prompt: item.prompt,
    };
    targetEpisode.scenes.push(scene);
    sceneIds.set(item.key, scene.id);
  }

  const shotIds: string[] = [];
  for (const [index, item] of input.analysis.shots.entries()) {
    const shot: DramaShot = {
      id: crypto.randomUUID(), number: item.number.toUpperCase(), order: Math.max(0, ...targetEpisode.shots.map(candidate => candidate.order ?? 0), index) + 1,
      archived: false, sceneId: sceneIds.get(item.sceneKey)!, characterIds: item.characterKeys.map(key => characterIds.get(key)!),
      startTime: item.startTime, endTime: item.endTime, description: item.visualDescription, action: item.action, expression: "",
      size: item.size, angle: item.camera, composition: "", movement: item.movement, dialogue: "", sound: item.sound,
      duration: item.duration, imagePrompt: item.imagePrompt, videoPrompt: item.h3Prompt, referencePath: "",
      aspectRatio: input.analysis.metadata.aspectRatio, productionStatus: "待制作", reviewStatus: "已确认", status: "已确认",
    };
    targetEpisode.shots.push(shot);
    shotIds.push(shot.id);
  }

  targetEpisode.title = input.analysis.metadata.title;
  targetEpisode.outline = input.analysis.metadata.summary;
  targetEpisode.characterIds = [...new Set(characterIds.values())];
  targetEpisode.scriptVersion = version.version;
  targetEpisode.scriptPath = sourcePath;
  targetEpisode.formalVersionId = version.id;
  targetEpisode.status = "已确认";
  snapshot.targetDuration = input.analysis.metadata.duration;
  snapshot.storyOutline ||= input.analysis.metadata.summary;
  try {
    await saveProjectSnapshot(files, snapshot, manifestPath);
  } catch (error) {
    throw new Error(`剧本原文已安全保存在 ${sourcePath}，但项目索引导入失败；可使用同一文件重试恢复。${error instanceof Error ? ` ${error.message}` : ""}`);
  }
  Object.assign(project, snapshot);
  return {
    deduplicated: false,
    scriptVersionId: version.id,
    characterIds: [...characterIds.values()],
    sceneIds: [...sceneIds.values()],
    shotIds,
  };
}
