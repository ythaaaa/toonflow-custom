<template>
  <el-drawer v-model="visible" :title="panelTitle" size="520px" appendToBody @closed="emit('closed', binding)">
    <el-skeleton v-if="loading" :rows="6" animated />
    <template v-else-if="binding.role === 'script' && episode">
      <section class="scriptEditor">
        <div class="formalScript">
          <strong>{{ formalVersion ? `已确认正式剧本 · V${String(formalVersion.version).padStart(3, '0')}（只读）` : "暂无已确认的正式剧本" }}</strong>
          <el-input v-if="formalVersion" :modelValue="formalContent" type="textarea" :rows="8" readonly resize="vertical" />
        </div>
        <el-form labelPosition="top">
          <el-form-item label="工作稿"><el-input v-model="scriptDraft" type="textarea" :rows="16" resize="vertical" /></el-form-item>
        </el-form>
        <div class="panelActions">
          <el-button :loading="saving" :disabled="!episode" @click="saveDraft">保存工作稿</el-button>
          <el-button type="primary" :loading="saving" :disabled="!episode" @click="createVersion">创建新版本</el-button>
        </div>
      </section>
    </template>
    <template v-else-if="binding.role === 'character' && characterDraft">
      <el-form labelPosition="top" class="entityForm">
        <el-form-item label="人物名称"><el-input v-model="characterDraft.name" /></el-form-item>
        <el-form-item label="人物身份及性格"><el-input v-model="characterDraft.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="人物外貌描述"><el-input v-model="characterDraft.appearance" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="人物参考图与 GPT 会员生图">
          <gptImageGenerator
            v-model:prompt="imagePrompt"
            v-model:aspectRatio="aspectRatio"
            :projectId="state.project.id"
            :directory="state.directory"
            :referenceOptions="referenceOptions"
            :initialReferenceAssetIds="initialReferenceAssetIds"
            :initialImagePath="characterDraft.referencePath"
            initialImageLabel="当前人物参考图"
            :initialGeneratedImage="initialGeneratedImage"
            :generatedPersisted="generatedPersisted"
            :saving="saving"
            @generated="persistImage"
            @referencesUploaded="persistReferences"
            @useImage="useImage" />
        </el-form-item>
      </el-form>
      <div class="panelActions"><el-button type="primary" :loading="saving" @click="saveCharacter">保存人物</el-button></div>
    </template>
    <template v-else-if="binding.role === 'scene' && sceneDraft">
      <el-form labelPosition="top" class="entityForm">
        <el-form-item label="场景名称"><el-input v-model="sceneDraft.heading" /></el-form-item>
        <el-form-item label="场景地点"><el-input v-model="sceneDraft.location" /></el-form-item>
        <el-form-item label="场景环境描述"><el-input v-model="sceneDraft.description" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="场景参考图与 GPT 会员生图">
          <gptImageGenerator
            v-model:prompt="imagePrompt"
            v-model:aspectRatio="aspectRatio"
            :projectId="state.project.id"
            :directory="state.directory"
            :referenceOptions="referenceOptions"
            :initialReferenceAssetIds="initialReferenceAssetIds"
            :initialImagePath="sceneReferenceAsset?.referencePath"
            :initialImageLabel="sceneReferenceAsset?.name || '当前场景参考图'"
            :initialGeneratedImage="initialGeneratedImage"
            :generatedPersisted="generatedPersisted"
            :saving="saving"
            @generated="persistImage"
            @referencesUploaded="persistReferences"
            @useImage="useImage" />
        </el-form-item>
      </el-form>
      <div class="panelActions"><el-button type="primary" :loading="saving" @click="saveScene">保存场景</el-button></div>
    </template>
    <template v-else-if="binding.role === 'imageAsset' && imageAsset">
      <section class="assetPanel">
        <el-image v-if="assetPreviewUrl" class="assetPreview" :src="assetPreviewUrl" :previewSrcList="[assetPreviewUrl]" :previewTeleported="true" fit="contain" />
        <dl class="assetMeta">
          <div><dt>来源</dt><dd>{{ assetSource }}</dd></div>
          <div><dt>关联镜头</dt><dd>{{ assetShotLabel }}</dd></div>
          <div><dt>生成提示词</dt><dd>{{ imageAsset.description || '未记录' }}</dd></div>
        </dl>
        <el-form labelPosition="top">
          <el-form-item label="当前镜头">
            <el-select v-model="targetShotId" :disabled="!activeShots.length">
              <el-option v-for="item in activeShots" :key="item.id" :label="item.number" :value="item.id" />
            </el-select>
          </el-form-item>
          <div class="assetActions">
            <el-button :loading="saving" :disabled="!targetShot" @click="applyAsset('firstFrame')">设为首帧</el-button>
            <el-button :loading="saving" :disabled="!targetShot" @click="applyAsset('lastFrame')">设为尾帧</el-button>
            <el-button :loading="saving" :disabled="!targetShot || targetHasReference" @click="applyAsset('reference')">加入参考图</el-button>
            <el-button :loading="saving" :disabled="!targetHasReference" @click="removeAssetReference">移除参考图</el-button>
          </div>
        </el-form>
      </section>
    </template>
    <div v-if="saveError" class="saveError" role="alert">{{ saveError }}</div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import gptImageGenerator from "@/components/drama/gptImageGenerator.vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { readEpisodeScript, saveDramaProject, saveEpisodeDraft, saveEpisodeScriptVersion, updateScene, updateShot, type DramaAsset, type DramaCharacter, type DramaProject, type DramaScene, type DramaShot } from "@/lib/dramaWorkspace";
import { dramaCharacterDisplayName, type DramaCanvasBinding, type DramaCanvasState } from "@/lib/dramaCanvas";
import type { DramaWorkspaceFiles } from "@toonflow/drama-workspace";

type GeneratedImage = { path: string; mimeType: string; prompt: string; aspectRatio: string; modelId: string; referenceAssetIds: string[]; width?: number; height?: number };
type ReferenceOption = { id: string; label: string; referencePath: string; source?: string; kind?: "asset" | "character" | "legacy"; referenceId?: string };

type DramaProjectMutation = (files: DramaWorkspaceFiles, project: DramaProject, manifestPath: string) => Promise<void>;
const props = defineProps<{ binding: DramaCanvasBinding; state: DramaCanvasState; mutateProject: (mutation: DramaProjectMutation) => Promise<DramaProject> }>();
const emit = defineEmits<{ saved: []; closed: [binding: DramaCanvasBinding] }>();
const visible = ref(true);
const loading = ref(false);
const saving = ref(false);
const saveError = ref("");
const scriptDraft = ref("");
const formalContent = ref("");
const characterDraft = ref<DramaCharacter>();
const sceneDraft = ref<DramaScene>();
const imagePrompt = ref("");
const aspectRatio = ref("16:9");
let loadRequest = 0;

const episode = computed(() => props.state.project.episodes.find(item => item.id === props.binding.episodeId));
const formalVersion = computed(() => episode.value?.formalVersionId
  ? props.state.project.scriptVersions[props.binding.episodeId]?.find(item => item.id === episode.value?.formalVersionId)
  : undefined);
const character = computed(() => props.binding.role === "character"
  ? props.state.project.characters.find(item => item.id === props.binding.characterId)
  : undefined);
const scene = computed(() => props.binding.role === "scene"
  ? episode.value?.scenes.find(item => item.id === props.binding.sceneId)
  : undefined);
const imageAsset = computed(() => props.binding.role === "imageAsset"
  ? props.state.project.assets.find(item => item.id === props.binding.assetId && item.kind === "image"
    && (!item.projectId || item.projectId === props.state.project.id)
    && (!item.episodeId || item.episodeId === props.state.episodeId))
  : undefined);
const activeShots = computed(() => episode.value?.shots.filter(item => !item.archived) ?? []);
const targetShotId = ref("");
const targetShot = computed(() => activeShots.value.find(item => item.id === targetShotId.value));
const targetHasReference = computed(() => !!imageAsset.value && !!targetShot.value?.referenceAssetIds?.includes(imageAsset.value.id));
const panelTitle = computed(() => {
  if (props.binding.role === "script") return `${episode.value?.title || "分集剧本"} · 剧本工作稿`;
  if (props.binding.role === "character") return `人物 · ${dramaCharacterDisplayName(character.value)}`;
  if (props.binding.role === "imageAsset") return `图片素材 · ${imageAsset.value?.name || "未命名素材"}`;
  return `场景 · ${scene.value?.heading || scene.value?.location || "未命名场景"}`;
});
const linkedShots = computed(() => props.state.project.episodes.flatMap(item => item.shots
  .filter(shot => !shot.archived && (shot.firstFrameAssetId === imageAsset.value?.id || shot.lastFrameAssetId === imageAsset.value?.id || shot.referenceAssetIds?.includes(imageAsset.value?.id ?? "")))
  .map(shot => `${shot.number}${shot.firstFrameAssetId === imageAsset.value?.id ? " · 首帧" : ""}${shot.lastFrameAssetId === imageAsset.value?.id ? " · 尾帧" : ""}${shot.referenceAssetIds?.includes(imageAsset.value?.id ?? "") ? " · 参考图" : ""}`)));
const assetSource = computed(() => {
  const asset = imageAsset.value;
  if (!asset) return "图片素材";
  if (asset.generatedBy === "gptImageSubscription") return "GPT 会员生图";
  if (asset.characterId) return `人物参考 · ${dramaCharacterDisplayName(props.state.project.characters.find(item => item.id === asset.characterId))}`;
  if (asset.sceneId) {
    const linkedScene = props.state.project.episodes.flatMap(item => item.scenes).find(item => item.id === asset.sceneId);
    return `场景参考 · ${linkedScene?.heading || linkedScene?.location || "未命名场景"}`;
  }
  return "项目图片素材";
});
const assetShotLabel = computed(() => {
  const asset = imageAsset.value;
  if (!asset) return "未关联镜头";
  const ownerShot = asset.shotId ? props.state.project.episodes.flatMap(item => item.shots).find(item => item.id === asset.shotId)?.number || asset.shotId : "";
  return [ownerShot ? `生成关联：${ownerShot}` : "", ...linkedShots.value].filter(Boolean).join("；") || "未关联镜头";
});
const assetPreviewUrl = ref("");
let releaseAssetPreview: (() => void) | undefined;
let assetPreviewRequest = 0;
const sceneReferenceAsset = computed(() => props.state.project.assets.find(item => item.id === scene.value?.referenceAssetId));
const associatedAssets = computed(() => props.binding.role === "character"
  ? props.state.project.assets.filter(item => item.kind === "image" && item.characterId === props.binding.characterId)
  : props.binding.role === "scene"
    ? props.state.project.assets.filter(item => item.kind === "image" && item.sceneId === props.binding.sceneId)
    : []);
const generatedAsset = computed(() => associatedAssets.value.filter(item => item.generatedBy === "gptImageSubscription").at(-1));
const generatedPersisted = computed(() => !!generatedAsset.value);
const initialGeneratedImage = computed<GeneratedImage | undefined>(() => {
  const asset = generatedAsset.value;
  if (!asset) return;
  return {
    path: asset.referencePath,
    mimeType: imageMimeType(asset.referencePath),
    prompt: asset.description,
    aspectRatio: asset.requestedAspectRatio ?? "16:9",
    modelId: asset.modelId ?? "",
    referenceAssetIds: asset.referenceAssetIds ?? [],
    width: asset.width,
    height: asset.height,
  };
});
const referenceOptions = computed<ReferenceOption[]>(() => [
  ...props.state.project.characters.filter(item => item.referencePath && !item.archived).map(item => ({
    id: `character:${item.id}`,
    referenceId: item.id,
    kind: "character" as const,
    source: "人物定妆图",
    label: `人物 · ${dramaCharacterDisplayName(item)}`,
    referencePath: item.referencePath,
  })),
  ...props.state.project.assets.filter(item => item.kind === "image" && item.referencePath && (!item.episodeId || item.episodeId === props.state.episodeId)
    && (!item.projectId || item.projectId === props.state.project.id)).map(item => {
    const linkedCharacter = item.characterId ? props.state.project.characters.find(candidate => candidate.id === item.characterId) : undefined;
    const linkedScene = item.sceneId ? props.state.project.episodes.flatMap(candidate => candidate.scenes).find(candidate => candidate.id === item.sceneId) : undefined;
    const owner = linkedCharacter
      ? `人物 · ${dramaCharacterDisplayName(linkedCharacter)}`
      : linkedScene ? `场景 · ${linkedScene.heading || "未命名场景"}` : "素材";
    return { id: item.id, referenceId: item.id, kind: "asset" as const, source: owner, label: `${owner} · ${item.name || item.id}`, referencePath: item.referencePath };
  }),
]);
const initialReferenceAssetIds = computed(() => {
  if (props.binding.role === "character" && character.value?.referencePath) {
    const matchingAsset = props.state.project.assets.find(item => item.kind === "image" && item.characterId === character.value?.id && item.referencePath === character.value?.referencePath
      && (!item.projectId || item.projectId === props.state.project.id) && (!item.episodeId || item.episodeId === props.state.episodeId));
    return [matchingAsset?.id ?? character.value.id];
  }
  if (props.binding.role === "scene" && scene.value?.referenceAssetId) return [scene.value.referenceAssetId];
  return [];
});

watch(() => [props.state.directory, props.state.project.id, props.state.episodeId, props.binding.role, props.binding.characterId, props.binding.sceneId, props.binding.assetId, props.binding.scriptVersionId] as const, loadPanel, { immediate: true });
watch(() => [props.state.directory, imageAsset.value?.referencePath] as const, async ([directory, path]) => {
  const request = ++assetPreviewRequest;
  releaseAssetPreview?.();
  releaseAssetPreview = undefined;
  assetPreviewUrl.value = "";
  if (!directory || !path) return;
  const preview = useWorkspaceFiles(directory).acquireUrl(path, imageMimeType(path) || undefined);
  try {
    const url = await preview.url;
    if (request !== assetPreviewRequest) { preview.release(); return; }
    releaseAssetPreview = preview.release;
    assetPreviewUrl.value = url;
  } catch (error) {
    preview.release();
    if (request === assetPreviewRequest) reportSaveError(error, "读取素材预览失败");
  }
}, { immediate: true });
watch(() => [props.binding.role, props.binding.assetId, props.state.episodeId] as const, () => {
  targetShotId.value = activeShots.value.find(item => item.id === imageAsset.value?.shotId)?.id ?? activeShots.value[0]?.id ?? "";
}, { immediate: true });
onScopeDispose(() => releaseAssetPreview?.());
watch(() => [props.binding.role, characterDraft.value?.description, characterDraft.value?.appearance, sceneDraft.value?.heading, sceneDraft.value?.location, sceneDraft.value?.description] as const, () => {
  if (props.binding.role === "character" && characterDraft.value) {
    imagePrompt.value = ["短剧人物定妆参考图，主体清晰，单人全身或半身构图。", characterDraft.value.description, characterDraft.value.appearance, props.state.project.style && `画面风格：${props.state.project.style}`].filter(Boolean).join("\n");
    aspectRatio.value = "1:1";
  } else if (props.binding.role === "scene" && sceneDraft.value) {
    imagePrompt.value = ["短剧场景参考图，清晰呈现空间结构与环境氛围。", sceneDraft.value.heading, sceneDraft.value.location, sceneDraft.value.description, props.state.project.style && `画面风格：${props.state.project.style}`].filter(Boolean).join("\n");
    aspectRatio.value = "16:9";
  }
}, { immediate: true });

async function loadPanel() {
  const request = ++loadRequest;
  const binding = props.binding;
  const state = props.state;
  const episode = state.project.episodes.find(item => item.id === binding.episodeId);
  const version = episode?.formalVersionId
    ? state.project.scriptVersions[binding.episodeId]?.find(item => item.id === episode.formalVersionId)
    : undefined;
  loading.value = true;
  saveError.value = "";
  characterDraft.value = undefined;
  sceneDraft.value = undefined;
  try {
    const files = useWorkspaceFiles(state.directory);
    if (binding.role === "script" && episode) {
      const draft = await readEpisodeScript(files, state.project, binding.episodeId, state.manifestPath);
      const formal = version ? await files.readText(version.path) : "";
      if (request !== loadRequest) return;
      scriptDraft.value = draft;
      formalContent.value = formal;
    } else if (binding.role === "character" && character.value) characterDraft.value = structuredClone(character.value);
    else if (binding.role === "scene" && scene.value) sceneDraft.value = structuredClone(scene.value);
    else if (binding.role === "imageAsset" && imageAsset.value) targetShotId.value = activeShots.value.find(item => item.id === imageAsset.value?.shotId)?.id ?? activeShots.value[0]?.id ?? "";
    else throw new Error("画布业务节点关联已失效");
  } catch (error) {
    if (request === loadRequest) {
      saveError.value = error instanceof Error ? error.message : "读取画布编辑内容失败";
      ElMessage.error(saveError.value);
    }
  } finally {
    if (request === loadRequest) loading.value = false;
  }
}

async function saveDraft() {
  if (!episode.value || saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    await saveEpisodeDraft(useWorkspaceFiles(props.state.directory), props.state.project, props.state.episodeId, scriptDraft.value, props.state.manifestPath);
    emit("saved");
    ElMessage.success("剧本工作稿已保存；正式版本未更改");
  } catch (error) { reportSaveError(error, "保存剧本工作稿失败"); }
  finally { saving.value = false; }
}

async function createVersion() {
  if (!episode.value || saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    await saveEpisodeScriptVersion(useWorkspaceFiles(props.state.directory), props.state.project, props.state.episodeId, scriptDraft.value, props.state.manifestPath);
    emit("saved");
    ElMessage.success("已创建草稿版本；已确认的正式版本保持不变");
  } catch (error) { reportSaveError(error, "创建剧本版本失败"); }
  finally { saving.value = false; }
}

async function saveCharacter() {
  if (!characterDraft.value || saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    const draft = { ...characterDraft.value };
    await props.mutateProject(async (files, project, manifestPath) => {
      const target = project.characters.find(item => item.id === props.binding.characterId);
      if (!target) throw new Error("人物资产已不存在");
      Object.assign(target, { name: draft.name, description: draft.description, appearance: draft.appearance });
      await saveDramaProject(files, project, manifestPath);
    });
    emit("saved");
    ElMessage.success("人物资产已保存");
  } catch (error) { reportSaveError(error, "保存人物资产失败"); }
  finally { saving.value = false; }
}

async function saveScene() {
  if (!sceneDraft.value || !scene.value || saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    const draft = { ...sceneDraft.value };
    await props.mutateProject((files, project, manifestPath) => updateScene(files, project, props.state.episodeId, props.binding.sceneId!, {
      heading: draft.heading, location: draft.location, description: draft.description,
    }, manifestPath));
    emit("saved");
    ElMessage.success("场景已保存");
  } catch (error) { reportSaveError(error, "保存场景失败"); }
  finally { saving.value = false; }
}

async function persistImage(image: GeneratedImage) {
  if (saving.value || (props.binding.role !== "character" && props.binding.role !== "scene")) return;
  saving.value = true;
  saveError.value = "";
  try {
    await props.mutateProject(async (files, project, manifestPath) => {
      if (props.binding.role === "character" && !project.characters.some(item => item.id === props.binding.characterId)) throw new Error("人物资产已不存在");
      if (props.binding.role === "scene" && !project.episodes.find(item => item.id === props.state.episodeId)?.scenes.some(item => item.id === props.binding.sceneId)) throw new Error("场景已不存在");
      if (project.assets.some(item => item.referencePath === image.path || item.id === image.path)) throw new Error("生成图片已有素材记录，请重新载入项目");
      const asset: DramaAsset = {
        id: crypto.randomUUID(), kind: "image", name: `${entityName()} GPT 生图 ${new Date().toLocaleString()}`,
        description: image.prompt, referencePath: image.path, version: 1, generatedBy: "gptImageSubscription", modelId: image.modelId,
        generatedAt: new Date().toISOString(), requestedAspectRatio: image.aspectRatio, width: image.width, height: image.height,
        referenceAssetIds: image.referenceAssetIds, projectId: project.id, episodeId: props.state.episodeId,
        ...(props.binding.role === "character" ? { characterId: props.binding.characterId } : { sceneId: props.binding.sceneId }),
      };
      project.assets.push(asset);
      await saveDramaProject(files, project, manifestPath);
    });
    emit("saved");
  } catch (error) { reportSaveError(error, "生成图片保存失败"); }
  finally { saving.value = false; }
}

async function persistReferences(assets: DramaAsset[]) {
  if (saving.value || !assets.length || (props.binding.role !== "character" && props.binding.role !== "scene")) return;
  saving.value = true;
  saveError.value = "";
  try {
    await props.mutateProject(async (files, project, manifestPath) => {
      const character = props.binding.role === "character" ? project.characters.find(item => item.id === props.binding.characterId) : undefined;
      const scene = props.binding.role === "scene" ? project.episodes.find(item => item.id === props.state.episodeId)?.scenes.find(item => item.id === props.binding.sceneId) : undefined;
      if (props.binding.role === "character" && !character || props.binding.role === "scene" && !scene) throw new Error("人物或场景已不存在");
      const references = assets.map(item => ({
        ...item, projectId: project.id, episodeId: props.state.episodeId,
        ...(props.binding.role === "character" ? { characterId: props.binding.characterId } : { sceneId: props.binding.sceneId }),
      }));
      for (const asset of references) if (project.assets.some(item => item.id === asset.id || item.referencePath === asset.referencePath)) throw new Error("参考图片素材记录冲突；已上传文件保留，请重新载入项目");
      project.assets.push(...references);
      const last = references.at(-1);
      if (last?.characterId && character) character.referencePath = last.referencePath;
      if (last?.sceneId && scene) scene.referenceAssetId = last.id;
      await saveDramaProject(files, project, manifestPath);
    });
    emit("saved");
  } catch (error) { reportSaveError(error, "参考图保存失败"); }
  finally { saving.value = false; }
}

async function useImage(path: string) {
  if (saving.value || (props.binding.role !== "character" && props.binding.role !== "scene")) return;
  saving.value = true;
  saveError.value = "";
  try {
    await props.mutateProject(async (files, project, manifestPath) => {
      const asset = project.assets.find(item => item.kind === "image" && item.referencePath === path
        && (!item.projectId || item.projectId === project.id) && (!item.episodeId || item.episodeId === props.state.episodeId)
        && (props.binding.role === "character" ? item.characterId === props.binding.characterId : item.sceneId === props.binding.sceneId));
      if (!asset) throw new Error("图片尚未保存到当前人物或场景素材");
      if (props.binding.role === "character") {
        const target = project.characters.find(item => item.id === props.binding.characterId);
        if (!target) throw new Error("人物资产已不存在");
        target.referencePath = path;
      } else {
        const target = project.episodes.find(item => item.id === props.state.episodeId)?.scenes.find(item => item.id === props.binding.sceneId);
        if (!target) throw new Error("场景已不存在");
        target.referenceAssetId = asset.id;
      }
      await saveDramaProject(files, project, manifestPath);
    });
    emit("saved");
    ElMessage.success(props.binding.role === "character" ? "图片已设为人物参考图" : "图片已设为场景参考图");
  } catch (error) { reportSaveError(error, "关联图片失败"); }
  finally { saving.value = false; }
}

async function applyAsset(target: "firstFrame" | "lastFrame" | "reference") {
  const asset = imageAsset.value;
  const currentShot = targetShot.value;
  if (!asset || !currentShot || saving.value) return;
  await saveImageAssociation(asset.id, currentShot.id, target);
}

async function removeAssetReference() {
  const asset = imageAsset.value;
  const currentShot = targetShot.value;
  if (!asset || !currentShot || saving.value || !currentShot.referenceAssetIds?.includes(asset.id)) return;
  await saveImageAssociation(asset.id, currentShot.id, "removeReference");
}

async function saveImageAssociation(assetId: string, shotId: string, target: "firstFrame" | "lastFrame" | "reference" | "removeReference") {
  saving.value = true;
  saveError.value = "";
  try {
    await props.mutateProject(async (files, project, manifestPath) => {
      const asset = project.assets.find(item => item.id === assetId && item.kind === "image"
        && (!item.projectId || item.projectId === project.id)
        && (!item.episodeId || item.episodeId === props.state.episodeId));
      const shot = project.episodes.find(item => item.id === props.state.episodeId)?.shots.find(item => item.id === shotId && !item.archived);
      if (!asset || !shot) throw new Error("图片素材或当前镜头不属于此项目和分集");
      const patch: Partial<Omit<DramaShot, "id" | "number">> = {};
      if (target === "firstFrame") patch.firstFrameAssetId = asset.id;
      else if (target === "lastFrame") patch.lastFrameAssetId = asset.id;
      else if (target === "reference") patch.referenceAssetIds = [...new Set([...(shot.referenceAssetIds ?? []), asset.id])];
      else patch.referenceAssetIds = (shot.referenceAssetIds ?? []).filter(id => id !== asset.id);
      await updateShot(files, project, props.state.episodeId, shot.id, patch, manifestPath);
      const saved = await files.readJson<DramaProject>(manifestPath);
      const savedShot = saved.episodes.find(item => item.id === props.state.episodeId)?.shots.find(item => item.id === shot.id);
      const savedAsset = saved.assets.find(item => item.id === asset.id && item.kind === "image");
      const linked = target === "firstFrame" ? savedShot?.firstFrameAssetId === asset.id
        : target === "lastFrame" ? savedShot?.lastFrameAssetId === asset.id
          : target === "reference" ? savedShot?.referenceAssetIds?.includes(asset.id) === true
            : !savedShot?.referenceAssetIds?.includes(asset.id);
      if (saved.id !== project.id || !savedAsset || !linked) throw new Error("图片关联写入后回读不一致，画布未更新");
      Object.assign(project, saved);
    });
    emit("saved");
    ElMessage.success(target === "firstFrame" ? "图片已关联为镜头首帧" : target === "lastFrame" ? "图片已关联为镜头尾帧" : target === "reference" ? "图片已加入镜头参考图" : "图片已从镜头参考图移除");
  } catch (error) { reportSaveError(error, "保存镜头图片关联失败"); }
  finally { saving.value = false; }
}

function entityName() {
  return props.binding.role === "character" ? characterDraft.value?.name || "人物" : sceneDraft.value?.heading || "场景";
}

function imageMimeType(path: string) {
  const extension = path.toLowerCase().split(".").at(-1);
  return extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "";
}

function reportSaveError(error: unknown, fallback: string) {
  saveError.value = error instanceof Error ? error.message : fallback;
  ElMessage.error(saveError.value);
}
</script>

<style lang="scss" scoped>
.scriptEditor, .entityForm, .assetPanel { display: grid; gap: 12px; }
.formalScript { display: grid; gap: 8px; strong { color: var(--el-text-color-secondary); font-size: 13px; } }
.assetPreview { width: 100%; max-height: 420px; background: var(--el-fill-color-light); border-radius: 6px; :deep(img) { max-width: 100%; max-height: 420px; object-fit: contain; } }
.assetMeta { display: grid; gap: 8px; margin: 0; div { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 10px; } dt { color: var(--el-text-color-secondary); } dd { min-width: 0; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; } }
.assetActions { display: flex; flex-wrap: wrap; gap: 8px; }
.panelActions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; }
.saveError { margin-top: 12px; color: var(--el-color-danger); font-size: 12px; }
</style>
