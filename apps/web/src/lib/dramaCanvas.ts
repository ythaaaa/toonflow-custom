import type { InjectionKey, ShallowRef } from "vue";
import type { GraphNode } from "@vue-flow/core";
import type { NodeHandle } from "@toonflow/nodes-scaffold/runtime";
import type { DramaCharacter, DramaProject } from "@toonflow/drama-workspace";
import { getMediaMimeType } from "@toonflow/node-shared/mediaTypes";

export type DramaCanvasRole = "script" | "character" | "scene" | "shot" | "gptImage" | "imageAsset" | "videoSegment";
export type DramaCanvasBinding = {
  role: DramaCanvasRole;
  projectId: string;
  episodeId: string;
  scriptVersionId?: string;
  characterId?: string;
  sceneId?: string;
  shotId?: string;
  assetId?: string;
  videoSegmentId?: string;
  order?: number;
};
export type DramaCanvasRelation = {
  kind: "scriptScene" | "scriptCharacter" | "sceneShot" | "characterShot" | "shotImageGenerator" | "generatorImageAsset" | "imageAssetImageGenerator" | "shotVideoSegment" | "imageAssetVideoSegment";
  projectId: string;
  episodeId: string;
  scriptVersionId?: string;
  characterId?: string;
  sceneId?: string;
  shotId?: string;
  assetId?: string;
  videoSegmentId?: string;
};
export type DramaCanvasRelationChange = { relation: DramaCanvasRelation; connected: boolean };
export type DramaCanvasState = { directory: string; manifestPath: string; episodeId: string; project: DramaProject };
export const dramaCanvasStateKey: InjectionKey<ShallowRef<DramaCanvasState | undefined>> = Symbol("dramaCanvasState");

export function dramaCharacterDisplayName(character: Pick<DramaCharacter, "name"> | undefined) {
  return character ? character.name?.trim() || "未命名人物" : "人物不存在";
}

export const dramaNodeHandles: Record<DramaCanvasRole, NodeHandle[]> = {
  script: [
    { id: "script", type: "source", dataType: "DRAMA_SCRIPT", label: "正式剧本" },
    { id: "characters", type: "source", dataType: "DRAMA_CHARACTER", label: "人物" },
  ],
  character: [
    { id: "script", type: "target", dataType: "DRAMA_CHARACTER", label: "剧本人物" },
    { id: "character", type: "source", dataType: "DRAMA_CHARACTER", label: "人物" },
  ],
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
    { id: "reference", type: "target", dataType: "DRAMA_IMAGE", label: "参考图片" },
    { id: "image", type: "source", dataType: "DRAMA_IMAGE", label: "生成图片" },
  ],
  imageAsset: [
    { id: "image", type: "target", dataType: "DRAMA_IMAGE", label: "生图结果" },
    { id: "reference", type: "source", dataType: "DRAMA_IMAGE", label: "参考图片" },
    { id: "media", type: "source", dataType: "IMAGE", label: "参考素材" },
  ],
  videoSegment: [
    { id: "directorShots", type: "target", dataType: "DRAMA_SHOT", label: "导演镜头" },
    { id: "in", type: "target", dataType: ["IMAGE", "VIDEO", "AUDIO", "STRING"], label: "生成参考" },
    { id: "video", type: "source", dataType: "VIDEO", label: "视频输出" },
  ],
};

export function resolveDramaReferenceImage(project: DramaProject, referenceId: string) {
  let reference: { name: string; description?: string; referencePath?: string } | undefined;
  if (referenceId.startsWith("character:")) {
    const character = project.characters.find(item => item.id === referenceId.slice("character:".length));
    if (character?.referencePath) reference = { name: `${character.name} · 人物参考`, description: character.appearance || character.description, referencePath: character.referencePath };
  } else if (referenceId.startsWith("look:")) {
    const [, characterId, lookId] = referenceId.split(":");
    const character = project.characters.find(item => item.id === characterId);
    const look = character?.looks?.find(item => item.id === lookId);
    if (look?.referencePath) reference = { name: `${character?.name ?? "人物"} · ${look.name}`, description: look.outfit, referencePath: look.referencePath };
  } else {
    const asset = project.assets.find(item => item.id === referenceId);
    if (asset?.referencePath) reference = asset;
  }
  if (!reference?.referencePath) return;
  const mimeType = getMediaMimeType({ name: reference.referencePath, type: "" });
  if (!mimeType.startsWith("image/")) return;
  return { id: referenceId, name: reference.name || "图片素材", description: reference.description ?? "", referencePath: reference.referencePath, mimeType };
}

export function readDramaCanvasBinding(value: unknown): DramaCanvasBinding | undefined {
  if (!value || typeof value !== "object") return;
  const binding = (value as { dramaBinding?: unknown }).dramaBinding;
  if (!binding || typeof binding !== "object") return;
  const item = binding as Partial<DramaCanvasBinding>;
  if (!["script", "character", "scene", "shot", "gptImage", "imageAsset", "videoSegment"].includes(item.role ?? "")
    || typeof item.projectId !== "string" || typeof item.episodeId !== "string") return;
  const expectedId: Partial<Record<DramaCanvasRole, keyof DramaCanvasBinding>> = {
    character: "characterId", scene: "sceneId", shot: "shotId", gptImage: "shotId", imageAsset: "assetId", videoSegment: "videoSegmentId",
  };
  const key = expectedId[item.role!];
  if (key && typeof item[key] !== "string") return;
  return item as DramaCanvasBinding;
}

export function dramaCanvasBindingKey(binding: DramaCanvasBinding) {
  const identity = binding.role === "script" ? binding.episodeId
    : binding.role === "character" ? binding.characterId
    : binding.role === "scene" ? binding.sceneId
    : binding.role === "imageAsset" ? binding.assetId
    : binding.role === "videoSegment" ? binding.videoSegmentId : binding.shotId;
  return `${binding.role}:${binding.projectId}:${binding.episodeId}:${identity ?? ""}`;
}

export function dramaCanvasNodeId(binding: DramaCanvasBinding) {
  return `dramaNode:${encodeURIComponent(dramaCanvasBindingKey(binding))}`;
}

export function dramaCanvasEdgeId(source: string, sourceHandle: string, target: string, targetHandle: string) {
  return `dramaEdge:${encodeURIComponent(`${source}|${sourceHandle}|${target}|${targetHandle}`)}`;
}

export function isDramaCanvasRelationKind(value: unknown): value is DramaCanvasRelation["kind"] {
  return ["scriptScene", "scriptCharacter", "sceneShot", "characterShot", "shotImageGenerator", "generatorImageAsset", "imageAssetImageGenerator", "shotVideoSegment", "imageAssetVideoSegment"].includes(String(value));
}

export function resolveDramaCanvasRelation(sourceNode: Pick<GraphNode, "data">, targetNode: Pick<GraphNode, "data">): DramaCanvasRelation | undefined {
  const source = readDramaCanvasBinding(sourceNode.data);
  const target = readDramaCanvasBinding(targetNode.data);
  if (!source || !target || source.projectId !== target.projectId || source.episodeId !== target.episodeId) return;
  if (source.role === "script" && target.role === "scene") return { kind: "scriptScene", projectId: source.projectId, episodeId: source.episodeId, scriptVersionId: source.scriptVersionId, sceneId: target.sceneId };
  if (source.role === "script" && target.role === "character") return { kind: "scriptCharacter", projectId: source.projectId, episodeId: source.episodeId, characterId: target.characterId };
  if (source.role === "scene" && target.role === "shot") return { kind: "sceneShot", projectId: source.projectId, episodeId: source.episodeId, sceneId: source.sceneId, shotId: target.shotId };
  if (source.role === "character" && target.role === "shot") return { kind: "characterShot", projectId: source.projectId, episodeId: source.episodeId, characterId: source.characterId, shotId: target.shotId };
  if (source.role === "shot" && target.role === "gptImage" && source.shotId === target.shotId) return { kind: "shotImageGenerator", projectId: source.projectId, episodeId: source.episodeId, shotId: source.shotId };
  if (source.role === "gptImage" && target.role === "imageAsset") return { kind: "generatorImageAsset", projectId: source.projectId, episodeId: source.episodeId, shotId: source.shotId, assetId: target.assetId };
  if (source.role === "imageAsset" && target.role === "gptImage") return { kind: "imageAssetImageGenerator", projectId: source.projectId, episodeId: source.episodeId, shotId: target.shotId, assetId: source.assetId };
  if (source.role === "shot" && target.role === "videoSegment") return { kind: "shotVideoSegment", projectId: source.projectId, episodeId: source.episodeId, shotId: source.shotId, videoSegmentId: target.videoSegmentId };
  if (source.role === "imageAsset" && target.role === "videoSegment") return { kind: "imageAssetVideoSegment", projectId: source.projectId, episodeId: source.episodeId, assetId: source.assetId, videoSegmentId: target.videoSegmentId };
}
