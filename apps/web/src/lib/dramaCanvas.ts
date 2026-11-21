import type { InjectionKey, ShallowRef } from "vue";
import type { GraphNode } from "@vue-flow/core";
import type { NodeHandle } from "@toonflow/nodes-scaffold/runtime";
import type { DramaProject } from "@toonflow/drama-workspace";

export type DramaCanvasRole = "script" | "character" | "scene" | "shot" | "gptImage" | "imageAsset";
export type DramaCanvasBinding = {
  role: DramaCanvasRole;
  projectId: string;
  episodeId: string;
  scriptVersionId?: string;
  characterId?: string;
  sceneId?: string;
  shotId?: string;
  assetId?: string;
  order?: number;
};
export type DramaCanvasRelation = {
  kind: "scriptScene" | "sceneShot" | "characterShot" | "shotImageGenerator" | "generatorImageAsset";
  projectId: string;
  episodeId: string;
  scriptVersionId?: string;
  characterId?: string;
  sceneId?: string;
  shotId?: string;
  assetId?: string;
};
export type DramaCanvasState = { directory: string; manifestPath: string; episodeId: string; project: DramaProject };
export const dramaCanvasStateKey: InjectionKey<ShallowRef<DramaCanvasState | undefined>> = Symbol("dramaCanvasState");

export const dramaNodeHandles: Record<DramaCanvasRole, NodeHandle[]> = {
  script: [{ id: "script", type: "source", dataType: "DRAMA_SCRIPT", label: "正式剧本" }],
  character: [{ id: "character", type: "source", dataType: "DRAMA_CHARACTER", label: "人物" }],
  scene: [
    { id: "script", type: "target", dataType: "DRAMA_SCRIPT", label: "剧本" },
    { id: "scene", type: "source", dataType: "DRAMA_SCENE", label: "场景" },
  ],
  shot: [
    { id: "scene", type: "target", dataType: "DRAMA_SCENE", label: "场景" },
    { id: "character", type: "target", dataType: "DRAMA_CHARACTER", label: "人物参考" },
    { id: "shot", type: "source", dataType: "DRAMA_SHOT", label: "镜头" },
  ],
  gptImage: [
    { id: "shot", type: "target", dataType: "DRAMA_SHOT", label: "镜头" },
    { id: "image", type: "source", dataType: "DRAMA_IMAGE", label: "生成图片" },
  ],
  imageAsset: [{ id: "image", type: "target", dataType: "DRAMA_IMAGE", label: "生图结果" }],
};

export function readDramaCanvasBinding(value: unknown): DramaCanvasBinding | undefined {
  if (!value || typeof value !== "object") return;
  const binding = (value as { dramaBinding?: unknown }).dramaBinding;
  if (!binding || typeof binding !== "object") return;
  const item = binding as Partial<DramaCanvasBinding>;
  if (!["script", "character", "scene", "shot", "gptImage", "imageAsset"].includes(item.role ?? "")
    || typeof item.projectId !== "string" || typeof item.episodeId !== "string") return;
  const expectedId: Partial<Record<DramaCanvasRole, keyof DramaCanvasBinding>> = {
    character: "characterId", scene: "sceneId", shot: "shotId", gptImage: "shotId", imageAsset: "assetId",
  };
  const key = expectedId[item.role!];
  if (key && typeof item[key] !== "string") return;
  return item as DramaCanvasBinding;
}

export function dramaCanvasBindingKey(binding: DramaCanvasBinding) {
  const identity = binding.role === "script" ? binding.episodeId
    : binding.role === "character" ? binding.characterId
    : binding.role === "scene" ? binding.sceneId
    : binding.role === "imageAsset" ? binding.assetId : binding.shotId;
  return `${binding.role}:${binding.projectId}:${binding.episodeId}:${identity ?? ""}`;
}

export function resolveDramaCanvasRelation(sourceNode: Pick<GraphNode, "data">, targetNode: Pick<GraphNode, "data">): DramaCanvasRelation | undefined {
  const source = readDramaCanvasBinding(sourceNode.data);
  const target = readDramaCanvasBinding(targetNode.data);
  if (!source || !target || source.projectId !== target.projectId || source.episodeId !== target.episodeId) return;
  if (source.role === "script" && target.role === "scene") return { kind: "scriptScene", projectId: source.projectId, episodeId: source.episodeId, scriptVersionId: source.scriptVersionId, sceneId: target.sceneId };
  if (source.role === "scene" && target.role === "shot" && source.sceneId === target.sceneId) return { kind: "sceneShot", projectId: source.projectId, episodeId: source.episodeId, sceneId: source.sceneId, shotId: target.shotId };
  if (source.role === "character" && target.role === "shot") return { kind: "characterShot", projectId: source.projectId, episodeId: source.episodeId, characterId: source.characterId, shotId: target.shotId };
  if (source.role === "shot" && target.role === "gptImage" && source.shotId === target.shotId) return { kind: "shotImageGenerator", projectId: source.projectId, episodeId: source.episodeId, shotId: source.shotId };
  if (source.role === "gptImage" && target.role === "imageAsset" && source.shotId === target.shotId) return { kind: "generatorImageAsset", projectId: source.projectId, episodeId: source.episodeId, shotId: source.shotId, assetId: target.assetId };
}
