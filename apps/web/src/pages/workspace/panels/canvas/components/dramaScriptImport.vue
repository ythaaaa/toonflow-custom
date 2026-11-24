<template>
  <el-drawer v-model="visible" title="剧本导入与 AI 结构化" size="min(1040px, 96vw)" appendToBody destroyOnClose @closed="emit('closed')">
    <div class="importBody">
      <el-steps :active="analysis ? 2 : sourceText ? 1 : 0" finishStatus="success" simple>
        <el-step title="选择并预览原文" />
        <el-step title="AI 结构化分析" />
        <el-step title="审核后导入画布" />
      </el-steps>

      <section class="sourcePanel">
        <div class="sourceActions">
          <input ref="fileInput" class="fileInput" type="file" accept=".txt,.md,text/plain,text/markdown" @change="readFile" />
          <el-button :disabled="busy" @click="fileInput?.click()">选择 TXT / MD</el-button>
          <strong v-if="sourceName">{{ sourceName }}</strong>
          <span v-if="sourceText">{{ sourceText.length.toLocaleString() }} 字符</span>
          <el-tag v-if="analysis" type="success">Schema 校验通过</el-tag>
        </div>
        <el-alert v-if="sourceError" :title="sourceError" type="error" showIcon :closable="false" />
        <el-input v-if="sourceText && !analysis" :modelValue="sourceText" aria-label="原始剧本预览" type="textarea" :rows="18" readonly resize="vertical" />
      </section>

      <template v-if="analysis">
        <div class="reviewSummary">
          <div>
            <strong>{{ analysis.metadata.title }}</strong>
            <span>{{ analysis.characters.length }} 人物 · {{ analysis.scenes.length }} 场景 · {{ analysis.shots.length }} 镜头 · {{ analysis.referenceAssets.length }} 参考资产</span>
          </div>
          <div>
            <el-tag>{{ modelLabel }}</el-tag>
            <el-tag type="info">已逐项审核 {{ reviewed.size }} / {{ reviewTotal }}</el-tag>
          </div>
        </div>

        <el-tabs v-model="activeTab" class="reviewTabs">
          <el-tab-pane label="原始剧本" name="source">
            <el-input :modelValue="sourceText" aria-label="审核原始剧本" type="textarea" :rows="24" readonly resize="vertical" />
          </el-tab-pane>

          <el-tab-pane label="基本信息" name="metadata">
            <el-form labelPosition="top" class="metadataForm">
              <el-form-item label="剧本标题"><el-input v-model="analysis.metadata.title" /></el-form-item>
              <el-form-item label="识别到的项目"><el-input v-model="analysis.metadata.projectName" /></el-form-item>
              <el-form-item label="集数"><el-input-number v-model="analysis.metadata.episodeNumber" :min="1" /></el-form-item>
              <el-form-item label="成片时长（秒）"><el-input-number v-model="analysis.metadata.duration" :min="1" /></el-form-item>
              <el-form-item label="画幅"><el-input v-model="analysis.metadata.aspectRatio" /></el-form-item>
              <el-form-item label="叙事视角"><el-input v-model="analysis.metadata.narrativePerspective" /></el-form-item>
              <el-form-item class="wideField" label="故事摘要"><el-input v-model="analysis.metadata.summary" type="textarea" :rows="4" /></el-form-item>
            </el-form>
          </el-tab-pane>

          <el-tab-pane :label="`人物 ${analysis.characters.length}`" name="characters">
            <el-collapse>
              <el-collapse-item v-for="character in analysis.characters" :key="character.key" :name="character.key">
                <template #title>
                  <div class="itemTitle"><strong>{{ character.name }}</strong><el-tag size="small">{{ character.key }}</el-tag><el-checkbox :modelValue="isReviewed(`character:${character.key}`)" @click.stop @change="toggleReviewed(`character:${character.key}`, $event)">已审核</el-checkbox></div>
                </template>
                <el-form labelPosition="top" class="entityForm">
                  <el-form-item label="名称"><el-input v-model="character.name" /></el-form-item>
                  <el-form-item label="身份"><el-input v-model="character.identity" type="textarea" :rows="2" /></el-form-item>
                  <el-form-item label="外貌"><el-input v-model="character.appearance" type="textarea" :rows="3" /></el-form-item>
                  <el-form-item label="服装"><el-input v-model="character.outfit" type="textarea" :rows="3" /></el-form-item>
                  <el-form-item label="固定视觉特征"><el-select v-model="character.visualFeatures" multiple filterable allowCreate defaultFirstOption><el-option v-for="feature in character.visualFeatures" :key="feature" :label="feature" :value="feature" /></el-select></el-form-item>
                  <el-form-item class="wideField" label="人物提示词"><el-input v-model="character.prompt" type="textarea" :rows="5" /></el-form-item>
                </el-form>
              </el-collapse-item>
            </el-collapse>
          </el-tab-pane>

          <el-tab-pane :label="`场景 ${analysis.scenes.length}`" name="scenes">
            <el-collapse>
              <el-collapse-item v-for="scene in analysis.scenes" :key="scene.key" :name="scene.key">
                <template #title>
                  <div class="itemTitle"><strong>{{ scene.name }}</strong><el-tag size="small">{{ scene.key }}</el-tag><el-checkbox :modelValue="isReviewed(`scene:${scene.key}`)" @click.stop @change="toggleReviewed(`scene:${scene.key}`, $event)">已审核</el-checkbox></div>
                </template>
                <el-form labelPosition="top" class="entityForm">
                  <el-form-item label="名称"><el-input v-model="scene.name" /></el-form-item>
                  <el-form-item label="地点"><el-input v-model="scene.location" /></el-form-item>
                  <el-form-item label="时间"><el-input v-model="scene.time" /></el-form-item>
                  <el-form-item label="内外景"><el-select v-model="scene.interiorExterior"><el-option label="内景" value="内景" /><el-option label="外景" value="外景" /></el-select></el-form-item>
                  <el-form-item label="时段"><el-select v-model="scene.dayPart"><el-option v-for="value in dayParts" :key="value" :label="value" :value="value" /></el-select></el-form-item>
                  <el-form-item label="人物关联"><el-select v-model="scene.characterKeys" multiple><el-option v-for="character in analysis.characters" :key="character.key" :label="character.name" :value="character.key" /></el-select></el-form-item>
                  <el-form-item label="环境"><el-input v-model="scene.environment" type="textarea" :rows="3" /></el-form-item>
                  <el-form-item label="色彩"><el-input v-model="scene.color" type="textarea" :rows="3" /></el-form-item>
                  <el-form-item label="空间布局"><el-input v-model="scene.layout" type="textarea" :rows="3" /></el-form-item>
                  <el-form-item class="wideField" label="场景提示词"><el-input v-model="scene.prompt" type="textarea" :rows="5" /></el-form-item>
                </el-form>
              </el-collapse-item>
            </el-collapse>
          </el-tab-pane>

          <el-tab-pane :label="`镜头 ${analysis.shots.length}`" name="shots">
            <el-collapse>
              <el-collapse-item v-for="shot in analysis.shots" :key="shot.number" :name="shot.number">
                <template #title>
                  <div class="itemTitle"><strong>{{ shot.number }} · {{ shot.title }}</strong><span>{{ shot.startTime }}–{{ shot.endTime }} · {{ shot.duration }} 秒</span><el-checkbox :modelValue="isReviewed(`shot:${shot.number}`)" @click.stop @change="toggleReviewed(`shot:${shot.number}`, $event)">已审核</el-checkbox></div>
                </template>
                <el-form labelPosition="top" class="shotForm">
                  <el-form-item label="标题"><el-input v-model="shot.title" /></el-form-item>
                  <el-form-item label="起始时间码"><el-input v-model="shot.startTime" /></el-form-item>
                  <el-form-item label="结束时间码"><el-input v-model="shot.endTime" /></el-form-item>
                  <el-form-item label="时长（秒）"><el-input-number v-model="shot.duration" :min="0.1" :step="0.5" /></el-form-item>
                  <el-form-item label="所属场景"><el-select v-model="shot.sceneKey"><el-option v-for="scene in analysis.scenes" :key="scene.key" :label="scene.name" :value="scene.key" /></el-select></el-form-item>
                  <el-form-item label="人物关联"><el-select v-model="shot.characterKeys" multiple><el-option v-for="character in analysis.characters" :key="character.key" :label="character.name" :value="character.key" /></el-select></el-form-item>
                  <el-form-item label="景别"><el-input v-model="shot.size" /></el-form-item>
                  <el-form-item label="机位"><el-input v-model="shot.camera" type="textarea" :rows="2" /></el-form-item>
                  <el-form-item label="镜头运动"><el-input v-model="shot.movement" type="textarea" :rows="2" /></el-form-item>
                  <el-form-item label="动作"><el-input v-model="shot.action" type="textarea" :rows="3" /></el-form-item>
                  <el-form-item class="wideField" label="画面描述"><el-input v-model="shot.visualDescription" type="textarea" :rows="4" /></el-form-item>
                  <el-form-item class="wideField" label="声音"><el-input v-model="shot.sound" type="textarea" :rows="3" /></el-form-item>
                  <el-form-item class="wideField" label="镜头参考图提示词"><el-input v-model="shot.imagePrompt" type="textarea" :rows="5" /></el-form-item>
                  <el-form-item class="wideField" label="H3 视频提示词"><el-input v-model="shot.h3Prompt" type="textarea" :rows="6" /></el-form-item>
                </el-form>
              </el-collapse-item>
            </el-collapse>
          </el-tab-pane>

          <el-tab-pane :label="`参考资产 ${analysis.referenceAssets.length}`" name="assets">
            <article v-for="(asset, index) in analysis.referenceAssets" :key="`${asset.kind}:${asset.name}:${index}`" class="reviewCard">
              <div class="itemTitle"><el-tag>{{ assetKindLabel[asset.kind] }}</el-tag><strong>{{ asset.name }}</strong><el-checkbox :modelValue="isReviewed(`asset:${index}`)" @change="toggleReviewed(`asset:${index}`, $event)">已审核</el-checkbox></div>
              <el-input v-model="asset.description" type="textarea" :rows="3" />
              <span>人物：{{ relationLabels(asset.characterKeys, "character") || "无" }} · 场景：{{ relationLabels(asset.sceneKeys, "scene") || "无" }} · 镜头：{{ asset.shotNumbers.join("、") || "无" }}</span>
            </article>
          </el-tab-pane>

          <el-tab-pane :label="`连续性 ${analysis.continuityConstraints.length}`" name="continuity">
            <article v-for="(constraint, index) in analysis.continuityConstraints" :key="`${constraint.category}:${index}`" class="reviewCard">
              <div class="itemTitle"><el-tag>{{ continuityLabel[constraint.category] }}</el-tag><span>{{ constraint.shotNumbers.join("、") || "全片" }}</span><el-checkbox :modelValue="isReviewed(`constraint:${index}`)" @change="toggleReviewed(`constraint:${index}`, $event)">已审核</el-checkbox></div>
              <el-input v-model="constraint.description" type="textarea" :rows="3" />
            </article>
          </el-tab-pane>

          <el-tab-pane :label="`待确认 ${analysis.pendingQuestions.length}`" name="questions">
            <el-alert v-if="!analysis.pendingQuestions.length" title="AI 未识别到需要用户决定的备选方案" type="success" :closable="false" />
            <article v-for="question in analysis.pendingQuestions" :key="question.id" class="reviewCard pendingCard">
              <div class="itemTitle"><strong>{{ question.question }}</strong><el-checkbox :modelValue="isReviewed(`question:${question.id}`)" @change="toggleReviewed(`question:${question.id}`, $event)">已审核</el-checkbox></div>
              <el-select v-model="question.options" multiple filterable allowCreate defaultFirstOption aria-label="待确认选项"><el-option v-for="option in question.options" :key="option" :label="option" :value="option" /></el-select>
              <el-input v-model="question.reason" type="textarea" :rows="2" />
            </article>
          </el-tab-pane>
        </el-tabs>
      </template>

      <el-alert v-if="operationError" :title="operationError" type="error" showIcon :closable="false" />
    </div>

    <template #footer>
      <div class="footerActions">
        <span v-if="analysis">确认后将写入 {{ state.project.name }} / {{ currentEpisode?.title }}，并由原生画布同步节点与连线。</span>
        <span v-else />
        <div>
          <el-button :disabled="busy" @click="visible = false">取消</el-button>
          <el-button v-if="!analysis" type="primary" :loading="analyzing" :disabled="!sourceText || !selectedModel" @click="analyze">使用订阅模型分析</el-button>
          <el-button v-else type="primary" :loading="confirming" @click="confirmImport">整体确认并创建画布节点</el-button>
        </div>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, watch } from "vue";
import axios from "axios";
import { ElMessage, ElMessageBox } from "element-plus";
import { confirmDramaScriptImport, type DramaScriptAnalysis, type DramaScriptImportResult, type DramaProject } from "@/lib/dramaWorkspace";
import { codexOAuthTestModels, refreshCodexOAuthTestModels } from "@/stores/settings";
import type { DramaCanvasState } from "@/lib/dramaCanvas";
import type { DramaWorkspaceFiles } from "@toonflow/drama-workspace";

type DramaProjectMutation = (files: DramaWorkspaceFiles, project: DramaProject, manifestPath: string) => Promise<unknown>;
type AnalysisResponse = { sourceFingerprint: string; analysis: DramaScriptAnalysis; model: { providerId: string; modelId: string; label: string } };
const props = defineProps<{ state: DramaCanvasState; mutateProject: (mutation: DramaProjectMutation) => Promise<DramaProject> }>();
const emit = defineEmits<{ closed: []; imported: [result: DramaScriptImportResult] }>();
const visible = ref(true);
const fileInput = ref<HTMLInputElement>();
const sourceName = ref("");
const sourceText = ref("");
const sourceFingerprint = ref("");
const sourceError = ref("");
const operationError = ref("");
const analysis = ref<DramaScriptAnalysis>();
const analyzing = ref(false);
const confirming = ref(false);
const selectedModelId = ref("");
const reasoningLevel = ref("");
const modelLabel = ref("");
const activeTab = ref("metadata");
const reviewed = ref(new Set<string>());
let requestController: AbortController | undefined;

const busy = computed(() => analyzing.value || confirming.value);
const selectedModel = computed(() => codexOAuthTestModels.value.find(item => item.modelId === selectedModelId.value));
const currentEpisode = computed(() => props.state.project.episodes.find(item => item.id === props.state.episodeId));
const reviewTotal = computed(() => analysis.value ? analysis.value.characters.length + analysis.value.scenes.length + analysis.value.shots.length
  + analysis.value.referenceAssets.length + analysis.value.continuityConstraints.length + analysis.value.pendingQuestions.length : 0);
const dayParts = ["白天", "夜晚", "黄昏", "清晨"] as const;
const assetKindLabel = { character: "人物参考图", scene: "场景母版", prop: "道具参考图", shot: "镜头参考图" } as const;
const continuityLabel = { character: "人物", costume: "服装", prop: "道具", layout: "空间布局", color: "色彩", camera: "镜头视角", sound: "声音", other: "其他" } as const;

watch(codexOAuthTestModels, models => {
  if (!models.some(item => item.modelId === selectedModelId.value)) selectedModelId.value = models[0]?.modelId ?? "";
}, { immediate: true });
watch(selectedModel, model => {
  const levels = model?.reasoningLevels ?? [];
  reasoningLevel.value = levels.includes("high") ? "high" : levels.at(-1) ?? "";
}, { immediate: true });
onMounted(async () => {
  try {
    const status = await refreshCodexOAuthTestModels(true);
    if (status.status !== "connected" || !status.models.length) sourceError.value = "请先在画布聊天中连接 ChatGPT/Codex OAuth 订阅模型。";
  } catch (error) { sourceError.value = errorMessage(error, "读取 Codex OAuth 模型失败"); }
});
onScopeDispose(() => requestController?.abort());

async function readFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  sourceError.value = "";
  operationError.value = "";
  analysis.value = undefined;
  sourceFingerprint.value = "";
  reviewed.value = new Set();
  if (!/\.(txt|md)$/i.test(file.name)) { sourceError.value = "仅支持 TXT、MD 文件"; return; }
  if (file.size > 1024 * 1024) { sourceError.value = "剧本文件不能超过 1 MiB"; return; }
  const text = await file.text();
  if (!text.trim()) { sourceError.value = "剧本文件不能为空"; return; }
  sourceName.value = file.name;
  sourceText.value = text;
}

async function analyze() {
  const model = selectedModel.value;
  if (!sourceText.value || !sourceName.value || !model || analyzing.value) return;
  requestController?.abort();
  requestController = new AbortController();
  analyzing.value = true;
  operationError.value = "";
  try {
    const { data } = await axios.post<{ code: number; data: AnalysisResponse; message?: string }>("/api/dramaImport/analyze", {
      sourceName: sourceName.value,
      sourceText: sourceText.value,
      providerId: model.providerId,
      modelId: model.modelId,
      ...(reasoningLevel.value ? { thinkingLevel: reasoningLevel.value } : {}),
    }, { headers: { "x-toonflow-workspace": "1" }, signal: requestController.signal, timeout: 310000 });
    if (data.code !== 200 || !data.data?.analysis) throw new Error(data.message || "AI 分析没有返回结果");
    sourceFingerprint.value = data.data.sourceFingerprint;
    analysis.value = structuredClone(data.data.analysis);
    modelLabel.value = data.data.model.label;
    activeTab.value = "metadata";
    reviewed.value = new Set();
    ElMessage.success("AI 结构化分析完成，请审核后再导入画布");
  } catch (error) {
    if (!requestController.signal.aborted) operationError.value = errorMessage(error, "AI 剧本分析失败");
  } finally { analyzing.value = false; }
}

async function confirmImport() {
  const currentAnalysis = analysis.value;
  if (!currentAnalysis || !sourceFingerprint.value || confirming.value) return;
  try {
    await ElMessageBox.confirm(
      `将创建或复用 1 个正式剧本、${currentAnalysis.characters.length} 个人物、${currentAnalysis.scenes.length} 个场景和 ${currentAnalysis.shots.length} 个镜头。现有画布节点位置不会被重排。`,
      "确认导入当前画布？",
      { type: "warning", confirmButtonText: "确认并创建", cancelButtonText: "继续审核" },
    );
  } catch { return; }
  confirming.value = true;
  operationError.value = "";
  try {
    const { data } = await axios.post<{ code: number; data: { sourceName: string; sourceText: string; sourceFingerprint: string; analysis: DramaScriptAnalysis }; message?: string }>("/api/dramaImport/validate", {
      sourceName: sourceName.value,
      sourceText: sourceText.value,
      sourceFingerprint: sourceFingerprint.value,
      analysis: currentAnalysis,
    }, { headers: { "x-toonflow-workspace": "1" }, timeout: 30000 });
    if (data.code !== 200 || !data.data?.analysis) throw new Error(data.message || "服务端复核未通过");
    let result: DramaScriptImportResult | undefined;
    await props.mutateProject(async (files, project, manifestPath) => {
      result = await confirmDramaScriptImport(files, project, props.state.episodeId, data.data, manifestPath);
    });
    if (!result) throw new Error("业务数据已写入，但未能取得导入结果");
    emit("imported", result);
    ElMessage.success(result.deduplicated ? "相同剧本已存在，未创建重复业务记录" : "剧本、业务关系和画布节点已创建");
    visible.value = false;
  } catch (error) { operationError.value = errorMessage(error, "确认导入失败"); }
  finally { confirming.value = false; }
}

function isReviewed(key: string) {
  return reviewed.value.has(key);
}

function toggleReviewed(key: string, value: string | number | boolean) {
  const next = new Set(reviewed.value);
  if (value) next.add(key);
  else next.delete(key);
  reviewed.value = next;
}

function relationLabels(keys: string[], kind: "character" | "scene") {
  const items = kind === "character" ? analysis.value?.characters : analysis.value?.scenes;
  return keys.map(key => items?.find(item => item.key === key)?.name ?? key).join("、");
}

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || error.message || fallback : error instanceof Error ? error.message : fallback;
}
</script>

<style lang="scss" scoped>
.importBody { display: grid; gap: 16px; }
.sourcePanel { display: grid; gap: 12px; }
.sourceActions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; strong { overflow-wrap: anywhere; } span { color: var(--el-text-color-secondary); font-size: 12px; } }
.fileInput { display: none; }
.reviewSummary { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 12px; border: 1px solid var(--el-border-color); border-radius: 8px; background: var(--el-fill-color-lighter); > div { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; } span { color: var(--el-text-color-secondary); font-size: 12px; } }
.reviewTabs { min-width: 0; }
.metadataForm, .entityForm, .shotForm { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; .wideField { grid-column: 1 / -1; } .el-select, .el-input-number { width: 100%; } }
.shotForm { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.itemTitle { display: flex; align-items: center; flex-wrap: wrap; width: 100%; gap: 8px; padding-right: 12px; > span { color: var(--el-text-color-secondary); font-size: 12px; } .el-checkbox { margin-left: auto; } }
.reviewCard { display: grid; gap: 10px; margin-bottom: 12px; padding: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; > span { color: var(--el-text-color-secondary); font-size: 12px; overflow-wrap: anywhere; } .el-select { width: 100%; } }
.pendingCard { border-color: var(--el-color-warning-light-5); }
.footerActions { display: flex; align-items: center; justify-content: space-between; gap: 12px; > span { color: var(--el-text-color-secondary); font-size: 12px; text-align: left; } > div { display: flex; flex: none; gap: 8px; } }
@media (max-width: 760px) { .metadataForm, .entityForm, .shotForm { grid-template-columns: 1fr; .wideField { grid-column: auto; } } .footerActions { align-items: stretch; flex-direction: column; } }
</style>
