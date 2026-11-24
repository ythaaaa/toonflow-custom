import { readdir, readFile } from "@toonflow/file";
import { listDramaProjects, readEpisodeScript, type DramaWorkspaceFiles } from "@toonflow/drama-workspace";
import { resolveWorkspacePath } from "@/utils/workspace/files";
import type { AgentCanvasSnapshot } from "@/agent/runtime/types";

export async function freezeDramaContext(cwd: string, input: AgentCanvasSnapshot): Promise<AgentCanvasSnapshot> {
  const snapshot = structuredClone(input);
  if (!snapshot.projectId) return snapshot;
  const files: DramaWorkspaceFiles = {
    async list(path = "") {
      const target = (await resolveWorkspacePath(cwd, path)).path;
      const entries = await readdir(target, { withFileTypes: true });
      return { entries: entries.filter(item => item.isFile() || item.isDirectory()).map(item => ({
        name: item.name, path: path ? `${path}/${item.name}` : item.name,
        type: item.isDirectory() ? "directory" as const : "file" as const,
      })) };
    },
    async readText(path) { return readFile((await resolveWorkspacePath(cwd, path)).path, "utf8"); },
    async readJson<T>(path: string) { return JSON.parse(await readFile((await resolveWorkspacePath(cwd, path)).path, "utf8")) as T; },
    async write() { throw new Error("画布业务上下文只读"); },
    async writeJson() { throw new Error("画布业务上下文只读"); },
    async mkdir() { throw new Error("画布业务上下文只读"); },
    async remove() { throw new Error("画布业务上下文只读"); },
  };
  const entry = (await listDramaProjects(files)).find(item => item.project.id === snapshot.projectId);
  if (!entry) throw new Error("当前工作区没有快照指定的短剧项目");
  const project = entry.project;
  const episode = project.episodes.find(item => item.id === snapshot.episodeId);
  if (!episode) throw new Error("快照指定的分集不属于短剧项目");
  snapshot.projectName = project.name;
  snapshot.episodeName = episode.title;
  if (snapshot.nodes.some(node => !snapshot.selectedNodeIds.includes(node.id))) throw new Error("快照节点不属于发送时的选中范围");
  for (const node of snapshot.nodes) {
    const binding = node.business as { role?: string; projectId?: string; episodeId?: string; scriptVersionId?: string; shotId?: string; sceneId?: string; characterId?: string; assetId?: string } | null;
    if (!binding) continue;
    if (binding.projectId !== project.id || binding.episodeId !== episode.id) throw new Error("节点业务 ID 与当前短剧项目不一致");
    const shot = episode.shots.find(item => item.id === binding.shotId);
    const scene = episode.scenes.find(item => item.id === (binding.sceneId ?? shot?.sceneId));
    const character = project.characters.find(item => item.id === binding.characterId);
    const asset = project.assets.find(item => item.id === binding.assetId);
    if (binding.role === "shot" && !shot || binding.role === "scene" && !scene || binding.role === "character" && !character || binding.role === "imageAsset" && !asset) {
      throw new Error(`短剧业务实体不存在：${node.id}`);
    }
    const characterIds = shot?.characterIds ?? scene?.characters ?? [];
    const assetIds = shot ? [shot.firstFrameAssetId, shot.lastFrameAssetId, ...(shot.referenceAssetIds ?? [])].filter(Boolean) : [];
    node.shot = shot ?? null;
    node.scene = scene ?? null;
    node.characters = (character ? [character] : project.characters.filter(item => characterIds.includes(item.id) || characterIds.includes(item.name))).slice(0, 30);
    node.assets = (asset ? [asset] : project.assets.filter(item => assetIds.includes(item.id) || !!shot && item.shotId === shot.id)).slice(0, 30);
    if (binding.role === "script") {
      const version = project.scriptVersions[episode.id]?.find(item => item.id === binding.scriptVersionId);
      node.data = { script: (version ? await files.readText(version.path) : await readEpisodeScript(files, project, episode.id, entry.path)).slice(0, 12000), versionId: version?.id ?? null, status: version?.status ?? episode.status };
    }
  }
  snapshot.relations = snapshot.relations.filter(edge => {
    const relation = edge.relation as { kind?: string; projectId?: string; episodeId?: string; characterId?: string; sceneId?: string; shotId?: string; assetId?: string } | null;
    if (!relation || relation.projectId !== project.id || relation.episodeId !== episode.id) return false;
    const shot = episode.shots.find(item => item.id === relation.shotId);
    const scene = episode.scenes.find(item => item.id === relation.sceneId);
    const asset = project.assets.find(item => item.id === relation.assetId);
    switch (relation.kind) {
      case "scriptCharacter": return !!project.characters.find(item => item.id === relation.characterId) && !!episode.characterIds?.includes(relation.characterId!);
      case "scriptScene": return !!scene;
      case "sceneShot": return !!shot && shot.sceneId === scene?.id;
      case "characterShot": {
        const character = project.characters.find(item => item.id === relation.characterId);
        const scene = episode.scenes.find(item => item.id === shot?.sceneId);
        return !!shot && !!character && (shot.characterIds?.includes(character.id) || (!shot.characterIds && !!scene?.characters.some(value => value === character.id || value === character.name)));
      }
      case "shotImageGenerator": return !!shot;
      case "generatorImageAsset": return !!asset && !!shot && asset.shotId === shot.id;
      case "imageAssetImageGenerator": return !!asset && !!shot && (shot.referenceAssetIds ?? []).includes(asset.id);
      default: return false;
    }
  });
  return snapshot;
}
