<template>
  <div class="timelineCanvas">
    <el-empty v-if="!sceneGroups.length" description="当前分集没有场景或镜头" />
    <section v-for="group in sceneGroups" :key="group.id" class="sceneTrack" :class="{ dropTarget: dropTargetSceneId === group.id }" @dragover.prevent="setDropTarget(group.id)" @drop.stop.prevent="dropAtEnd($event, group.id)">
      <header class="sceneTrackHeader">
        <div><span class="sceneTrackEyebrow">场景分组</span><h3>{{ group.scene?.heading || "未关联场景" }}<small v-if="group.scene?.archived">已归档</small></h3><p>{{ [group.scene?.location, group.scene?.dayPart, group.scene?.time].filter(Boolean).join(" · ") || "尚无地点和时段信息" }}</p></div>
        <div class="sceneTrackMeta"><span>{{ group.shots.length }} 个镜头</span><el-button v-if="group.scene && !group.scene.archived" size="small" @click="emit('addShot', group.scene.id)">在此场景新增镜头</el-button></div>
      </header>
      <div class="shotTrack" :style="{ '--shotCardWidth': `${Math.round(286 * zoom / 100)}px` }">
        <article v-for="(shot, index) in group.shots" :key="shot.id" class="timelineShotCard" :class="{ dragging: draggingShotId === shot.id, selected: selectedShotId === shot.id }" draggable="true" @dragstart.stop="startDrag($event, shot)" @dragend="clearDrag" @dragover.prevent @drop.stop.prevent="dropOnShot($event, shot, group.id)" @click="emit('openShot', shot)">
          <header class="shotCardHeader"><span class="dragGrip" aria-label="拖动调整镜头顺序">⠿</span><strong>{{ shot.number }}</strong><span class="shotSequence">{{ String(index + 1).padStart(2, "0") }}</span><el-tag size="small" :type="shotImage(shot).path ? 'success' : 'info'">{{ shotImage(shot).path ? "已有分镜图" : "待生图" }}</el-tag></header>
          <div class="shotFrame">
            <img v-if="previewUrls[shot.id]" :src="previewUrls[shot.id]" :alt="`${shot.number} 分镜预览`" loading="lazy" />
            <div v-else class="shotFramePlaceholder"><span>尚无分镜图片</span><el-button link type="primary" @click.stop="emit('generateShot', shot)">GPT 会员生图</el-button></div>
          </div>
          <div class="shotCardBody"><div class="shotCardMeta"><strong>{{ shot.size || "景别待定" }}</strong><span>{{ shot.angle || "机位待定" }}</span><span>{{ shot.duration }} 秒</span></div><p>{{ shot.description || "尚未填写画面描述" }}</p><div class="shotStatus"><span>图片 {{ shotImage(shot).generated ? "订阅生图" : shotImage(shot).path ? "已关联" : "待生成" }}</span><span>视频 {{ shot.productionStatus || "待制作" }}</span></div></div>
          <footer class="shotCardActions"><el-button size="small" @click.stop="emit('openShot', shot)">详情 / 编辑</el-button><el-button size="small" type="primary" @click.stop="emit('generateShot', shot)">{{ shotImage(shot).path ? "重新生成" : "GPT 生图" }}</el-button><el-button size="small" @click.stop="emit('copyShot', shot)">复制</el-button><el-button size="small" type="danger" plain @click.stop="emit('deleteShot', shot)">删除</el-button></footer>
        </article>
        <div v-if="group.shots.length" class="trackEndDrop" @dragover.prevent @drop.stop.prevent="dropAtEnd($event, group.id)"><span>＋</span>拖到这里移入本场景末尾</div>
        <div v-else-if="group.scene && !group.scene.archived" class="emptySceneDrop" @dragover.prevent @drop.stop.prevent="dropAtEnd($event, group.id)"><span>将已有镜头拖到这里</span><el-button type="primary" plain @click.stop="emit('addShot', group.scene.id)">＋ 新增场景镜头</el-button></div>
        <div v-else class="emptyArchivedScene">该场景当前没有镜头</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from "vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { DramaAsset, DramaScene, DramaShot } from "@/lib/dramaWorkspace";

type ShotMove = { shotId: string; sceneId: string; targetShotId?: string; position: "before" | "after" | "end" };
type SceneGroup = { id: string; scene?: DramaScene; shots: DramaShot[] };
const props = defineProps<{
  scenes: DramaScene[];
  shots: DramaShot[];
  assets: DramaAsset[];
  directory: string;
  sceneFilter: string;
  selectedShotId: string;
  zoom: number;
}>();
const emit = defineEmits<{
  openShot: [shot: DramaShot];
  generateShot: [shot: DramaShot];
  copyShot: [shot: DramaShot];
  deleteShot: [shot: DramaShot];
  addShot: [sceneId: string];
  moveShot: [move: ShotMove];
}>();

const draggingShotId = ref("");
const dropTargetSceneId = ref("");
const previewUrls = ref<Record<string, string>>({});
let previewReleases: (() => void)[] = [];
let previewRequest = 0;

const orderedShots = computed(() => props.shots.slice().sort((left, right) => (left.order ?? 0) - (right.order ?? 0)));
const sceneGroups = computed<SceneGroup[]>(() => {
  const groups: SceneGroup[] = props.scenes.slice().sort((left, right) => (left.order ?? left.number) - (right.order ?? right.number)).map(scene => ({ id: scene.id, scene, shots: [] }));
  const byId = new Map(groups.map(group => [group.id, group]));
  for (const shot of orderedShots.value) {
    const groupId = shot.sceneId || "__unassigned__";
    let group = byId.get(groupId);
    if (!group) {
      group = { id: groupId, shots: [] };
      groups.push(group);
      byId.set(groupId, group);
    }
    group.shots.push(shot);
  }
  return groups.filter(group => props.sceneFilter === "all" || group.id === props.sceneFilter);
});
const previewItems = computed(() => sceneGroups.value.flatMap(group => group.shots.map(shot => ({ shotId: shot.id, ...shotImage(shot) })).filter(item => item.path)));
const previewKey = computed(() => JSON.stringify([props.directory, previewItems.value.map(item => [item.shotId, item.path])]));

watch(previewKey, async () => {
  const request = ++previewRequest;
  if (!props.directory) {
    previewReleases.forEach(release => release());
    previewReleases = [];
    previewUrls.value = {};
    return;
  }
  const items = previewItems.value;
  const nextUrls: Record<string, string> = {};
  const nextReleases: (() => void)[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]!;
      const preview = useWorkspaceFiles(props.directory).acquireUrl(item.path, imageMimeType(item.path));
      try {
        nextUrls[item.shotId] = await preview.url;
        nextReleases.push(preview.release);
      } catch { preview.release(); }
    }
  }));
  if (request !== previewRequest) { nextReleases.forEach(release => release()); return; }
  previewReleases.forEach(release => release());
  previewReleases = nextReleases;
  previewUrls.value = nextUrls;
}, { immediate: true });
onScopeDispose(() => { previewRequest++; previewReleases.forEach(release => release()); });

function shotImage(shot: DramaShot) {
  const frameAsset = props.assets.find(asset => asset.id === shot.firstFrameAssetId && asset.kind === "image");
  const generatedAsset = props.assets.filter(asset => asset.kind === "image" && asset.shotId === shot.id).at(-1);
  const fallbackAsset = props.assets.find(asset => asset.kind === "image" && asset.referencePath === shot.referencePath);
  const asset = frameAsset ?? generatedAsset ?? fallbackAsset;
  return { path: asset?.referencePath || shot.referencePath || "", generated: asset?.generatedBy === "gptImageSubscription" };
}
function imageMimeType(path: string) {
  const extension = path.toLowerCase().split(".").at(-1);
  return extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : undefined;
}
function startDrag(event: DragEvent, shot: DramaShot) {
  draggingShotId.value = shot.id;
  dropTargetSceneId.value = "";
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-toonflow-shot-id", shot.id);
    event.dataTransfer.setData("text/plain", shot.id);
  }
}
function setDropTarget(sceneId: string) {
  if (draggingShotId.value) dropTargetSceneId.value = sceneId;
}
function clearDrag() {
  draggingShotId.value = "";
  dropTargetSceneId.value = "";
}
function dropOnShot(event: DragEvent, target: DramaShot, sceneId: string) {
  const shotId = event.dataTransfer?.getData("application/x-toonflow-shot-id") || event.dataTransfer?.getData("text/plain");
  if (!shotId || shotId === target.id) return;
  const card = event.currentTarget as HTMLElement;
  const position = event.clientX > card.getBoundingClientRect().left + card.getBoundingClientRect().width / 2 ? "after" : "before";
  emit("moveShot", { shotId, sceneId, targetShotId: target.id, position });
  clearDrag();
}
function dropAtEnd(event: DragEvent, sceneId: string) {
  const shotId = event.dataTransfer?.getData("application/x-toonflow-shot-id") || event.dataTransfer?.getData("text/plain");
  if (!shotId) return;
  emit("moveShot", { shotId, sceneId, position: "end" });
  clearDrag();
}
</script>

<style lang="scss" scoped>
.timelineCanvas { display: grid; gap: 14px; min-height: 260px; padding: 16px; overflow: auto; color: #e6edf6; background: #10151d; border: 1px solid #2a3442; border-radius: 8px; }
.sceneTrack { min-width: 0; padding: 14px; background: #171e28; border: 1px solid #303b4a; border-radius: 7px; }
.sceneTrack.dropTarget { border-color: #68a8ff; box-shadow: inset 0 0 0 1px #68a8ff; }
.sceneTrackHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; padding-bottom: 11px; border-bottom: 1px solid #303b4a; h3 { display: flex; align-items: center; gap: 8px; margin: 3px 0; font-size: 15px; } h3 small { color: #f0a94b; font-size: 11px; font-weight: 400; } p { margin: 0; color: #8d9bad; font-size: 12px; } }
.sceneTrackEyebrow { color: #8294a9; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
.sceneTrackMeta { display: flex; align-items: center; gap: 10px; color: #a7b5c7; font-size: 12px; white-space: nowrap; }
.shotTrack { display: flex; align-items: stretch; gap: 12px; min-height: 330px; overflow-x: auto; padding: 2px 2px 10px; }
.timelineShotCard { display: flex; flex: 0 0 var(--shotCardWidth); flex-direction: column; gap: 9px; width: var(--shotCardWidth); min-width: 220px; padding: 10px; overflow: hidden; background: #202a36; border: 1px solid #3b4858; border-radius: 7px; cursor: pointer; transition: border-color .15s ease, opacity .15s ease; &:hover, &.selected { border-color: #68a8ff; } &.dragging { opacity: .45; } }
.shotCardHeader { display: flex; align-items: center; gap: 7px; min-height: 22px; strong { color: #dce9f7; font-size: 13px; } }
.dragGrip { color: #7890aa; font-size: 17px; cursor: grab; }
.shotSequence { margin-left: auto; color: #8393a7; font: 11px ui-monospace, monospace; }
.shotFrame { display: grid; place-items: center; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: #111821; border: 1px solid #334052; border-radius: 4px; img { display: block; width: 100%; height: 100%; object-fit: cover; } }
.shotFramePlaceholder { display: grid; justify-items: center; gap: 4px; color: #8999ac; font-size: 11px; }
.shotCardBody { display: grid; gap: 6px; min-height: 74px; .shotCardMeta { display: flex; flex-wrap: wrap; gap: 8px; color: #aab8c8; font-size: 11px; } .shotCardMeta strong { color: #dce9f7; } p { display: -webkit-box; margin: 0; overflow: hidden; color: #c4cfdb; font-size: 12px; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 3; } }
.shotStatus { display: flex; flex-wrap: wrap; gap: 9px; color: #7f91a6; font-size: 10px; }
.shotCardActions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: auto; padding-top: 8px; border-top: 1px solid #344050; :deep(.el-button + .el-button) { margin-left: 0; } :deep(.el-button) { padding: 6px 8px; } }
.trackEndDrop, .emptySceneDrop, .emptyArchivedScene { display: grid; flex: 0 0 170px; place-content: center; justify-items: center; gap: 8px; min-height: 270px; padding: 12px; color: #7f91a6; text-align: center; border: 1px dashed #46566a; border-radius: 6px; font-size: 11px; }
.trackEndDrop { cursor: copy; &:hover { color: #acd1ff; border-color: #68a8ff; } span { font-size: 22px; } }
.emptySceneDrop { flex: 1 0 280px; background: #19232f; }
.emptyArchivedScene { flex: 1 0 180px; }
@media (max-width: 700px) { .timelineCanvas { padding: 8px; } .sceneTrack { padding: 10px; } .sceneTrackHeader { align-items: flex-start; flex-direction: column; } .sceneTrackMeta { width: 100%; justify-content: space-between; } }
</style>
