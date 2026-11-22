<template>
  <el-drawer v-model="visible" :title="shot ? `${shot.number} · ${scene?.heading || '镜头详情'}` : '镜头详情'" size="480px" appendToBody>
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
          <div class="imageTarget"><span>应用生成图片为</span><el-select v-model="imageTarget" aria-label="图片关联类型"><el-option label="镜头首帧" value="firstFrame" /><el-option label="镜头尾帧" value="lastFrame" /><el-option label="镜头参考图" value="reference" /></el-select></div>
          <gptImageGenerator
            v-model:prompt="prompt"
            v-model:aspectRatio="aspectRatio"
            :projectId="state.project.id"
            :directory="state.directory"
            :generationTarget="shot.number"
            :referenceOptions="referenceOptions"
            :initialReferenceAssetIds="automaticReferenceIds"
            :initialImagePath="firstFrame?.referencePath"
            :initialImageLabel="firstFrame?.name || '镜头首帧素材'"
            :initialGeneratedImage="initialGeneratedImage"
            :generatedPersisted="generatedPersisted"
            :saving="saving"
            @generated="persistImage"
            @referencesUploaded="persistReferences"
            @useImage="applyImage" />
          <section v-if="generatedAssets.length" class="generationHistory" aria-label="GPT 生图历史结果">
            <strong>生成结果（{{ generatedAssets.length }}）</strong>
            <article v-for="asset in generatedAssets" :key="asset.id" class="generationItem">
              <button class="historyPreview" type="button" :aria-label="`放大预览 ${asset.name || asset.id}`" @click="openGeneratedPreview(asset)">
                <mentionThumbnail :thumbnail="{ url: asset.referencePath, mimeType: imageMimeType(asset.referencePath) }" :directory="state.directory"><icon-photo :size="28" aria-hidden="true" /></mentionThumbnail>
              </button>
              <div class="generationInfo">
                <strong>{{ asset.name || asset.id }}</strong>
                <span>{{ generationDate(asset) }} · {{ asset.requestedAspectRatio || "画幅未记录" }}<template v-if="asset.modelId"> · {{ asset.modelId }}</template></span>
                <span>参考来源：{{ referenceSummary(asset) }}</span>
                <p>{{ asset.description || "未记录提示词" }}</p>
                <div class="usageState">
                  <el-tag v-if="shot.firstFrameAssetId === asset.id" size="small" type="success">首帧</el-tag>
                  <el-tag v-if="shot.lastFrameAssetId === asset.id" size="small" type="success">尾帧</el-tag>
                  <el-tag v-if="shot.referenceAssetIds?.includes(asset.id)" size="small" type="info">参考图</el-tag>
                  <span v-if="shot.firstFrameAssetId !== asset.id && shot.lastFrameAssetId !== asset.id && !shot.referenceAssetIds?.includes(asset.id)">尚未用于镜头</span>
                  <el-button size="small" type="primary" plain :loading="saving" @click="applyAsset(asset.id, imageTarget)">应用为{{ imageTargetLabel }}</el-button>
                </div>
              </div>
            </article>
          </section>
        </el-form-item>
        <div v-if="saveError" class="saveError" role="alert">{{ saveError }}</div>
      </el-form>
    </template>
    <template #footer><el-button @click="visible = false">关闭</el-button><el-button type="primary" :loading="saving" :disabled="!shot" @click="saveShot">保存镜头</el-button></template>
  </el-drawer>
  <el-dialog v-model="previewVisible" title="生成图片预览" width="min(900px, 92vw)" appendToBody @closed="releaseGeneratedPreview">
    <el-image v-if="generatedPreviewUrl" class="generatedPreview" :src="generatedPreviewUrl" :previewSrcList="[generatedPreviewUrl]" :previewTeleported="true" fit="contain" />
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { IconPhoto } from "@tabler/icons-vue";
import gptImageGenerator from "@/components/drama/gptImageGenerator.vue";
import mentionThumbnail from "@/components/agent/mentionThumbnail.vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { saveDramaProject, updateShot, type DramaAsset, type DramaProject, type DramaShot } from "@/lib/dramaWorkspace";
import { dramaCharacterDisplayName, type DramaCanvasBinding, type DramaCanvasState } from "@/lib/dramaCanvas";
import type { DramaWorkspaceFiles } from "@toonflow/drama-workspace";

type GeneratedImage = { path: string; mimeType: string; prompt: string; aspectRatio: string; modelId: string; referenceAssetIds: string[]; width?: number; height?: number };
type ReferenceOption = { id: string; label: string; referencePath: string; source: string; kind: "asset" | "character" | "legacy"; referenceId?: string };
type ProjectMutation = (files: DramaWorkspaceFiles, project: DramaProject, manifestPath: string) => Promise<void>;
const props = defineProps<{ binding: DramaCanvasBinding; state: DramaCanvasState; connectedReferenceIds: string[]; mutateProject: (mutation: ProjectMutation) => Promise<DramaProject> }>();
const emit = defineEmits<{ saved: []; assetSaved: [asset: DramaAsset] }>();
const visible = ref(true);
const saving = ref(false);
const generatedPersistedPath = ref("");
const saveError = ref("");
const imageTarget = ref<"firstFrame" | "lastFrame" | "reference">("firstFrame");
const prompt = ref("");
const aspectRatio = ref("16:9");
const draft = ref<DramaShot>();
const previewVisible = ref(false);
const generatedPreviewUrl = ref("");
let releaseGeneratedUrl: (() => void) | undefined;
const episode = computed(() => props.state.project.episodes.find(item => item.id === props.binding.episodeId));
const activeScenes = computed(() => episode.value?.scenes.filter(item => !item.archived) ?? []);
const shot = computed(() => episode.value?.shots.find(item => item.id === props.binding.shotId));
const scene = computed(() => episode.value?.scenes.find(item => item.id === shot.value?.sceneId));
const firstFrame = computed(() => props.state.project.assets.find(item => item.id === shot.value?.firstFrameAssetId && item.kind === "image"));
const generatedAssets = computed(() => {
  const currentShot = shot.value;
  if (!currentShot) return [];
  const seen = new Set<string>();
  return props.state.project.assets.filter(item => item.kind === "image" && item.generatedBy === "gptImageSubscription"
    && item.shotId === currentShot.id && (!item.projectId || item.projectId === props.state.project.id)
    && (!item.episodeId || item.episodeId === props.state.episodeId) && !seen.has(item.id) && !!seen.add(item.id))
    .slice().sort((left, right) => Date.parse(right.generatedAt ?? "") - Date.parse(left.generatedAt ?? ""));
});
const latestGeneratedAsset = computed(() => generatedAssets.value[0]);
const initialGeneratedImage = computed<GeneratedImage | undefined>(() => {
  const asset = latestGeneratedAsset.value;
  if (!asset) return undefined;
  return {
    path: asset.referencePath, mimeType: imageMimeType(asset.referencePath), prompt: asset.description,
    aspectRatio: asset.requestedAspectRatio ?? "16:9", modelId: asset.modelId ?? "", referenceAssetIds: asset.referenceAssetIds ?? [], width: asset.width, height: asset.height,
  };
});
const generatedPersisted = computed(() => !!generatedPersistedPath.value && generatedAssets.value.some(item => item.referencePath === generatedPersistedPath.value));
const imageTargetLabel = computed(() => imageTarget.value === "firstFrame" ? "首帧" : imageTarget.value === "lastFrame" ? "尾帧" : "参考图");
const referenceOptions = computed<ReferenceOption[]>(() => {
  const options: ReferenceOption[] = [];
  const add = (item: ReferenceOption) => {
    if (!item.referencePath || !imageMimeType(item.referencePath)) return;
    const samePath = options.find(option => option.referencePath === item.referencePath);
    if (samePath) {
      samePath.source = [...new Set([...samePath.source.split("、"), ...item.source.split("、")])].join("、");
      return;
    }
    options.push(item);
  };
  for (const item of props.state.project.assets.filter(asset => asset.kind === "image" && asset.referencePath
    && (!asset.projectId || asset.projectId === props.state.project.id)
    && (!asset.episodeId || asset.episodeId === props.state.episodeId))) {
    const character = item.characterId ? props.state.project.characters.find(candidate => candidate.id === item.characterId) : undefined;
    const linkedShot = item.shotId ? episode.value?.shots.find(candidate => candidate.id === item.shotId) : undefined;
    const linkedScene = item.sceneId ? episode.value?.scenes.find(candidate => candidate.id === item.sceneId) : undefined;
    const source = character ? `人物 · ${dramaCharacterDisplayName(character)}`
      : linkedShot ? `镜头 · ${linkedShot.number}`
        : linkedScene ? `场景 · ${linkedScene.heading || linkedScene.location || "未命名场景"}`
          : "项目素材库";
    add({ id: item.id, referenceId: item.id, label: `${source} · ${item.name || item.id}`, referencePath: item.referencePath, source, kind: "asset" });
  }
  for (const character of props.state.project.characters.filter(item => !item.archived && item.referencePath)) {
    add({ id: `character:${character.id}`, referenceId: character.id, label: `人物 · ${dramaCharacterDisplayName(character)}`, referencePath: character.referencePath, source: "人物定妆图", kind: "character" });
  }
  if (shot.value?.referencePath) add({ id: `legacyShot:${shot.value.id}`, label: `${shot.value.number} 旧版参考图`, referencePath: shot.value.referencePath, source: "镜头旧版参考图", kind: "legacy" });
  return options;
});
const automaticReferenceIds = computed(() => {
  const currentShot = shot.value;
  if (!currentShot) return [];
  const ids = new Set<string>([
    ...(currentShot.referenceAssetIds ?? []),
    ...(currentShot.firstFrameAssetId ? [currentShot.firstFrameAssetId] : []),
    ...(currentShot.lastFrameAssetId ? [currentShot.lastFrameAssetId] : []),
    ...props.connectedReferenceIds,
  ]);
  const currentScene = scene.value;
  if (currentScene) {
    if (currentScene.referenceAssetId) ids.add(currentScene.referenceAssetId);
    for (const asset of props.state.project.assets.filter(item => item.kind === "image" && item.sceneId === currentScene.id
      && (!item.projectId || item.projectId === props.state.project.id) && (!item.episodeId || item.episodeId === props.state.episodeId))) ids.add(asset.id);
  }
  const characterIds = new Set([...(currentShot.characterIds ?? []), ...props.connectedReferenceIds.filter(id => props.state.project.characters.some(item => item.id === id))]);
  for (const characterId of characterIds) {
    const character = props.state.project.characters.find(item => item.id === characterId && !item.archived);
    if (!character) continue;
    const matchingAsset = props.state.project.assets.find(item => item.kind === "image" && item.referencePath === character.referencePath
      && (!item.projectId || item.projectId === props.state.project.id) && (!item.episodeId || item.episodeId === props.state.episodeId));
    ids.add(matchingAsset?.id ?? character.id);
    for (const asset of props.state.project.assets.filter(item => item.kind === "image" && item.characterId === character.id
      && (!item.projectId || item.projectId === props.state.project.id) && (!item.episodeId || item.episodeId === props.state.episodeId))) ids.add(asset.id);
  }
  if (currentShot.referencePath) ids.add(`legacyShot:${currentShot.id}`);
  return [...ids];
});
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
    const snapshot = { ...draft.value };
    await props.mutateProject(async (files, project, manifestPath) => {
      const current = project.episodes.find(item => item.id === props.state.episodeId)?.shots.find(item => item.id === props.binding.shotId);
      if (!current) throw new Error("镜头已变化，请重新打开后保存");
      await updateShot(files, project, props.state.episodeId, current.id, {
        description: snapshot.description, sceneId: snapshot.sceneId, action: snapshot.action, expression: snapshot.expression,
        dialogue: snapshot.dialogue, videoPrompt: snapshot.videoPrompt, duration: snapshot.duration, size: snapshot.size,
        angle: snapshot.angle, imagePrompt: prompt.value, aspectRatio: aspectRatio.value,
      }, manifestPath);
    });
    emit("saved");
    ElMessage.success("镜头已保存到短剧项目");
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "镜头保存失败";
    ElMessage.error(saveError.value);
  } finally { saving.value = false; }
}

async function persistImage(image: GeneratedImage) {
  if (!shot.value || saving.value) return;
  const projectId = props.state.project.id;
  const episodeId = props.state.episodeId;
  const shotId = shot.value.id;
  const outputPrefix = `.toonflow/drama/assets/${projectId}/generated/`;
  if (!image.path.startsWith(outputPrefix) || image.path.includes("..")) { ElMessage.error("生成结果路径不属于当前项目，未关联素材"); return; }
  saving.value = true;
  saveError.value = "";
  try {
    let savedAsset: DramaAsset | undefined;
    await props.mutateProject(async (files, project, manifestPath) => {
      const snapshot = structuredClone(project);
      const targetShot = snapshot.episodes.find(item => item.id === episodeId)?.shots.find(item => item.id === shotId);
      if (snapshot.id !== projectId || !targetShot) throw new Error("项目或镜头已变化，请重新打开后生图");
      const validReferenceIds = new Set([
        ...snapshot.assets.filter(item => item.kind === "image" && (!item.projectId || item.projectId === projectId)
          && (!item.episodeId || item.episodeId === episodeId)).map(item => item.id),
        ...snapshot.characters.filter(item => !item.archived).map(item => item.id),
      ]);
      const referenceAssetIds = [...new Set(image.referenceAssetIds)].filter(id => validReferenceIds.has(id));
      const version = Math.max(0, ...snapshot.assets.filter(item => item.generatedBy === "gptImageSubscription" && item.shotId === shotId).map(item => item.version)) + 1;
      const asset: DramaAsset = {
        id: crypto.randomUUID(), kind: "image", name: `${shot.value!.number} GPT 生图 v${version}`,
        description: image.prompt, referencePath: image.path, version, generatedBy: "gptImageSubscription", modelId: image.modelId,
        generatedAt: new Date().toISOString(), requestedAspectRatio: image.aspectRatio, width: image.width, height: image.height,
        referenceAssetIds, projectId, episodeId, sceneId: targetShot.sceneId || undefined, shotId,
      };
      targetShot.aspectRatio = image.aspectRatio;
      targetShot.imagePrompt = image.prompt;
      snapshot.assets.push(asset);
      await saveDramaProject(files, snapshot, manifestPath);
      const saved = await files.readJson<DramaProject>(manifestPath);
      savedAsset = saved.assets.find(item => item.id === asset.id && item.referencePath === image.path && item.shotId === shotId);
      if (saved.id !== projectId || !savedAsset || savedAsset.modelId !== image.modelId
        || savedAsset.description !== image.prompt || savedAsset.requestedAspectRatio !== image.aspectRatio
        || JSON.stringify(savedAsset.referenceAssetIds ?? []) !== JSON.stringify(referenceAssetIds)) throw new Error("生成素材记录回读校验失败；生成文件已保留，请重新载入");
      Object.assign(project, saved);
    });
    if (!savedAsset) throw new Error("生成完成，但项目素材记录未确认");
    prompt.value = image.prompt;
    generatedPersistedPath.value = image.path;
    emit("assetSaved", savedAsset);
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
    await props.mutateProject(async (files, project, manifestPath) => {
      const snapshot = structuredClone(project);
      const targetShot = snapshot.episodes.find(item => item.id === props.state.episodeId)?.shots.find(item => item.id === props.binding.shotId);
      if (!targetShot) throw new Error("镜头已变化，请重新打开后再上传参考图");
      const references = assets.map(item => ({ ...item, projectId: snapshot.id, episodeId: props.state.episodeId, sceneId: targetShot.sceneId || undefined, shotId: targetShot.id }));
      for (const asset of references) if (snapshot.assets.some(item => item.id === asset.id || item.referencePath === asset.referencePath)) throw new Error("上传参考图与现有素材记录冲突，请重新选择文件");
      snapshot.assets.push(...references);
      targetShot.referenceAssetIds = [...new Set([...(targetShot.referenceAssetIds ?? []), ...references.map(item => item.id)])];
      await saveDramaProject(files, snapshot, manifestPath);
      const saved = await files.readJson<DramaProject>(manifestPath);
      if (saved.id !== snapshot.id || references.some(item => !saved.assets.some(asset => asset.id === item.id && asset.referencePath === item.referencePath))
        || references.some(item => !saved.episodes.find(candidate => candidate.id === props.state.episodeId)?.shots.find(candidate => candidate.id === targetShot.id)?.referenceAssetIds?.includes(item.id))) throw new Error("参考图片或镜头关联回读失败，已上传文件保留");
      Object.assign(project, saved);
    });
    emit("saved");
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "参考图片关联保存失败";
    ElMessage.error(saveError.value);
  } finally { saving.value = false; }
}

async function applyImage(path: string) {
  const asset = props.state.project.assets.find(item => item.kind === "image" && item.referencePath === path
    && (!item.projectId || item.projectId === props.state.project.id) && (!item.episodeId || item.episodeId === props.state.episodeId));
  if (!asset || !shot.value) { ElMessage.error("图片素材不属于当前项目或分集"); return; }
  await applyAsset(asset.id, imageTarget.value);
}

async function applyAsset(assetId: string, target: "firstFrame" | "lastFrame" | "reference") {
  if (!shot.value || saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    await props.mutateProject(async (files, project, manifestPath) => {
      const asset = project.assets.find(item => item.id === assetId && item.kind === "image"
        && (!item.projectId || item.projectId === project.id) && (!item.episodeId || item.episodeId === props.state.episodeId));
      const current = project.episodes.find(item => item.id === props.state.episodeId)?.shots.find(item => item.id === props.binding.shotId);
      if (!asset || !current) throw new Error("图片素材或镜头不属于当前项目和分集");
      const patch: Partial<Omit<DramaShot, "id" | "number">> = { aspectRatio: asset.requestedAspectRatio ?? current.aspectRatio };
      if (target === "firstFrame") patch.firstFrameAssetId = asset.id;
      if (target === "lastFrame") patch.lastFrameAssetId = asset.id;
      if (target === "reference") patch.referenceAssetIds = [...new Set([...(current.referenceAssetIds ?? []), asset.id])];
      await updateShot(files, project, props.state.episodeId, current.id, patch, manifestPath);
      const saved = await files.readJson<DramaProject>(manifestPath);
      const savedShot = saved.episodes.find(item => item.id === props.state.episodeId)?.shots.find(item => item.id === current.id);
      const linked = target === "firstFrame" ? savedShot?.firstFrameAssetId === asset.id
        : target === "lastFrame" ? savedShot?.lastFrameAssetId === asset.id : savedShot?.referenceAssetIds?.includes(asset.id) === true;
      if (saved.id !== project.id || !saved.assets.some(item => item.id === asset.id && item.kind === "image") || !linked) throw new Error("镜头图片关联回读校验失败");
      Object.assign(project, saved);
    });
    emit("saved");
    ElMessage.success(target === "firstFrame" ? "图片已关联为镜头首帧" : target === "lastFrame" ? "图片已关联为镜头尾帧" : "图片已加入镜头参考图");
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "镜头图片关联失败";
    ElMessage.error(saveError.value);
  } finally { saving.value = false; }
}

function referenceSummary(asset: DramaAsset) {
  const ids = asset.referenceAssetIds ?? [];
  if (!ids.length) return "无或未记录";
  return ids.map(id => {
    const character = props.state.project.characters.find(item => item.id === id);
    if (character) return `人物 · ${dramaCharacterDisplayName(character)}`;
    const reference = props.state.project.assets.find(item => item.id === id);
    const referenceCharacter = reference?.characterId ? props.state.project.characters.find(item => item.id === reference.characterId) : undefined;
    if (referenceCharacter) return `人物 · ${dramaCharacterDisplayName(referenceCharacter)}`;
    const sourceEpisode = reference?.episodeId ? props.state.project.episodes.find(item => item.id === reference.episodeId) : episode.value;
    const referenceShot = reference?.shotId ? sourceEpisode?.shots.find(item => item.id === reference.shotId) : undefined;
    if (reference?.shotId) return `镜头 · ${referenceShot?.number || reference.shotId}`;
    return reference ? `${reference.sceneId ? "场景" : "素材"} · ${reference.name || reference.id}` : `已归档来源 · ${id}`;
  }).join("、");
}

function generationDate(asset: DramaAsset) {
  const date = asset.generatedAt ? new Date(asset.generatedAt) : undefined;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : "生成时间未记录";
}

async function openGeneratedPreview(asset: DramaAsset) {
  releaseGeneratedPreview();
  const preview = useWorkspaceFiles(props.state.directory).acquireUrl(asset.referencePath, imageMimeType(asset.referencePath) || undefined);
  try {
    generatedPreviewUrl.value = await preview.url;
    releaseGeneratedUrl = preview.release;
    previewVisible.value = true;
  } catch (error) {
    preview.release();
    ElMessage.error(error instanceof Error ? error.message : "读取图片预览失败");
  }
}

function releaseGeneratedPreview() {
  releaseGeneratedUrl?.();
  releaseGeneratedUrl = undefined;
  generatedPreviewUrl.value = "";
}

onScopeDispose(releaseGeneratedPreview);
</script>

<style lang="scss" scoped>
.shotForm { display: grid; gap: 4px; }
.shotMeta, .imageTarget { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.shotMeta { color: var(--el-text-color-secondary); font-size: 12px; }
.sceneSelect { width: 100%; }
.imageTarget { margin-bottom: 10px; font-size: 12px; .el-select { width: 160px; } }
.generationHistory { display: grid; gap: 10px; margin-top: 14px; > strong { font-size: 13px; } }
.generationItem { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 10px; padding: 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.historyPreview { align-self: start; width: 88px; height: 72px; padding: 0; overflow: hidden; border: 0; border-radius: 5px; background: var(--el-fill-color-light); cursor: zoom-in; :deep(.mentionThumbnail) { width: 100%; height: 100%; border-radius: 0; } }
.generationInfo { display: grid; min-width: 0; gap: 5px; strong, span, p { overflow-wrap: anywhere; } > strong { font-size: 12px; } > span, > p, .usageState > span { margin: 0; color: var(--el-text-color-secondary); font-size: 11px; } > p { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; white-space: pre-wrap; } }
.usageState { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
.generatedPreview { width: 100%; max-height: 72vh; :deep(img) { max-width: 100%; max-height: 72vh; object-fit: contain; } }
.saveError { color: var(--el-color-danger); font-size: 12px; }
</style>
