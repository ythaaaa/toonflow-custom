<template>
  <article class="dramaNode" :class="[`role${binding?.role || 'unknown'}`, { selected }]" @click.stop="selectNode">
    <handle
      v-for="(item, index) in handles"
      :id="item.id"
      :key="item.id"
      class="dramaHandle"
      :type="item.type"
      :position="item.type === 'target' ? Position.Left : Position.Right"
      :isValidConnection="isValidDramaConnection"
      :style="{ top: handleTop(item) }"
      :title="item.label || item.id"
      :aria-label="item.label || item.id" />
    <div class="nodeHeader">
      <span class="nodeRole">{{ roleLabel }}</span>
      <strong>{{ entity.title }}</strong>
    </div>
    <img v-if="previewUrl" class="nodeImage" :src="previewUrl" :alt="entity.title" />
    <p v-if="entity.description">{{ entity.description }}</p>
    <el-button v-if="binding?.role === 'shot' || binding?.role === 'gptImage'" class="openShotButton nodrag nopan" size="small" text type="primary" @click.stop="selectNode">
      {{ binding.role === "gptImage" ? "打开 GPT 生图" : "查看镜头与生图" }}
    </el-button>
  </article>
</template>

<script setup lang="ts">
import { computed, inject, onScopeDispose, ref, watch } from "vue";
import { Handle, Position, useVueFlow, type Connection, type GraphNode, type NodeProps } from "@vue-flow/core";
import { isTypeCompatible, validateConnection, type NodeHandle } from "@toonflow/nodes-scaffold/runtime";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { dramaCanvasStateKey, readDramaCanvasBinding, resolveDramaCanvasRelation, type DramaCanvasRole } from "@/lib/dramaCanvas";

const props = defineProps<NodeProps>();
const flow = useVueFlow();
const dramaCanvasState = inject(dramaCanvasStateKey);
const data = computed(() => props.data as { label?: string; handles?: NodeHandle[]; dramaBinding?: unknown });
const binding = computed(() => readDramaCanvasBinding(data.value));
const handles = computed(() => Array.isArray(data.value.handles) ? data.value.handles : []);
const targetHandles = computed(() => handles.value.filter(item => item.type === "target"));
const sourceHandles = computed(() => handles.value.filter(item => item.type === "source"));
const selected = computed(() => props.selected);
const roleLabel = computed(() => ({ script: "正式剧本", character: "人物", scene: "场景", shot: "镜头", gptImage: "GPT 会员生图", imageAsset: "图片素材" } satisfies Record<DramaCanvasRole, string>)[binding.value?.role ?? "script"]);
const entity = computed(() => {
  const currentBinding = binding.value;
  const currentProject = dramaCanvasState?.value?.project;
  const episode = currentProject?.episodes.find(item => item.id === currentBinding?.episodeId);
  if (!currentBinding || !currentProject || !episode || currentProject.id !== currentBinding.projectId) {
    return { title: data.value.label || "短剧节点", description: "关联项目或分集当前不可用", imagePath: "" };
  }
  if (currentBinding.role === "script") {
    const version = currentProject.scriptVersions[episode.id]?.find(item => item.id === episode.formalVersionId);
    return { title: version ? `V${String(version.version).padStart(3, "0")} · ${episode.title}` : `${episode.title} · 尚无正式剧本`, description: version ? "正式剧本只读引用" : "画布操作不会覆盖正式剧本", imagePath: "" };
  }
  if (currentBinding.role === "character") {
    const character = currentProject.characters.find(item => item.id === currentBinding.characterId);
    return { title: character?.name || "人物已不存在", description: character?.appearance || character?.description || "", imagePath: character?.referencePath || "" };
  }
  if (currentBinding.role === "scene") {
    const scene = episode.scenes.find(item => item.id === currentBinding.sceneId);
    const asset = currentProject.assets.find(item => item.id === scene?.referenceAssetId);
    return { title: scene ? `S${String(scene.number).padStart(3, "0")} · ${scene.heading || scene.location || "未命名场景"}` : "场景已不存在", description: [scene?.location, scene?.time, scene?.description].filter(Boolean).join(" · "), imagePath: asset?.referencePath || "" };
  }
  if (currentBinding.role === "shot" || currentBinding.role === "gptImage") {
    const shot = episode.shots.find(item => item.id === currentBinding.shotId);
    const asset = currentProject.assets.find(item => item.id === shot?.firstFrameAssetId)
      ?? currentProject.assets.find(item => item.shotId === shot?.id && item.kind === "image");
    return { title: shot ? `${currentBinding.role === "gptImage" ? "GPT · " : ""}${shot.number}` : "镜头已不存在", description: shot ? [shot.size, shot.angle, shot.description].filter(Boolean).join(" · ") : "", imagePath: asset?.referencePath || "" };
  }
  const asset = currentProject.assets.find(item => item.id === currentBinding.assetId);
  return { title: asset?.name || "图片素材已不存在", description: asset?.description || "", imagePath: asset?.referencePath || "" };
});
const previewUrl = ref("");
let releasePreview: (() => void) | undefined;
let previewRequest = 0;
watch(() => [dramaCanvasState?.value?.directory, entity.value.imagePath] as const, async ([directory, path]) => {
  const request = ++previewRequest;
  if (!directory || !path) {
    releasePreview?.();
    releasePreview = undefined;
    previewUrl.value = "";
    return;
  }
  const acquired = useWorkspaceFiles(directory).acquireUrl(path);
  try {
    const url = await acquired.url;
    if (request !== previewRequest) { acquired.release(); return; }
    releasePreview?.();
    releasePreview = acquired.release;
    previewUrl.value = url;
  } catch {
    acquired.release();
    if (request === previewRequest) previewUrl.value = "";
  }
}, { immediate: true });
onScopeDispose(() => releasePreview?.());

function isValidDramaConnection(connection: Connection) {
  const sourceNode = flow.findNode(connection.source);
  const targetNode = flow.findNode(connection.target);
  if (!sourceNode || !targetNode || !resolveDramaCanvasRelation(sourceNode, targetNode)) return false;
  const sourceHandle = (sourceNode.data.handles as NodeHandle[] | undefined)?.find(item => item.id === connection.sourceHandle && item.type === "source");
  const targetHandle = (targetNode.data.handles as NodeHandle[] | undefined)?.find(item => item.id === connection.targetHandle && item.type === "target");
  return !!sourceHandle && !!targetHandle && isTypeCompatible(sourceHandle.dataType, targetHandle.dataType)
    && validateConnection(connection, { sourceNode, targetNode, nodes: flow.getNodes.value, edges: flow.getEdges.value });
}

function handleTop(item: NodeHandle) {
  const collection = item.type === "target" ? targetHandles.value : sourceHandles.value;
  return `${((collection.findIndex(handle => handle.id === item.id) + 1) / (collection.length + 1)) * 100}%`;
}

function selectNode() {
  const node = flow.findNode(props.id) as GraphNode | undefined;
  if (node) flow.addSelectedNodes([node]);
}
</script>

<style lang="scss" scoped>
.dramaNode {
  position: relative;
  display: grid;
  gap: 8px;
  width: 250px;
  min-height: 104px;
  padding: 14px;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px #0005;

  &.selected { border-color: var(--el-color-primary); box-shadow: 0 0 0 2px var(--el-color-primary-light-8), 0 8px 24px #0005; }

  .nodeHeader { display: grid; gap: 4px; min-width: 0; }
  .nodeRole { color: var(--el-color-primary); font-size: 11px; }
  strong, p { overflow-wrap: anywhere; }
  strong { font-size: 14px; }
  p { margin: 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
  .nodeImage { display: block; width: 100%; max-height: 150px; object-fit: cover; border-radius: 6px; }
  .dramaHandle { width: 10px; height: 10px; border: 2px solid var(--el-color-primary); background: var(--el-bg-color); }
  .openShotButton { justify-self: start; margin: 0; padding: 0; }
}
</style>
