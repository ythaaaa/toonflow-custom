<template>
  <el-drawer v-model="visible" :title="shot ? `${shot.number} · ${scene?.heading || '镜头详情'}` : '镜头详情'" size="460px" appendToBody>
    <template v-if="shot && state">
      <el-form labelPosition="top" class="shotForm">
        <div class="shotMeta"><span>{{ shot.size || "未设景别" }}</span><span>{{ shot.angle || "未设机位" }}</span><span>{{ shot.duration }} 秒</span></div>
        <el-form-item label="所属场景"><el-select v-model="draft.sceneId" class="sceneSelect"><el-option label="暂不指定场景" value="" /><el-option v-for="item in activeScenes" :key="item.id" :label="item.heading || `场景 ${item.number}`" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="画面描述"><el-input v-model="draft.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="人物动作和表情"><el-input v-model="draft.action" type="textarea" :rows="2" /><el-input v-model="draft.expression" /></el-form-item>
        <el-form-item label="台词"><el-input v-model="draft.dialogue" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="视频提示词"><el-input v-model="draft.videoPrompt" type="textarea" :rows="2" /></el-form-item>
        <el-collapse><el-collapse-item title="高级设置" name="advanced"><div class="advancedFields"><el-form-item label="时长（秒）"><el-input-number v-model="draft.duration" :min="1" :max="600" /></el-form-item><el-form-item label="景别"><el-input v-model="draft.size" /></el-form-item><el-form-item label="机位"><el-input v-model="draft.angle" /></el-form-item></div></el-collapse-item></el-collapse>
        <el-form-item label="GPT 会员生图">
          <div class="imageTarget"><span>确认使用后关联到</span><el-select v-model="imageTarget" aria-label="图片关联类型"><el-option label="镜头首帧" value="firstFrame" /><el-option label="镜头尾帧" value="lastFrame" /><el-option label="镜头参考图" value="reference" /></el-select></div>
          <gptImageGenerator
            v-model:prompt="prompt"
            v-model:aspectRatio="aspectRatio"
            :projectId="state.project.id"
            :directory="state.directory"
            :referenceOptions="referenceOptions"
            :initialReferenceAssetIds="connectedReferenceIds"
            :initialImagePath="firstFrame?.referencePath"
            :initialImageLabel="firstFrame?.name || '镜头首帧素材'"
            :initialGeneratedImage="initialGeneratedImage"
            :generatedPersisted="generatedPersisted"
            :saving="saving"
            @generated="persistImage"
            @referencesUploaded="persistReferences"
            @useImage="applyImage" />
        </el-form-item>
        <div v-if="saveError" class="saveError" role="alert">{{ saveError }}</div>
      </el-form>
    </template>
    <template #footer><el-button @click="visible = false">关闭</el-button><el-button type="primary" :loading="saving" :disabled="!shot" @click="saveShot">保存镜头</el-button></template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import gptImageGenerator from "@/components/drama/gptImageGenerator.vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { saveDramaProject, updateShot, type DramaAsset, type DramaShot } from "@/lib/dramaWorkspace";
import { dramaCharacterDisplayName, type DramaCanvasBinding, type DramaCanvasState } from "@/lib/dramaCanvas";

type GeneratedImage = { path: string; mimeType: string; prompt: string; aspectRatio: string; referenceAssetIds: string[]; width?: number; height?: number };
const props = defineProps<{ binding: DramaCanvasBinding; state: DramaCanvasState; connectedReferenceIds: string[] }>();
const emit = defineEmits<{ saved: []; assetSaved: [asset: DramaAsset] }>();
const visible = ref(true);
const saving = ref(false);
const generatedPersistedPath = ref("");
const saveError = ref("");
const imageTarget = ref<"firstFrame" | "lastFrame" | "reference">("firstFrame");
const prompt = ref("");
const aspectRatio = ref("16:9");
const draft = ref<DramaShot>();
const episode = computed(() => props.state.project.episodes.find(item => item.id === props.binding.episodeId));
const activeScenes = computed(() => episode.value?.scenes.filter(item => !item.archived) ?? []);
const shot = computed(() => episode.value?.shots.find(item => item.id === props.binding.shotId));
const scene = computed(() => episode.value?.scenes.find(item => item.id === shot.value?.sceneId));
const firstFrame = computed(() => props.state.project.assets.find(item => item.id === shot.value?.firstFrameAssetId));
const latestGeneratedAsset = computed(() => props.state.project.assets.filter(item => item.kind === "image" && item.shotId === shot.value?.id && item.generatedBy === "gptImageSubscription").at(-1));
const initialGeneratedImage = computed<GeneratedImage | undefined>(() => {
  const asset = latestGeneratedAsset.value;
  if (!asset) return undefined;
  return {
    path: asset.referencePath, mimeType: imageMimeType(asset.referencePath), prompt: asset.description,
    aspectRatio: asset.requestedAspectRatio ?? "16:9", referenceAssetIds: asset.referenceAssetIds ?? [], width: asset.width, height: asset.height,
  };
});
const generatedPersisted = computed(() => !!generatedPersistedPath.value && props.state.project.assets.some(item => item.shotId === shot.value?.id && item.referencePath === generatedPersistedPath.value));
const referenceOptions = computed(() => [
  ...props.state.project.characters.filter(item => item.referencePath).map(item => ({ id: item.id, label: `人物 · ${dramaCharacterDisplayName(item)}`, referencePath: item.referencePath })),
  ...props.state.project.assets.filter(item => item.referencePath && item.kind === "image").map(item => {
    const character = item.characterId ? props.state.project.characters.find(candidate => candidate.id === item.characterId) : undefined;
    const label = item.characterId
      ? `人物 · ${dramaCharacterDisplayName(character)}${item.name ? ` · ${item.name}` : ""}`
      : `${item.sceneId ? "场景" : "素材"} · ${item.name || item.id}`;
    return { id: item.id, label, referencePath: item.referencePath };
  }),
]);
const connectedReferenceIds = computed(() => [...new Set([...(shot.value?.referenceAssetIds ?? []), ...props.connectedReferenceIds])]);

function imageMimeType(path: string) {
  const extension = path.toLowerCase().split(".").at(-1);
  return extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "";
}

watch(() => [props.binding.shotId, props.state] as const, () => {
  const current = shot.value;
  if (!current) { draft.value = undefined; return; }
  draft.value = structuredClone(current);
  prompt.value = current.imagePrompt || makePrompt(current);
  aspectRatio.value = ["1:1", "16:9", "9:16"].includes(current.aspectRatio ?? "") ? current.aspectRatio! : "16:9";
  generatedPersistedPath.value = latestGeneratedAsset.value?.referencePath ?? "";
  saveError.value = "";
}, { immediate: true });

function makePrompt(current: DramaShot) {
  return ["短剧分镜画面，单帧构图清晰，适合后续动画制作。", scene.value?.heading && `场景：${scene.value.heading}`, current.size && `景别：${current.size}`, current.angle && `机位：${current.angle}`, current.description && `画面：${current.description}`, current.action && `动作：${current.action}`, current.expression && `表情：${current.expression}`, props.state.project.style && `画面风格：${props.state.project.style}`].filter(Boolean).join("\n");
}

async function saveShot() {
  if (!draft.value || !shot.value || saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    await updateShot(useWorkspaceFiles(props.state.directory), props.state.project, props.state.episodeId, shot.value.id, {
      description: draft.value.description,
      sceneId: draft.value.sceneId,
      action: draft.value.action,
      expression: draft.value.expression,
      dialogue: draft.value.dialogue,
      videoPrompt: draft.value.videoPrompt,
      duration: draft.value.duration,
      size: draft.value.size,
      angle: draft.value.angle,
      imagePrompt: prompt.value,
      aspectRatio: aspectRatio.value,
    }, props.state.manifestPath);
    emit("saved");
    ElMessage.success("镜头已保存到短剧项目");
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "镜头保存失败";
    ElMessage.error(saveError.value);
  } finally { saving.value = false; }
}

async function persistImage(image: GeneratedImage) {
  if (!shot.value || saving.value) return;
  saving.value = true;
  generatedPersisted.value = false;
  saveError.value = "";
  try {
    const snapshot = structuredClone(props.state.project);
    const targetEpisode = snapshot.episodes.find(item => item.id === props.state.episodeId);
    const targetShot = targetEpisode?.shots.find(item => item.id === props.binding.shotId);
    if (!targetEpisode || !targetShot) throw new Error("镜头已变化，请重新打开后再生图");
    const asset: DramaAsset = {
      id: crypto.randomUUID(), kind: "image", name: `${shot.value.number} GPT 生图 ${new Date().toLocaleString()}`,
      description: image.prompt, referencePath: image.path, version: 1, generatedBy: "gptImageSubscription", modelId: "gpt-image-2.6-flare",
      generatedAt: new Date().toISOString(), requestedAspectRatio: image.aspectRatio, width: image.width, height: image.height,
      referenceAssetIds: image.referenceAssetIds, projectId: snapshot.id, episodeId: props.state.episodeId, sceneId: targetShot.sceneId, shotId: targetShot.id,
    };
    targetShot.aspectRatio = image.aspectRatio;
    targetShot.imagePrompt = image.prompt;
    snapshot.assets.push(asset);
    await saveDramaProject(useWorkspaceFiles(props.state.directory), snapshot, props.state.manifestPath);
    Object.assign(props.state.project, snapshot);
    prompt.value = image.prompt;
    generatedPersistedPath.value = image.path;
    emit("assetSaved", asset);
    emit("saved");
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "生成图片关联保存失败";
    ElMessage.error(saveError.value);
  } finally { saving.value = false; }
}

async function persistReferences(assets: DramaAsset[]) {
  if (!shot.value || saving.value || !assets.length) return;
  saving.value = true;
  saveError.value = "";
  try {
    const snapshot = structuredClone(props.state.project);
    const targetShot = snapshot.episodes.find(item => item.id === props.state.episodeId)?.shots.find(item => item.id === props.binding.shotId);
    if (!targetShot) throw new Error("镜头已变化，请重新打开后再上传参考图");
    const references = assets.map(item => ({ ...item, projectId: snapshot.id, episodeId: props.state.episodeId, sceneId: targetShot.sceneId, shotId: targetShot.id }));
    snapshot.assets.push(...references);
    targetShot.referenceAssetIds = [...new Set([...(targetShot.referenceAssetIds ?? []), ...references.map(item => item.id)])];
    await saveDramaProject(useWorkspaceFiles(props.state.directory), snapshot, props.state.manifestPath);
    Object.assign(props.state.project, snapshot);
    emit("saved");
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "参考图片关联保存失败";
    ElMessage.error(saveError.value);
  } finally { saving.value = false; }
}

async function applyImage(path: string) {
  if (!shot.value || saving.value) return;
  const asset = props.state.project.assets.find(item => item.shotId === shot.value?.id && item.referencePath === path);
  if (!asset) { ElMessage.error("生成图片尚未关联到此镜头"); return; }
  const patch: Partial<Omit<DramaShot, "id" | "number">> = { aspectRatio: asset.requestedAspectRatio ?? shot.value.aspectRatio };
  if (imageTarget.value === "firstFrame") patch.firstFrameAssetId = asset.id;
  if (imageTarget.value === "lastFrame") patch.lastFrameAssetId = asset.id;
  if (imageTarget.value === "reference") patch.referenceAssetIds = [...new Set([...(shot.value.referenceAssetIds ?? []), asset.id])];
  saving.value = true;
  saveError.value = "";
  try {
    await updateShot(useWorkspaceFiles(props.state.directory), props.state.project, props.state.episodeId, shot.value.id, patch, props.state.manifestPath);
    emit("saved");
    ElMessage.success(imageTarget.value === "firstFrame" ? "图片已关联为镜头首帧" : imageTarget.value === "lastFrame" ? "图片已关联为镜头尾帧" : "图片已关联为镜头参考素材");
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "镜头图片关联失败";
    ElMessage.error(saveError.value);
  } finally { saving.value = false; }
}
</script>

<style lang="scss" scoped>
.shotForm { display: grid; gap: 4px; }
.shotMeta, .imageTarget { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.shotMeta { color: var(--el-text-color-secondary); font-size: 12px; }
.sceneSelect { width: 100%; }
.imageTarget { margin-bottom: 10px; font-size: 12px; .el-select { width: 160px; } }
.saveError { color: var(--el-color-danger); font-size: 12px; }
</style>
