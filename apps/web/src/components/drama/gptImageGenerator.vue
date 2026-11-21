<template>
  <div class="gptImagePanel">
    <div class="gptImageAuth"><span>GPT 会员授权：{{ status.authenticated ? `已连接${status.email ? ` · ${status.email}` : ""}` : "未授权" }}</span><el-button v-if="!status.authenticated" size="small" :loading="authBusy" @click="authorize">独立 ChatGPT 授权</el-button><el-button v-else size="small" @click="logout">退出授权</el-button></div>
    <el-input :modelValue="prompt" type="textarea" :rows="4" resize="vertical" placeholder="输入图片提示词；可以根据当前人物、场景或镜头内容自动填写后再修改。" @update:modelValue="emit('update:prompt', $event)" />
    <div class="gptImageOptions">
      <el-select :modelValue="aspectRatio" aria-label="生图画幅" @update:modelValue="emit('update:aspectRatio', $event)"><el-option label="1:1 方形" value="1:1" /><el-option label="16:9 横屏" value="16:9" /><el-option label="9:16 竖屏" value="9:16" /></el-select>
      <el-select v-model="selectedReferenceIds" multiple clearable filterable placeholder="从当前项目素材库选择参考图"><el-option v-for="item in referenceOptions" :key="item.id" :label="item.label" :value="item.id" /></el-select>
      <div class="gptImageUpload"><input type="file" accept="image/png,image/jpeg,image/webp" multiple :disabled="referenceUploading || saving" @change="uploadReferences" /><span>上传参考图：PNG / JPEG / WebP，单张不超过 12 MB</span></div>
    </div>
    <div class="gptImageActions"><el-button type="primary" :disabled="!status.authenticated || !prompt.trim() || generating || saving || referenceUploading" :loading="generating || saving" @click="generate">{{ generating ? "正在生成…" : saving ? "正在保存素材…" : generatedImage ? "重新生成" : selectedReferenceIds.length ? "参考图编辑" : "生成图片" }}</el-button><span v-if="generating">请求已提交，等待订阅服务返回图片。</span><span v-else-if="generatedImage && generatedPersisted">生成成功，已保存到项目素材库。</span><span v-else-if="generatedImage && saving">图片已生成，正在保存关联信息。</span><span v-else-if="generatedImage">图片已生成，但项目关联尚未保存；请检查工作区权限后重试。</span><span v-else>固定模型 gpt-image-2.6-flare；质量请求为 auto。</span></div>
    <el-alert v-if="generationError" type="error" :closable="false" :title="generationError" />
    <div v-if="previewUrl" class="gptImagePreview"><img :src="previewUrl" alt="GPT 会员生图预览" /><div><span>{{ previewLabel }}</span><el-button v-if="generatedImage" size="small" type="primary" :disabled="!generatedPersisted || saving" :loading="saving" @click="emit('useImage', generatedImage.path)">使用图片</el-button></div></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import http from "@/lib/http";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { DramaAsset } from "@/lib/dramaWorkspace";

type ReferenceOption = { id: string; label: string; referencePath: string };
type GeneratedImage = { path: string; mimeType: string; prompt: string; aspectRatio: string; referenceAssetIds: string[]; width?: number; height?: number };

const props = defineProps<{
  projectId: string;
  directory: string;
  prompt: string;
  aspectRatio: string;
  referenceOptions: ReferenceOption[];
  initialImagePath?: string;
  initialImageLabel?: string;
  generatedPersisted: boolean;
  saving: boolean;
}>();
const emit = defineEmits<{
  "update:prompt": [value: string];
  "update:aspectRatio": [value: string];
  generated: [image: GeneratedImage];
  referencesUploaded: [assets: DramaAsset[]];
  useImage: [path: string];
}>();

const status = ref({ authenticated: false, email: "", expiresAt: null as number | null, model: "gpt-image-2.6-flare", aspectRatios: ["1:1", "16:9", "9:16"], quality: "auto" });
const authBusy = ref(false);
const generating = ref(false);
const referenceUploading = ref(false);
const selectedReferenceIds = ref<string[]>([]);
const uploadedReferences = ref<ReferenceOption[]>([]);
const generatedImage = ref<GeneratedImage>();
const generationError = ref("");
const previewUrl = ref("");
const previewLabel = ref("");
let releasePreview: (() => void) | undefined;
let previewRequest = 0;

const referenceOptions = computed(() => [...new Map<string, ReferenceOption>([...props.referenceOptions, ...uploadedReferences.value].map(item => [item.id, item] as const)).values()]);

watch(() => [props.directory, props.initialImagePath, props.initialImageLabel] as const, ([directory, path, label]) => {
  if (!generatedImage.value) void setPreview(path, label || "当前关联图片", directory);
}, { immediate: true });
onMounted(refreshStatus);
onScopeDispose(() => releasePreview?.());

async function refreshStatus() {
  try { status.value = await http<typeof status.value>({ method: "GET", url: "/api/gptImage/status", timeout: 10000 }); }
  catch { status.value = { ...status.value, authenticated: false, email: "", expiresAt: null }; }
}
async function authorize() {
  const popup = window.open("about:blank", "toonflow_gpt_image_auth");
  if (!popup) { ElMessage.error("浏览器阻止了授权窗口，请允许弹出窗口后重试"); return; }
  authBusy.value = true;
  try {
    const { url } = await http<{ url: string }>({ method: "POST", url: "/api/gptImage/login", timeout: 10000 });
    popup.location.href = url;
    for (let attempt = 0; attempt < 300; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await refreshStatus();
      if (status.value.authenticated) { ElMessage.success("GPT 会员生图授权已连接"); return; }
    }
    ElMessage.warning("尚未检测到授权完成，请完成登录后重试状态检查");
  } catch (error) { popup.close(); ElMessage.error(error instanceof Error ? error.message : "启动 ChatGPT 授权失败"); }
  finally { authBusy.value = false; }
}
async function logout() {
  try { await http({ method: "POST", url: "/api/gptImage/logout", timeout: 10000 }); await refreshStatus(); ElMessage.success("已退出 GPT 会员生图授权"); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "退出授权失败"); }
}
function imageMimeType(path: string) {
  const extension = path.toLowerCase().split(".").at(-1);
  return extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "";
}
async function ensureDirectory(files: ReturnType<typeof useWorkspaceFiles>, path: string) {
  let current = "";
  for (const part of path.split("/").filter(Boolean)) {
    const entries = await files.list(current);
    current = current ? `${current}/${part}` : part;
    if (!entries.entries.some(item => item.name === part && item.type === "directory")) await files.mkdir(current);
  }
}
async function uploadReferences(event: Event) {
  const input = event.target as HTMLInputElement;
  const uploads = Array.from(input.files ?? []);
  input.value = "";
  if (!uploads.length || referenceUploading.value || props.saving) return;
  referenceUploading.value = true;
  try {
    const files = useWorkspaceFiles(props.directory);
    const folder = `.toonflow/drama/assets/${props.projectId}/references`;
    await ensureDirectory(files, folder);
    const assets: DramaAsset[] = [];
    for (const upload of uploads) {
      if (!(upload.type === "image/png" || upload.type === "image/jpeg" || upload.type === "image/webp") || upload.size > 12 * 1024 * 1024) {
        ElMessage.warning(`${upload.name} 不是受支持的图片或超过 12 MB，已跳过`);
        continue;
      }
      const extension = upload.type === "image/png" ? "png" : upload.type === "image/jpeg" ? "jpg" : "webp";
      const id = crypto.randomUUID();
      const path = `${folder}/${id}.${extension}`;
      await files.write(path, await upload.arrayBuffer(), true);
      assets.push({ id, kind: "image", name: upload.name.slice(0, 160), description: "GPT 生图参考图", referencePath: path, version: 1, projectId: props.projectId });
    }
    if (!assets.length) return;
    uploadedReferences.value.push(...assets.map(item => ({ id: item.id, label: `新上传 · ${item.name}`, referencePath: item.referencePath })));
    selectedReferenceIds.value = [...new Set([...selectedReferenceIds.value, ...assets.map(item => item.id)])];
    emit("referencesUploaded", assets);
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "上传参考图失败"); }
  finally { referenceUploading.value = false; }
}
async function setPreview(path?: string, label = "", directory = props.directory) {
  const request = ++previewRequest;
  if (!path || !directory) {
    releasePreview?.();
    releasePreview = undefined;
    previewUrl.value = "";
    previewLabel.value = "";
    return;
  }
  const acquired = useWorkspaceFiles(directory).acquireUrl(path, imageMimeType(path) || undefined);
  try {
    const url = await acquired.url;
    if (request !== previewRequest) { acquired.release(); return; }
    releasePreview?.();
    releasePreview = acquired.release;
    previewUrl.value = url;
    previewLabel.value = label;
  } catch (error) { acquired.release(); ElMessage.error(error instanceof Error ? error.message : "读取图片预览失败"); }
}
async function imageDimensions(url: string) {
  return new Promise<{ width: number; height: number } | undefined>(resolve => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(undefined);
    image.src = url;
  });
}
async function generate() {
  if (!props.prompt.trim() || generating.value || props.saving) return;
  if (!status.value.authenticated) { ElMessage.warning("请先完成独立 ChatGPT 授权"); return; }
  const selected = referenceOptions.value.filter(item => selectedReferenceIds.value.includes(item.id));
  if (selected.some(item => !imageMimeType(item.referencePath))) { ElMessage.error("参考素材需要使用 PNG、JPEG 或 WebP 文件"); return; }
  generating.value = true;
  generatedImage.value = undefined;
  generationError.value = "";
  try {
    const generated = await http<{ path: string; mimeType: string; mediaType: "image" }[]>({
      method: "POST", url: "/api/ai/media/generate", timeout: 240000,
      data: { directory: props.directory, mediaType: "image", providerId: "gptImageSubscription", modelId: "gpt-image-2.6-flare", prompt: props.prompt,
        ratio: props.aspectRatio, images: selected.map(item => ({ path: item.referencePath, mimeType: imageMimeType(item.referencePath) })),
        outputDirectory: `.toonflow/drama/assets/${props.projectId}/generated` },
    });
    const result = generated[0];
    if (!result || result.mediaType !== "image") throw new Error("生图服务没有返回图片文件");
    const acquired = useWorkspaceFiles(props.directory).acquireUrl(result.path, result.mimeType);
    const url = await acquired.url;
    const dimensions = await imageDimensions(url);
    acquired.release();
    const image: GeneratedImage = { path: result.path, mimeType: result.mimeType, prompt: props.prompt, aspectRatio: props.aspectRatio, referenceAssetIds: selectedReferenceIds.value.slice(), ...(dimensions ?? {}) };
    generatedImage.value = image;
    await setPreview(result.path, `${props.aspectRatio} · ${dimensions ? `${dimensions.width} × ${dimensions.height}` : "生成预览"}`);
    emit("generated", image);
  } catch (error) {
    generationError.value = error instanceof Error ? error.message : "GPT 会员生图失败";
    ElMessage.error(generationError.value);
  }
  finally { generating.value = false; }
}
</script>

<style lang="scss" scoped>
.gptImagePanel { display: grid; gap: 10px; width: 100%; padding: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.gptImageAuth, .gptImageActions, .gptImageUpload { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.gptImageAuth { justify-content: space-between; font-size: 13px; }
.gptImageOptions { display: grid; gap: 8px; }
.gptImageUpload > span, .gptImageActions > span { color: var(--el-text-color-secondary); font-size: 12px; }
.gptImagePreview { display: grid; justify-items: start; gap: 8px; img { display: block; max-width: 100%; max-height: 320px; object-fit: contain; border-radius: 4px; } > div { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; color: var(--el-text-color-secondary); font-size: 12px; } }
</style>
