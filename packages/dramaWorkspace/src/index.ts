export type DramaStatus = "草稿" | "待审核" | "已确认" | "已归档";
export type DramaProductionStatus = "待制作" | "制作中" | "已完成";
export type DramaWorkspaceFiles = {
  list(path?: string): Promise<{ entries: { name: string; path: string; type: "file" | "directory" }[] }>;
  readText(path: string): Promise<string>;
  readTextSnapshot?(path: string): Promise<{ text: string; revision: string; encoding: "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" }>;
  readJson<T = unknown>(path: string): Promise<T>;
  write(path: string, content: string | Blob | ArrayBuffer, exclusive?: boolean): Promise<void>;
  writeJson(path: string, content: unknown, exclusive?: boolean): Promise<void>;
  writeTextSnapshot?(path: string, content: string, snapshot: { revision: string; encoding: "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" }): Promise<string>;
  mkdir(path: string): Promise<void>;
  remove(path: string, recursive?: boolean): Promise<void>;
};
export type DramaSeason = { id: string; name: string; episodes: string[] };
export type DramaEpisode = { id: string; seasonId: string; number: number; title: string; outline: string; scriptVersion: number; scriptPath?: string; draftPath?: string; formalVersionId?: string; characterIds?: string[]; status: DramaStatus; scenes: DramaScene[]; shots: DramaShot[] };
export type DramaScene = { id: string; number: number; order?: number; archived?: boolean; sourceScriptVersionId?: string; heading: string; time: string; location: string; interiorExterior?: "内景" | "外景"; dayPart?: "白天" | "夜晚" | "黄昏" | "清晨"; characters: string[]; charactersText: string; description: string; environment?: string; color?: string; layout?: string; prompt?: string; referenceAssetId?: string };
export type DramaShot = { id: string; number: string; order?: number; archived?: boolean; sceneId: string; characterIds?: string[]; startTime?: string; endTime?: string; description: string; action: string; expression: string; size: string; angle: string; composition?: string; movement: string; dialogue: string; sound: string; duration: number; imagePrompt?: string; videoPrompt?: string; referencePath: string; firstFrameAssetId?: string; lastFrameAssetId?: string; referenceAssetIds?: string[]; aspectRatio?: string; productionStatus?: DramaProductionStatus; reviewStatus?: DramaStatus; status: DramaStatus };
export type DramaCharacterLook = { id: string; name: string; age?: string; appearance?: string; hairstyle?: string; outfit: string; visualFeatures?: string[]; prompt?: string; referencePath?: string; referenceAssetIds?: string[]; archived?: boolean; version: number };
export type DramaCharacter = { id: string; archived?: boolean; name: string; description: string; appearance: string; age?: string; identity?: string; hairstyle?: string; outfit?: string; visualFeatures?: string[]; prompt?: string; referencePath: string; looks?: DramaCharacterLook[]; version: number };
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
const projectRevisions = new WeakMap<DramaProject, string>();

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

export function cloneDramaProject(project: DramaProject) {
  const copy = JSON.parse(JSON.stringify(project)) as DramaProject;
  const revision = projectRevisions.get(project);
  if (revision) projectRevisions.set(copy, revision);
  return copy;
}

export function applyDramaProjectSnapshot(target: DramaProject, source: DramaProject) {
  Object.assign(target, source);
  const revision = projectRevisions.get(source);
  if (revision) projectRevisions.set(target, revision);
}

function cloneProject(project: DramaProject) {
  return cloneDramaProject(project);
}

async function saveProjectSnapshot(files: DramaWorkspaceFiles, project: DramaProject, manifestPath: string) {
  const snapshot = cloneProject(project);
  snapshot.name = snapshot.name.trim();
  validateProjectIdentity(snapshot, manifestPath);
  const stored = await files.readJson<DramaProject>(manifestPath);
  if (stored.id !== snapshot.id) throw new Error("项目稳定 ID 与磁盘记录不一致，已停止覆盖");
  const revision = projectRevisions.get(project);
  if (!revision || !files.writeTextSnapshot) throw new Error("无法确认短剧项目修订号，请重新加载项目后再保存");
  snapshot.updatedAt = new Date().toISOString();
  const nextRevision = await files.writeTextSnapshot(manifestPath, `${JSON.stringify(snapshot, null, 2)}\n`, { revision, encoding: "utf-8" });
  const saved = await files.readJson<DramaProject>(manifestPath);
  if (JSON.stringify(saved) !== JSON.stringify(snapshot)) throw new Error("项目索引回读校验失败；磁盘内容已保留，请重新载入后再试");
  projectRevisions.set(snapshot, nextRevision);
  projectRevisions.set(project, nextRevision);
  applyDramaProjectSnapshot(project, snapshot);
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

export async function readEpisodeDraftSnapshot(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, manifestPath = legacyManifestPath) {
  const episode = project.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error("目标分集不存在");
  const path = episode.draftPath ?? `${getProjectRoot(manifestPath)}/scripts/${episode.id}/draft.md`;
  try {
    if (files.readTextSnapshot) {
      const snapshot = await files.readTextSnapshot(path);
      return { path, content: snapshot.text, revision: snapshot.revision };
    }
    return { path, content: await files.readText(path), revision: null };
  } catch (error) {
    if (!episode.draftPath && isMissingError(error)) return { path, content: "", revision: null };
    throw error;
  }
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
      const fileSnapshot = await files.readTextSnapshot?.(path);
      const project = normalizeDramaProject(fileSnapshot ? JSON.parse(fileSnapshot.text) as DramaProject : await files.readJson<DramaProject>(path));
      if (fileSnapshot) projectRevisions.set(project, fileSnapshot.revision);
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

export async function saveEpisodeDraft(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, content: string, manifestPath = legacyManifestPath,
  draftSnapshot?: { revision: string; encoding: "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" } | null) {
  const episode = project.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error("目标分集不存在");
  const draftPath = episode.draftPath ?? `${getProjectRoot(manifestPath)}/scripts/${episode.id}/draft.md`;
  await ensureDirectory(files, `${getProjectRoot(manifestPath)}/scripts/${episode.id}`);
  if (draftSnapshot === null) await files.write(draftPath, content, true);
  else if (draftSnapshot) {
    if (!files.writeTextSnapshot) throw new Error("当前文件接口不支持剧本修订冲突保护，请重新加载项目后再保存");
    await files.writeTextSnapshot(draftPath, content, draftSnapshot);
  } else await files.write(draftPath, content);
  const savedDraft = files.readTextSnapshot ? (await files.readTextSnapshot(draftPath)).text : await files.readText(draftPath);
  if (savedDraft !== content) throw new Error("工作稿回读校验失败；磁盘文件已保留，请重试");
  const snapshot = cloneProject(project);
  const target = snapshot.episodes.find(item => item.id === episodeId)!;
  target.draftPath = draftPath;
  await saveProjectSnapshot(files, snapshot, manifestPath);
  const saved = await files.readJson<DramaProject>(manifestPath);
  if (saved.episodes.find(item => item.id === episodeId)?.draftPath !== draftPath) throw new Error("工作稿已写入，但项目索引回读校验失败；工作稿文件已保留");
  applyDramaProjectSnapshot(project, snapshot);
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
  try {
    await saveProjectSnapshot(files, snapshot, manifestPath);
    const saved = await files.readJson<DramaProject>(manifestPath);
    const savedVersion = saved.scriptVersions[episodeId]?.find(item => item.id === id);
    if (savedVersion?.path !== path || saved.episodes.find(item => item.id === episodeId)?.scriptPath !== path) throw new Error("剧本文件已保存，但项目索引回读校验失败");
  } catch (error) {
    throw new Error(`剧本文件 ${path} 已保存，但项目索引未能确认；原文件未覆盖。${error instanceof Error ? ` ${error.message}` : ""}`);
  }
  applyDramaProjectSnapshot(project, snapshot);
  return record;
}

export async function saveDramaProject(files: DramaWorkspaceFiles, project: DramaProject, manifestPath = legacyManifestPath) {
  await saveProjectSnapshot(files, project, manifestPath);
}

export async function createCharacter(files: DramaWorkspaceFiles, project: DramaProject, input: Partial<Omit<DramaCharacter, "version" | "archived">>, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("人物名称不能为空");
  const existing = snapshot.characters.find(item => item.id === (input as Partial<DramaCharacter>).id
    || (!item.archived && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()));
  if (existing) {
    if (input.id && existing.id !== input.id) throw new Error("同名人物已使用其他稳定 ID，请查询后使用 updateCharacter 修改");
    const fields = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "id" && key !== "version"));
    const matches = Object.entries(fields).every(([key, value]) => JSON.stringify((existing as unknown as Record<string, unknown>)[key]) === JSON.stringify(value));
    if (matches) return existing;
    throw new Error(existing.id === (input as Partial<DramaCharacter>).id
      ? "人物 ID 已存在且内容不同，请使用 updateCharacter"
      : `项目中已有人物“${existing.name}”，请使用 updateCharacter 修改`);
  }
  const character: DramaCharacter = {
    ...input, id: input.id ?? crypto.randomUUID(), archived: false, name, description: input.description ?? "",
    appearance: input.appearance ?? "", referencePath: input.referencePath ?? "", version: 1,
  };
  validateCharacterLooks(snapshot, character);
  snapshot.characters.push(character);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
  return character;
}

export async function updateCharacter(files: DramaWorkspaceFiles, project: DramaProject, characterId: string, patch: Partial<Omit<DramaCharacter, "id" | "version" | "looks">>, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const character = snapshot.characters.find(item => item.id === characterId);
  if (!character) throw new Error("目标人物不存在或不属于指定项目");
  const name = patch.name?.trim();
  if (patch.name !== undefined && !name) throw new Error("人物名称不能为空");
  if (name && snapshot.characters.some(item => item.id !== characterId && !item.archived && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error(`项目中已有人物“${name}”`);
  }
  const changed = Object.entries(patch).some(([key, value]) => JSON.stringify((character as unknown as Record<string, unknown>)[key]) !== JSON.stringify(value));
  if (!changed) return character;
  Object.assign(character, patch, name ? { name } : {});
  character.version += 1;
  validateCharacterLooks(snapshot, character);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
  return character;
}

export async function createCharacterLook(files: DramaWorkspaceFiles, project: DramaProject, characterId: string, input: Partial<Omit<DramaCharacterLook, "id" | "version">> & { id?: string }, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const character = snapshot.characters.find(item => item.id === characterId && !item.archived);
  if (!character) throw new Error("目标人物不存在或已归档");
  const name = input.name?.trim() ?? "";
  if (!name || !input.outfit?.trim()) throw new Error("造型名称和服装描述不能为空");
  character.looks ??= [];
  const existing = character.looks.find(item => item.id === input.id || (!item.archived && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()));
  if (existing) {
    if (input.id && existing.id !== input.id) throw new Error("同名造型已使用其他稳定 ID");
    const fields = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "id" && key !== "version"));
    const matches = Object.entries(fields).every(([key, value]) => JSON.stringify((existing as unknown as Record<string, unknown>)[key]) === JSON.stringify(value));
    if (matches) return existing;
    throw new Error(existing.id === input.id ? "造型 ID 已存在且内容不同，请使用 updateCharacterLook" : `人物“${character.name}”已有造型“${existing.name}”`);
  }
  const look: DramaCharacterLook = { ...input, id: input.id ?? crypto.randomUUID(), name, outfit: input.outfit, version: 1, archived: false };
  validateCharacterLook(snapshot, look);
  character.looks.push(look);
  character.version += 1;
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
  return look;
}

export async function updateCharacterLook(files: DramaWorkspaceFiles, project: DramaProject, characterId: string, lookId: string, patch: Partial<Omit<DramaCharacterLook, "id" | "version">>, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const character = snapshot.characters.find(item => item.id === characterId);
  const look = character?.looks?.find(item => item.id === lookId);
  if (!character || !look) throw new Error("目标人物造型不存在或不属于指定人物");
  const name = patch.name?.trim();
  if (patch.name !== undefined && !name) throw new Error("造型名称不能为空");
  if (name && character.looks?.some(item => item.id !== lookId && !item.archived && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error(`人物“${character.name}”已有造型“${name}”`);
  const changed = Object.entries(patch).some(([key, value]) => JSON.stringify((look as unknown as Record<string, unknown>)[key]) !== JSON.stringify(value));
  if (!changed) return look;
  Object.assign(look, patch, name ? { name } : {});
  look.version += 1;
  validateCharacterLook(snapshot, look);
  character.version += 1;
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
  return look;
}

function validateCharacterLooks(project: DramaProject, character: DramaCharacter) {
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const look of character.looks ?? []) {
    const name = look.name.trim().toLocaleLowerCase();
    if (!name || names.has(name) || ids.has(look.id)) throw new Error("人物造型名称和 ID 必须唯一且非空");
    names.add(name);
    ids.add(look.id);
    validateCharacterLook(project, look);
  }
}

function validateCharacterLook(project: DramaProject, look: DramaCharacterLook) {
  const assetIds = new Set(project.assets.map(item => item.id));
  for (const id of look.referenceAssetIds ?? []) if (!assetIds.has(id)) throw new Error(`人物造型参考素材 ${id} 不属于当前项目`);
}

export async function duplicateCharacter(files: DramaWorkspaceFiles, project: DramaProject, characterId: string, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const source = snapshot.characters.find(item => item.id === characterId && !item.archived);
  if (!source) throw new Error("要复制的人物不存在或已归档");
  const character: DramaCharacter = { ...source, id: crypto.randomUUID(), archived: false, version: 1 };
  snapshot.characters.push(character);
  const assetIds = new Map<string, string>();
  const characterAssets = snapshot.assets.filter(item => item.characterId === source.id);
  for (const asset of characterAssets) assetIds.set(asset.id, crypto.randomUUID());
  for (const asset of characterAssets) snapshot.assets.push({ ...asset, id: assetIds.get(asset.id)!, characterId: character.id });
  character.looks = character.looks?.map(look => ({ ...look, id: crypto.randomUUID(), referenceAssetIds: look.referenceAssetIds?.map(id => assetIds.get(id) ?? id) }));
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
  return character;
}

export async function archiveCharacter(files: DramaWorkspaceFiles, project: DramaProject, characterId: string, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const character = snapshot.characters.find(item => item.id === characterId);
  if (!character) throw new Error("目标人物不存在");
  character.archived = true;
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
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
  applyDramaProjectSnapshot(project, snapshot);
}

export async function createDramaProject(files: DramaWorkspaceFiles, input: Pick<DramaProject, "name" | "genre" | "style" | "targetEpisodes" | "targetDuration"> & { storyOutline?: string; id?: string }) {
  const name = input.name.trim();
  if (!name || name.length > 120) throw new Error("短剧项目名称必须为 1 至 120 个字符");
  const projects = await listDramaProjects(files);
  if (projects.some(item => item.project.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("当前工作区已有同名短剧项目，请修改项目名称");
  const project: DramaProject = {
    schemaVersion: 1,
    id: input.id ?? crypto.randomUUID(),
    ...input,
    name,
    storyOutline: input.storyOutline ?? "",
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
  const fileSnapshot = await files.readTextSnapshot?.(path);
  const saved = fileSnapshot ? JSON.parse(fileSnapshot.text) as DramaProject : await files.readJson<DramaProject>(path);
  validateProjectIdentity(saved, path);
  if (JSON.stringify(saved) !== JSON.stringify(project)) throw new Error("短剧项目创建后回读校验失败；磁盘内容已保留，请重新载入");
  if (fileSnapshot) projectRevisions.set(project, fileSnapshot.revision);
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

export function createSeason(project: DramaProject, name: string, episodeCount = 0, seasonId?: string) {
  name = name.trim();
  if (!name || name.length > 120) throw new Error("季度名称必须为 1 至 120 个字符");
  if (!Number.isInteger(episodeCount) || episodeCount < 0 || episodeCount > 500) throw new Error("季度预建集数必须为 0 至 500 的整数");
  const existing = project.seasons.find(item => item.id === seasonId || item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
  if (existing) {
    if (seasonId && existing.id !== seasonId) throw new Error("同名季度已使用其他稳定 ID");
    if (existing.name.trim().toLocaleLowerCase() !== name.toLocaleLowerCase() || existing.episodes.length !== episodeCount) throw new Error("季度已存在但名称或预建集数不同；请查询季度后继续，不能重复创建");
    return existing;
  }
  const season: DramaSeason = { id: seasonId ?? crypto.randomUUID(), name, episodes: [] };
  for (let number = 1; number <= episodeCount; number++) {
    const episode: DramaEpisode = {
      id: crypto.randomUUID(), seasonId: season.id, number, title: `第${String(number).padStart(3, "0")}集`, outline: "", scriptVersion: 0,
      status: "草稿", scenes: [], shots: [],
    };
    project.episodes.push(episode);
    season.episodes.push(episode.id);
  }
  project.seasons.push(season);
  if (episodeCount > 0) project.targetEpisodes = Math.max(project.targetEpisodes, project.episodes.length);
  project.updatedAt = new Date().toISOString();
  return season;
}

export async function createEpisode(files: DramaWorkspaceFiles, project: DramaProject, seasonId: string, input: { id?: string; title?: string; outline?: string }, manifestPath: string) {
  const season = project.seasons.find(item => item.id === seasonId);
  if (!season) throw new Error("目标季度不存在");
  const title = input.title?.trim();
  const existing = project.episodes.find(item => item.id === input.id || (title && item.seasonId === seasonId && item.title.trim().toLocaleLowerCase() === title.toLocaleLowerCase()));
  if (existing) {
    if (input.id && existing.id !== input.id) throw new Error("同标题分集已使用其他稳定 ID；请查询分集后继续");
    if (existing.seasonId === seasonId && existing.title === (title || existing.title) && existing.outline === (input.outline ?? existing.outline)) return existing;
    throw new Error("分集 ID 或标题已存在且内容不同；请查询后使用 updateEpisode 修改");
  }
  const episode: DramaEpisode = {
    id: input.id ?? crypto.randomUUID(), seasonId, number: Math.max(0, ...project.episodes.filter(item => item.seasonId === seasonId).map(item => item.number)) + 1,
    title: title || `第${String(season.episodes.length + 1).padStart(3, "0")}集`, outline: input.outline ?? "", scriptVersion: 0,
    status: "草稿", scenes: [], shots: [],
  };
  const snapshot = cloneProject(project);
  snapshot.episodes.push(episode);
  snapshot.seasons.find(item => item.id === seasonId)!.episodes.push(episode.id);
  snapshot.targetEpisodes = Math.max(snapshot.targetEpisodes, snapshot.episodes.length);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
  return episode;
}

export async function updateEpisode(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, patch: Partial<Pick<DramaEpisode, "title" | "outline" | "status" | "characterIds">>, manifestPath: string) {
  const snapshot = cloneProject(project);
  const episode = snapshot.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error("目标分集不存在");
  if (patch.characterIds && patch.characterIds.some(id => !snapshot.characters.some(character => character.id === id))) throw new Error("分集人物关联必须使用此项目中的稳定人物 ID");
  Object.assign(episode, patch);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
  return episode;
}

export async function updateDramaProject(files: DramaWorkspaceFiles, project: DramaProject, patch: Partial<Pick<DramaProject, "name" | "genre" | "style" | "storyOutline" | "targetEpisodes" | "targetDuration">>, manifestPath: string) {
  const snapshot = cloneProject(project);
  const name = patch.name?.trim();
  if (patch.name !== undefined && (!name || name.length > 120)) throw new Error("短剧项目名称必须为 1 至 120 个字符");
  if (name) {
    const projects = await listDramaProjects(files);
    if (projects.some(item => item.project.id !== project.id && item.project.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("当前工作区已有同名短剧项目");
  }
  if (Object.entries(patch).every(([key, value]) => snapshot[key as keyof DramaProject] === value)) return project;
  Object.assign(snapshot, patch, name ? { name } : {});
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
  return snapshot;
}

export async function createScene(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, input: Partial<Omit<DramaScene, "number" | "order" | "archived">>, manifestPath: string) {
  const snapshot = cloneProject(project);
  const episode = snapshot.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error("目标分集不存在");
  if (input.id && snapshot.episodes.some(item => item.id !== episodeId && item.scenes.some(scene => scene.id === input.id))) throw new Error("sceneId 已被项目中的其他分集使用");
  if (input.sourceScriptVersionId && !snapshot.scriptVersions[episodeId]?.some(version => version.id === input.sourceScriptVersionId)) throw new Error("场景剧本关联必须使用此分集中的稳定剧本版本 ID");
  const existing = episode.scenes.find(item => item.id === input.id || (!input.id && input.heading?.trim() && input.location?.trim()
    && item.heading.trim().toLocaleLowerCase() === input.heading.trim().toLocaleLowerCase()
    && item.location.trim().toLocaleLowerCase() === input.location.trim().toLocaleLowerCase()
    && item.time.trim().toLocaleLowerCase() === (input.time ?? "").trim().toLocaleLowerCase()));
  if (existing) {
    if (input.id && existing.id !== input.id) throw new Error("相同场次标识已使用其他稳定 ID；请查询后使用 updateScene 修改");
    const fields = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "id" && key !== "archived" && key !== "order"));
    const matches = Object.entries(fields).every(([key, value]) => JSON.stringify((existing as unknown as Record<string, unknown>)[key]) === JSON.stringify(value));
    if (matches) return existing;
    throw new Error("场景 ID 或相同场次标识已存在且内容不同；请使用 updateScene 修改");
  }
  if (input.characters?.some(id => !snapshot.characters.some(character => character.id === id && !character.archived))) throw new Error("场景人物关联必须使用当前项目中未归档的人物 ID");
  if (input.referenceAssetId && !snapshot.assets.some(asset => asset.id === input.referenceAssetId && asset.kind === "image")) throw new Error("场景参考素材必须使用当前项目中的图片资产 ID");
  const scene: DramaScene = {
    ...input, id: input.id ?? crypto.randomUUID(), number: Math.max(0, ...episode.scenes.map(item => item.number)) + 1,
    order: Math.max(0, ...episode.scenes.map(item => item.order ?? item.number)) + 1, archived: false,
    heading: input.heading ?? "", time: input.time ?? "", location: input.location ?? "", interiorExterior: input.interiorExterior ?? "内景",
    dayPart: input.dayPart ?? "白天", characters: input.characters ?? [], charactersText: input.charactersText ?? "", description: input.description ?? "",
    ...(input.sourceScriptVersionId ? { sourceScriptVersionId: input.sourceScriptVersionId } : {}),
  };
  episode.scenes.push(scene);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
  return scene;
}

export async function updateScene(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, sceneId: string, patch: Partial<Omit<DramaScene, "id" | "number">>, manifestPath: string) {
  const snapshot = cloneProject(project);
  const episode = snapshot.episodes.find(item => item.id === episodeId);
  const scene = episode?.scenes.find(item => item.id === sceneId);
  if (!scene) throw new Error("目标场景不存在或不属于指定分集");
  if (patch.sourceScriptVersionId && !snapshot.scriptVersions[episodeId]?.some(version => version.id === patch.sourceScriptVersionId)) throw new Error("场景剧本关联必须使用此分集中的稳定剧本版本 ID");
  if (patch.characters?.some(id => !snapshot.characters.some(character => character.id === id && !character.archived))) throw new Error("场景人物关联必须使用当前项目中未归档的人物 ID");
  if (patch.referenceAssetId && !snapshot.assets.some(asset => asset.id === patch.referenceAssetId && asset.kind === "image")) throw new Error("场景参考素材必须使用当前项目中的图片资产 ID");
  Object.assign(scene, patch);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
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
  applyDramaProjectSnapshot(project, snapshot);
  return scene;
}

export async function archiveScene(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, sceneId: string, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const scene = snapshot.episodes.find(item => item.id === episodeId)?.scenes.find(item => item.id === sceneId);
  if (!scene) throw new Error("目标场景不存在或不属于指定分集");
  scene.archived = true;
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
  return scene;
}

export async function createShot(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, input: Partial<Omit<DramaShot, "order" | "archived">>, manifestPath: string) {
  const snapshot = cloneProject(project);
  const episode = snapshot.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error("目标分集不存在");
  if (input.id && snapshot.episodes.some(item => item.id !== episodeId && item.shots.some(shot => shot.id === input.id))) throw new Error("shotId 已被项目中的其他分集使用");
  if (input.sceneId && !episode.scenes.some(item => item.id === input.sceneId && !item.archived)) throw new Error("镜头必须关联此分集内未归档的场景");
  const existing = episode.shots.find(item => item.id === input.id || (input.number && item.number.toLocaleLowerCase() === input.number.toLocaleLowerCase())
    || (!input.id && !input.number && input.sceneId && input.startTime && input.endTime && item.sceneId === input.sceneId && item.startTime === input.startTime && item.endTime === input.endTime));
  if (existing) {
    if (input.id && existing.id !== input.id) throw new Error("镜号或时间码已使用其他稳定 ID；请查询后使用 updateShot 修改");
    const fields = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "id" && key !== "order"));
    const matches = Object.entries(fields).every(([key, value]) => JSON.stringify((existing as unknown as Record<string, unknown>)[key]) === JSON.stringify(value));
    if (matches) return existing;
    throw new Error("镜头 ID 或镜号已存在且内容不同；请使用 updateShot 修改");
  }
  if (input.characterIds?.some(id => !snapshot.characters.some(character => character.id === id && !character.archived))) throw new Error("镜头人物关联必须使用当前项目中未归档的人物 ID");
  if ((input.startTime && !input.endTime) || (!input.startTime && input.endTime)) throw new Error("镜头开始和结束时间码必须同时提供");
  if (input.duration !== undefined && (!Number.isFinite(input.duration) || input.duration <= 0)) throw new Error("镜头时长必须是正数");
  const maxShotNumber = Math.max(0, ...episode.shots.map(item => Number(item.number.match(/\d+$/)?.[0] ?? 0)));
  const shot: DramaShot = {
    ...input, id: input.id ?? crypto.randomUUID(), number: input.number ?? `SH${String(maxShotNumber + 1).padStart(3, "0")}`,
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
  applyDramaProjectSnapshot(project, snapshot);
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
  applyDramaProjectSnapshot(project, snapshot);
  return shot;
}

export async function archiveShot(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, shotId: string, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const shot = snapshot.episodes.find(item => item.id === episodeId)?.shots.find(item => item.id === shotId);
  if (!shot) throw new Error("目标镜头不存在或不属于指定分集");
  shot.archived = true;
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
  return shot;
}

export async function updateShot(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, shotId: string, patch: Partial<Omit<DramaShot, "id">>, manifestPath: string) {
  const snapshot = cloneProject(project);
  const episode = snapshot.episodes.find(item => item.id === episodeId);
  const shot = episode?.shots.find(item => item.id === shotId);
  if (!episode || !shot) throw new Error("目标镜头不存在或不属于指定分集");
  if (patch.sceneId !== undefined && !episode.scenes.some(item => item.id === patch.sceneId && !item.archived)) throw new Error("镜头必须关联此分集内未归档的场景");
  if (patch.number !== undefined && episode.shots.some(item => item.id !== shotId && item.number.toLocaleLowerCase() === patch.number!.toLocaleLowerCase())) throw new Error(`镜号 ${patch.number} 已在此分集中使用`);
  if (patch.characterIds && patch.characterIds.some(id => !project.characters.some(character => character.id === id && !character.archived))) throw new Error("镜头人物关联必须使用此项目中未归档人物的稳定 ID");
  const startTime = patch.startTime ?? shot.startTime;
  const endTime = patch.endTime ?? shot.endTime;
  if ((startTime && !endTime) || (!startTime && endTime)) throw new Error("镜头开始和结束时间码必须同时提供");
  if (patch.duration !== undefined && (!Number.isFinite(patch.duration) || patch.duration <= 0)) throw new Error("镜头时长必须是正数");
  Object.assign(shot, patch);
  validateShotAssetLinks(project, shot);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
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

export async function createDramaAsset(files: DramaWorkspaceFiles, project: DramaProject, input: Partial<Omit<DramaAsset, "version" | "projectId" | "generatedBy" | "modelId" | "generatedAt" | "requestedAspectRatio" | "width" | "height">> & Pick<DramaAsset, "kind" | "name">, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const name = input.name.trim();
  if (!name) throw new Error("资产名称不能为空");
  const existing = snapshot.assets.find(item => item.id === input.id || (item.kind === input.kind && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
    && item.episodeId === input.episodeId && item.sceneId === input.sceneId && item.shotId === input.shotId && item.characterId === input.characterId));
  if (existing) {
    if (input.id && existing.id !== input.id) throw new Error("同名同关联资产已使用其他稳定 ID，请查询后使用 updateDramaAsset 修改");
    const fields = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "id" && key !== "version"));
    const matches = Object.entries(fields).every(([key, value]) => JSON.stringify((existing as unknown as Record<string, unknown>)[key]) === JSON.stringify(value));
    if (matches) return existing;
    throw new Error(existing.id === input.id ? "资产 ID 已存在且内容不同，请使用 updateDramaAsset" : `项目中已存在同名同关联资产“${name}”，请使用 updateDramaAsset 修改`);
  }
  const asset: DramaAsset = {
    ...input, id: input.id ?? crypto.randomUUID(), kind: input.kind, name, description: input.description ?? "",
    referencePath: input.referencePath ?? "", version: 1, projectId: project.id,
  };
  validateDramaAssetLinks(snapshot, asset);
  snapshot.assets.push(asset);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
  return asset;
}

export async function updateDramaAsset(files: DramaWorkspaceFiles, project: DramaProject, assetId: string, patch: Partial<Pick<DramaAsset, "name" | "description" | "referencePath" | "referenceAssetIds" | "episodeId" | "sceneId" | "shotId" | "characterId">>, manifestPath = legacyManifestPath) {
  const snapshot = cloneProject(project);
  const asset = snapshot.assets.find(item => item.id === assetId);
  if (!asset || (asset.projectId && asset.projectId !== project.id)) throw new Error("目标资产不存在或不属于指定项目");
  if (asset.generatedBy && patch.referencePath !== undefined && patch.referencePath !== asset.referencePath) throw new Error("不能通过资产管理接口替换已生成图片的文件路径");
  const name = patch.name?.trim();
  if (patch.name !== undefined && !name) throw new Error("资产名称不能为空");
  if (name && snapshot.assets.some(item => item.id !== assetId && item.kind === asset.kind && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
    && item.episodeId === (patch.episodeId ?? asset.episodeId) && item.sceneId === (patch.sceneId ?? asset.sceneId)
    && item.shotId === (patch.shotId ?? asset.shotId) && item.characterId === (patch.characterId ?? asset.characterId))) throw new Error(`项目中已存在同名同关联资产“${name}”`);
  const changed = asset.projectId !== project.id || Object.entries(patch).some(([key, value]) => JSON.stringify((asset as unknown as Record<string, unknown>)[key]) !== JSON.stringify(value));
  Object.assign(asset, patch, name ? { name } : {}, { projectId: project.id });
  if (!changed) return asset;
  asset.version += 1;
  validateDramaAssetLinks(snapshot, asset);
  await saveProjectSnapshot(files, snapshot, manifestPath);
  applyDramaProjectSnapshot(project, snapshot);
  return asset;
}

function validateDramaAssetLinks(project: DramaProject, asset: DramaAsset) {
  if (asset.projectId && asset.projectId !== project.id) throw new Error("资产 projectId 必须与当前项目一致");
  const episode = asset.episodeId ? project.episodes.find(item => item.id === asset.episodeId) : undefined;
  if (asset.episodeId && !episode) throw new Error("资产分集关联必须使用当前项目中的分集 ID");
  const scenes = (episode ? [episode] : project.episodes).flatMap(item => item.scenes.filter(scene => !scene.archived).map(scene => ({ episode: item, scene })));
  const scene = asset.sceneId ? scenes.find(item => item.scene.id === asset.sceneId) : undefined;
  if (asset.sceneId && !scene) throw new Error("资产场景关联必须使用当前项目中的场景 ID");
  if (episode && scene && scene.episode.id !== episode.id) throw new Error("资产的场景必须属于指定分集");
  const shots = (episode ? [episode] : project.episodes).flatMap(item => item.shots.filter(shot => !shot.archived).map(shot => ({ episode: item, shot })));
  const shot = asset.shotId ? shots.find(item => item.shot.id === asset.shotId) : undefined;
  if (asset.shotId && !shot) throw new Error("资产镜头关联必须使用当前项目中的镜头 ID");
  if (episode && shot && shot.episode.id !== episode.id) throw new Error("资产的镜头必须属于指定分集");
  if (scene && shot && shot.shot.sceneId !== scene.scene.id) throw new Error("资产关联的场景与镜头不一致");
  if (asset.characterId && !project.characters.some(item => item.id === asset.characterId && !item.archived)) throw new Error("资产人物关联必须使用当前项目中未归档的人物 ID");
  const referenceIds = new Set<string>();
  const availableReferences = new Set([...project.assets.filter(item => item.id !== asset.id).map(item => item.id), ...project.characters.filter(item => !item.archived).map(item => item.id)]);
  for (const id of asset.referenceAssetIds ?? []) {
    if (!availableReferences.has(id)) throw new Error(`参考资产 ${id} 不属于当前项目`);
    if (referenceIds.has(id)) throw new Error(`参考资产 ${id} 重复关联`);
    referenceIds.add(id);
  }
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
  applyDramaProjectSnapshot(project, snapshot);
  return {
    deduplicated: false,
    scriptVersionId: version.id,
    characterIds: [...characterIds.values()],
    sceneIds: [...sceneIds.values()],
    shotIds,
  };
}
