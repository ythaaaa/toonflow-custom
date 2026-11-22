export type DramaStatus = "草稿" | "待审核" | "已确认" | "已归档";
export type DramaProductionStatus = "待制作" | "制作中" | "已完成";
export type DramaWorkspaceFiles = {
  list(path?: string): Promise<{ entries: { name: string; path: string; type: "file" | "directory" }[] }>;
  readText(path: string): Promise<string>;
  readJson<T = unknown>(path: string): Promise<T>;
  write(path: string, content: string | Blob | ArrayBuffer, exclusive?: boolean): Promise<void>;
  writeJson(path: string, content: unknown, exclusive?: boolean): Promise<void>;
  mkdir(path: string): Promise<void>;
};
export type DramaSeason = { id: string; name: string; episodes: string[] };
export type DramaEpisode = { id: string; seasonId: string; number: number; title: string; outline: string; scriptVersion: number; scriptPath?: string; draftPath?: string; formalVersionId?: string; characterIds?: string[]; status: DramaStatus; scenes: DramaScene[]; shots: DramaShot[] };
export type DramaScene = { id: string; number: number; order?: number; archived?: boolean; sourceScriptVersionId?: string; heading: string; time: string; location: string; interiorExterior?: "内景" | "外景"; dayPart?: "白天" | "夜晚" | "黄昏" | "清晨"; characters: string[]; charactersText: string; description: string; referenceAssetId?: string };
export type DramaShot = { id: string; number: string; order?: number; archived?: boolean; sceneId: string; characterIds?: string[]; description: string; action: string; expression: string; size: string; angle: string; composition?: string; movement: string; dialogue: string; sound: string; duration: number; imagePrompt?: string; videoPrompt?: string; referencePath: string; firstFrameAssetId?: string; lastFrameAssetId?: string; referenceAssetIds?: string[]; aspectRatio?: string; productionStatus?: DramaProductionStatus; reviewStatus?: DramaStatus; status: DramaStatus };
export type DramaCharacter = { id: string; archived?: boolean; name: string; description: string; appearance: string; referencePath: string; version: number };
export type DramaAsset = { id: string; kind: "scene" | "prop" | "image"; name: string; description: string; referencePath: string; version: number;
  generatedBy?: "gptImageSubscription"; modelId?: string; generatedAt?: string; requestedAspectRatio?: string; width?: number; height?: number;
  referenceAssetIds?: string[]; projectId?: string; episodeId?: string; sceneId?: string; shotId?: string; characterId?: string };
export type DramaScriptVersion = { id: string; version: number; path: string; createdAt: string; status: DramaStatus };
export type DramaProject = { schemaVersion: 1; id: string; name: string; genre: string; style: string; storyOutline: string; targetEpisodes: number; targetDuration: number; createdAt: string; updatedAt: string; seasons: DramaSeason[]; episodes: DramaEpisode[]; characters: DramaCharacter[]; assets: DramaAsset[]; scriptVersions: Record<string, DramaScriptVersion[]> };

const legacyManifestPath = ".toonflow/drama/project.json";
const dataPath = ".toonflow/drama";

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
  snapshot.updatedAt = new Date().toISOString();
  await files.writeJson(manifestPath, snapshot);
  const saved = await files.readJson<DramaProject>(manifestPath);
  if (JSON.stringify(saved) !== JSON.stringify(snapshot)) throw new Error("项目索引回读校验失败；磁盘内容已保留，请重新载入后再试");
  Object.assign(project, snapshot);
}

export async function readEpisodeScript(files: DramaWorkspaceFiles, project: DramaProject, episodeId: string, manifestPath = legacyManifestPath) {
  const episode = project.episodes.find(item => item.id === episodeId);
  if (!episode) throw new Error("目标分集不存在");
  const draftPath = episode.draftPath ?? `${getProjectRoot(manifestPath)}/scripts/${episode.id}/draft.md`;
  try {
    const content = await files.readText(draftPath);
    episode.draftPath = draftPath;
    return content;
  } catch (error) {
    if (!(error instanceof Error) || !/404|ENOENT|不存在/i.test(error.message)) throw error;
  }
  return episode.scriptPath ? files.readText(episode.scriptPath) : "";
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
    if (!(error instanceof Error) || !/404|ENOENT|不存在/i.test(error.message)) throw error;
  }
  const projects = [];
  for (const path of paths) {
    try {
      const project = normalizeDramaProject(await files.readJson<DramaProject>(path));
      if (project.schemaVersion !== 1 || !project.id || !Array.isArray(project.seasons) || !Array.isArray(project.episodes)) throw new Error(`短剧项目文件格式无效：${path}`);
      projects.push({ project, path });
    } catch (error) {
      if (path === legacyManifestPath && error instanceof Error && /404|ENOENT|不存在/i.test(error.message)) continue;
      throw error;
    }
  }
  return projects;
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
  const project: DramaProject = {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    ...input,
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
  await files.writeJson(`${dataPath}/projects/${project.id}/project.json`, project, true);
  return project;
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
