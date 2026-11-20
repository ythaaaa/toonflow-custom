import type useWorkspaceFiles from "@/lib/workspaceFiles";

export type DramaStatus = "草稿" | "待审核" | "已确认" | "已归档";
export type DramaProductionStatus = "待制作" | "制作中" | "已完成";
export type DramaSeason = { id: string; name: string; episodes: string[] };
export type DramaEpisode = { id: string; seasonId: string; number: number; title: string; outline: string; scriptVersion: number; scriptPath?: string; draftPath?: string; formalVersionId?: string; status: DramaStatus; scenes: DramaScene[]; shots: DramaShot[] };
export type DramaScene = { id: string; number: number; order?: number; archived?: boolean; sourceScriptVersionId?: string; heading: string; time: string; location: string; interiorExterior?: "内景" | "外景"; dayPart?: "白天" | "夜晚" | "黄昏" | "清晨"; characters: string[]; charactersText: string; description: string };
export type DramaShot = { id: string; number: string; order?: number; sceneId: string; description: string; action: string; expression: string; size: string; angle: string; composition?: string; movement: string; dialogue: string; sound: string; duration: number; imagePrompt?: string; videoPrompt?: string; referencePath: string; productionStatus?: DramaProductionStatus; reviewStatus?: DramaStatus; status: DramaStatus };
export type DramaCharacter = { id: string; name: string; description: string; appearance: string; referencePath: string; version: number };
export type DramaAsset = { id: string; kind: "scene" | "prop" | "image"; name: string; description: string; referencePath: string; version: number };
export type DramaScriptVersion = { id: string; version: number; path: string; createdAt: string; status: DramaStatus };
export type DramaProject = { schemaVersion: 1; id: string; name: string; genre: string; style: string; storyOutline: string; targetEpisodes: number; targetDuration: number; createdAt: string; updatedAt: string; seasons: DramaSeason[]; episodes: DramaEpisode[]; characters: DramaCharacter[]; assets: DramaAsset[]; scriptVersions: Record<string, DramaScriptVersion[]> };

const legacyManifestPath = ".toonflow/drama/project.json";
const dataPath = ".toonflow/drama";

async function ensureDirectory(files: ReturnType<typeof useWorkspaceFiles>, path: string) {
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
    episode.shots.forEach((shot, index) => {
      shot.order ??= index + 1;
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

async function saveProjectSnapshot(files: ReturnType<typeof useWorkspaceFiles>, project: DramaProject, manifestPath: string) {
  const snapshot = cloneProject(project);
  snapshot.updatedAt = new Date().toISOString();
  await files.writeJson(manifestPath, snapshot);
  const saved = await files.readJson<DramaProject>(manifestPath);
  if (JSON.stringify(saved) !== JSON.stringify(snapshot)) throw new Error("项目索引回读校验失败；磁盘内容已保留，请重新载入后再试");
  Object.assign(project, snapshot);
}

export async function readEpisodeScript(files: ReturnType<typeof useWorkspaceFiles>, project: DramaProject, episodeId: string, manifestPath = legacyManifestPath) {
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

export async function listDramaProjects(files: ReturnType<typeof useWorkspaceFiles>) {
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

export async function saveEpisodeDraft(files: ReturnType<typeof useWorkspaceFiles>, project: DramaProject, episodeId: string, content: string, manifestPath = legacyManifestPath) {
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

export async function saveEpisodeScriptVersion(files: ReturnType<typeof useWorkspaceFiles>, project: DramaProject, episodeId: string, content: string, manifestPath = legacyManifestPath) {
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

export async function saveDramaProject(files: ReturnType<typeof useWorkspaceFiles>, project: DramaProject, manifestPath = legacyManifestPath) {
  await saveProjectSnapshot(files, project, manifestPath);
}

export async function updateScriptReview(files: ReturnType<typeof useWorkspaceFiles>, project: DramaProject, episodeId: string, versionId: string, status: DramaStatus, manifestPath = legacyManifestPath) {
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

export async function createDramaProject(files: ReturnType<typeof useWorkspaceFiles>, input: Pick<DramaProject, "name" | "genre" | "style" | "targetEpisodes" | "targetDuration">) {
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
