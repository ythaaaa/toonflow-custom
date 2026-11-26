<template>
  <el-dialog
    v-model="visible"
    :title="model ? '编辑模型' : '添加模型'"
    width="min(980px, calc(100vw - 32px))"
    alignCenter
    appendToBody
    destroyOnClose
    :closeOnClickModal="false">
    <div class="dialogContent">
      <el-form labelPosition="top" @submit.prevent>
        <template v-if="isU17Workflow">
          <el-divider contentPosition="left">基础信息</el-divider>
          <div class="u17BasicInfo">
            <el-form-item label="服务商"><el-input :modelValue="providerLabel || providerId || 'autodlComfyUi'" readonly /></el-form-item>
            <el-form-item label="服务商版本"><el-input :modelValue="providerVersion || '未提供'" readonly /></el-form-item>
            <el-form-item label="工作流 ID"><el-input :modelValue="zealmanWorkflowId" readonly /></el-form-item>
            <el-form-item label="工作流版本"><el-input :modelValue="workflowVersion" readonly /></el-form-item>
            <el-form-item label="启用状态"><el-switch v-model="draft.enabled" activeText="启用" inactiveText="停用" /></el-form-item>
          </div>
        </template>
        <el-form-item label="显示名称" required>
          <el-input v-model="draft.label" clearable aria-label="模型显示名称" />
        </el-form-item>
        <el-form-item label="模型 ID" required>
          <el-input v-model="draft.id" clearable aria-label="模型 ID" />
        </el-form-item>
        <el-form-item label="模型类型">
          <el-select v-model="draft.type" aria-label="模型类型">
            <el-option v-if="model?.type === 'text'" value="text" label="文本（旧配置）" disabled />
            <el-option v-for="item in modelTypes" :key="item.value" :value="item.value" :label="item.label" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="draft.type === 'image'" label="图片生成模式" required>
          <el-checkbox-group v-model="draft.imageMode">
            <el-checkbox v-for="item in imageModes" :key="item.value" :value="item.value">{{ item.label }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <template v-if="draft.type === 'video'">
          <el-form-item label="视频生成模式" required>
            <div class="videoModes">
              <el-checkbox-group v-model="draft.videoMode">
                <el-checkbox v-for="item in videoModes" :key="item.value" :value="item.value">{{ item.label }}</el-checkbox>
              </el-checkbox-group>
              <el-checkbox-group v-if="draft.videoMode.includes('multiReference')" v-model="draft.mixedMode" class="referenceModes">
                <div v-for="item in referenceModes" :key="item.value" class="referenceItem">
                  <el-checkbox :value="item.value">{{ item.label }}</el-checkbox>
                  <el-input-number
                    v-if="draft.mixedMode.includes(item.value)"
                    v-model="draft.mixedModeCount[item.value]"
                    :min="1"
                    :step="1"
                    :precision="0"
                    controlsPosition="right"
                    size="small"
                    :aria-label="`${item.label}数量`" />
                </div>
              </el-checkbox-group>
            </div>
          </el-form-item>
          <el-divider v-if="isU17Workflow" contentPosition="left">模型能力配置</el-divider>
          <el-form-item label="音频输出策略">
            <el-radio-group v-model="draft.audio">
              <el-radio value="optional">可选音频</el-radio>
              <el-radio :value="true">始终输出音频</el-radio>
              <el-radio :value="false">无音频</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="isU17Workflow ? '工作流数字参数' : '时长与分辨率'" :required="!isU17Workflow">
            <div v-if="isU17Workflow" class="u17CapabilityMap">
              <el-text type="info" size="small">视频时长、megapixels 和放大倍率分别直接传入工作流数字字段，不绑定固定分辨率档位。参数可用范围由远程节点校验。</el-text>
            </div>
            <div v-else class="mappingEditor">
              <div class="mappingHeader"><span>时长（秒）</span><span>分辨率</span></div>
              <div v-for="(row, index) in draft.durationResolutionMap" :key="index" class="mappingRow">
                <span class="rowIndex">{{ index + 1 }}</span>
                <el-input-tag v-model="row.duration" placeholder="输入后按回车" :aria-label="`第 ${index + 1} 组时长`" />
                <icon-arrow-right :size="16" aria-hidden="true" />
                <el-input-tag v-model="row.resolution" placeholder="输入后按回车" :aria-label="`第 ${index + 1} 组分辨率`" />
                <el-button
                  text
                  type="danger"
                  :icon="IconTrash"
                  :disabled="draft.durationResolutionMap.length === 1"
                  :aria-label="`删除第 ${index + 1} 组时长与分辨率`"
                  @click="draft.durationResolutionMap.splice(index, 1)" />
              </div>
              <el-button class="addMapping" :icon="IconPlus" @click="draft.durationResolutionMap.push({ duration: [], resolution: [] })">添加时长与分辨率</el-button>
            </div>
          </el-form-item>
        </template>
        <template v-if="isU17Workflow && workflowNodes">
          <el-divider contentPosition="left">工作流参数映射</el-divider>
          <p class="comfyMappingHint">以下字段对应当前 U17 API 定义，输入素材顺序和提示词字段固定。参考音频为输入素材配置，和上方的音频输出策略分开管理。</p>
          <div class="u17FieldMappings">
            <div class="u17FieldHeader"><span>业务参数</span><span>工作流字段</span><span>类型</span><span>默认值（JSON）</span><span>必填</span><span>可选值（JSON 数组）</span><span>转换规则</span></div>
            <div v-for="item in u17FieldDrafts" :key="item.id" class="u17FieldRow">
              <el-input v-model="item.businessName" :aria-label="`${item.businessName}业务参数名称`" />
              <el-input :modelValue="item.input" readonly dir="ltr" />
              <el-select v-model="item.dataType" :aria-label="`${item.businessName}数据类型`">
                <el-option value="string" label="String" /><el-option value="number" label="Number" />
                <el-option value="boolean" label="Boolean" /><el-option value="array" label="Array" /><el-option value="object" label="Object" />
              </el-select>
              <el-input v-model="item.defaultValueText" dir="ltr" :aria-label="`${item.businessName}默认值`" />
              <el-switch v-model="item.required" :aria-label="`${item.businessName}是否必填`" />
              <el-input v-model="item.optionsText" dir="ltr" :aria-label="`${item.businessName}可选值`" />
              <el-select v-model="item.transform" disabled :aria-label="`${item.businessName}转换规则`">
                <el-option value="identity" label="原值" />
              </el-select>
            </div>
          </div>
          <div class="u17Preview">
            <h4>参数转换预览</h4>
            <div class="u17PreviewControls">
              <el-form-item label="视频时长（秒）"><el-input-number v-model="previewDuration" :min="5" :max="15" :step="1" :precision="0" controlsPosition="right" /></el-form-item>
              <el-form-item label="megapixels"><el-input-number v-model="previewMegapixels" :step="0.1" controlsPosition="right" /></el-form-item>
              <el-form-item label="画幅"><el-select v-model="previewAspectRatio"><el-option v-for="item in previewAspectRatios" :key="item.value" :value="item.value" :label="item.label" /></el-select></el-form-item>
              <el-form-item label="放大倍率"><el-input-number v-model="previewUpscale" :step="0.1" controlsPosition="right" /></el-form-item>
            </div>
            <pre>{{ JSON.stringify(previewInputValues, null, 2) }}</pre>
            <el-text type="info" size="small">预览按工作流原值映射，不上传参考素材，也不提交云端任务。</el-text>
          </div>
        </template>
        <template v-else-if="comfyUiMode && workflowNodes">
          <el-divider contentPosition="left">{{ zealmanWorkflowId ? "Zealman 工作流参数映射" : "ComfyUI 工作流节点映射" }}</el-divider>
          <el-form-item v-if="zealmanWorkflowId" label="Zealman workflow_id"><el-input :modelValue="zealmanWorkflowId" readonly /></el-form-item>
          <p class="comfyMappingHint">把 Toonflow 的输入映射到 API 工作流中的可编辑节点参数；连线输入不会出现在列表中。</p>
          <el-form-item :label="zealmanWorkflowId === u17WorkflowId ? '正向提示词（工作流未提供参数时可留空）' : '正向提示词'">
            <el-select v-model="mappingDraft.prompt" clearable filterable aria-label="正向提示词节点映射">
              <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="draft.videoMode.includes('singleImage')" label="单张参考图">
            <el-select v-model="mappingDraft.image" clearable filterable aria-label="参考图片节点映射">
              <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
            </el-select>
          </el-form-item>
          <div v-if="draft.videoMode.includes('multiReference') && draft.mixedMode.includes('imageReference')">
            <el-form-item v-for="index in imageReferenceCount" :key="index" :label="`图${index} → ${referenceInputLabel('image', index - 1)}`">
              <el-select v-model="mappingDraft.referenceImages[index - 1]" clearable filterable :aria-label="`参考图 ${index} 节点映射`">
                <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
              </el-select>
            </el-form-item>
          </div>
          <div v-if="zealmanWorkflowId && draft.videoMode.includes('multiReference') && draft.mixedMode.includes('videoReference')">
            <el-form-item v-for="index in videoReferenceCount" :key="index" :label="`视频${index} → ${referenceInputLabel('video', index - 1)}`">
              <el-select v-model="mappingDraft.referenceVideos[index - 1]" clearable filterable :aria-label="`参考视频 ${index} 节点映射`">
                <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
              </el-select>
            </el-form-item>
          </div>
          <div v-if="zealmanWorkflowId && draft.videoMode.includes('multiReference') && draft.mixedMode.includes('audioReference')">
            <el-form-item v-for="index in audioReferenceCount" :key="index" :label="`音频${index} → ${referenceInputLabel('audio', index - 1)}`">
              <el-select v-model="mappingDraft.referenceAudios[index - 1]" clearable filterable :aria-label="`参考音频 ${index} 节点映射`">
                <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
              </el-select>
            </el-form-item>
          </div>
          <div v-if="draft.videoMode.some(mode => ['startEndRequired', 'endFrameOptional', 'startFrameOptional'].includes(mode))" class="frameMapping">
            <el-form-item label="首帧">
              <el-select v-model="mappingDraft.firstFrame" clearable filterable aria-label="首帧节点映射">
                <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
              </el-select>
            </el-form-item>
            <el-form-item label="尾帧">
              <el-select v-model="mappingDraft.lastFrame" clearable filterable aria-label="尾帧节点映射">
                <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
              </el-select>
            </el-form-item>
          </div>
          <div v-if="zealmanWorkflowId === u17WorkflowId" class="frameMapping">
            <el-form-item label="画幅比例参数（可选）">
              <el-select v-model="mappingDraft.aspectRatio" clearable filterable aria-label="画幅比例参数映射">
                <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
              </el-select>
            </el-form-item>
            <el-form-item label="生成像素量参数（可选）">
              <el-select v-model="mappingDraft.megapixels" clearable filterable aria-label="生成像素量参数映射">
                <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
              </el-select>
            </el-form-item>
          </div>
          <div v-if="zealmanWorkflowId === u17WorkflowId" class="frameMapping">
            <el-form-item label="放大倍率参数（可选）">
              <el-select v-model="mappingDraft.upscale" clearable filterable aria-label="放大倍率参数映射">
                <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
              </el-select>
            </el-form-item>
          </div>
          <div class="frameMapping">
            <el-form-item label="宽度">
              <el-select v-model="mappingDraft.width" clearable filterable aria-label="宽度节点映射">
                <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
              </el-select>
            </el-form-item>
            <el-form-item label="高度">
              <el-select v-model="mappingDraft.height" clearable filterable aria-label="高度节点映射">
                <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
              </el-select>
            </el-form-item>
          </div>
          <div class="frameMapping">
            <el-form-item label="分辨率参数（可选）">
              <el-select v-model="mappingDraft.resolution" clearable filterable aria-label="分辨率节点映射">
                <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
              </el-select>
            </el-form-item>
            <el-form-item label="时长参数">
              <el-select v-model="mappingDraft.duration" clearable filterable aria-label="时长节点映射">
                <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
              </el-select>
            </el-form-item>
          </div>
          <div class="frameMapping">
            <el-form-item label="时长单位">
              <el-select v-model="mappingDraft.durationUnit" placeholder="请选择实际单位" aria-label="工作流时长单位">
                <el-option value="seconds" label="秒" />
                <el-option value="frames" label="帧数" />
              </el-select>
            </el-form-item>
            <el-form-item label="帧率（用于秒转帧）">
              <el-input-number v-model="mappingDraft.frameRate" :min="1" :max="120" :step="1" controlsPosition="right" aria-label="工作流帧率" />
            </el-form-item>
          </div>
          <el-form-item label="帧率参数（可选）">
            <el-select v-model="mappingDraft.fps" clearable filterable aria-label="帧率节点映射">
              <el-option v-for="item in workflowInputOptions" :key="item.value" :value="item.value" :label="item.label" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="!zealmanWorkflowId" label="输出视频节点">
            <el-select v-model="mappingDraft.outputNodeIds" multiple clearable filterable aria-label="工作流输出节点">
              <el-option v-for="item in workflowOutputOptions" :key="item.value" :value="item.value" :label="item.label" />
            </el-select>
          </el-form-item>
        </template>
        <details class="modelOptions">
          <summary>更多配置（JSON）</summary>
          <el-input v-model="options" type="textarea" dir="ltr" :rows="6" resize="vertical" aria-label="模型的更多配置" />
        </details>
      </el-form>
    </div>
    <el-alert v-if="formError" class="formError" :title="formError" type="error" :closable="false" showIcon />
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="confirmModel">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElAlert, ElButton, ElCheckbox, ElCheckboxGroup, ElDialog, ElDivider, ElForm, ElFormItem, ElInput, ElInputNumber, ElInputTag, ElOption, ElRadio, ElRadioGroup, ElSelect, ElSwitch } from "element-plus";
import "element-plus/es/components/alert/style/css";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/checkbox/style/css";
import "element-plus/es/components/checkbox-group/style/css";
import "element-plus/es/components/dialog/style/css";
import "element-plus/es/components/form/style/css";
import "element-plus/es/components/form-item/style/css";
import "element-plus/es/components/input/style/css";
import "element-plus/es/components/input-number/style/css";
import "element-plus/es/components/input-tag/style/css";
import "element-plus/es/components/option/style/css";
import "element-plus/es/components/radio/style/css";
import "element-plus/es/components/radio-group/style/css";
import "element-plus/es/components/select/style/css";
import "element-plus/es/components/switch/style/css";
import { IconArrowRight, IconPlus, IconTrash } from "@tabler/icons-vue";
import type { MediaProviderModel } from "./types";

const { model, models, comfyUiMode = false, providerId = "", providerLabel = "", providerVersion = "" } = defineProps<{
  model?: MediaProviderModel; models: MediaProviderModel[]; comfyUiMode?: boolean; providerId?: string; providerLabel?: string; providerVersion?: string;
}>();
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ confirmed: [model: MediaProviderModel] }>();
const modelTypes = [
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
];
const imageModes = [
  { value: "text", label: "文生图" },
  { value: "singleImage", label: "单图参考" },
  { value: "multiReference", label: "多图参考" },
];
const videoModes = [
  { value: "singleImage", label: "单图参考" },
  { value: "startEndRequired", label: "首尾帧必填" },
  { value: "endFrameOptional", label: "尾帧可选" },
  { value: "startFrameOptional", label: "首帧可选" },
  { value: "text", label: "文生视频" },
  { value: "multiReference", label: "混合参考" },
];
const referenceModes = [
  { value: "videoReference", label: "视频参考" },
  { value: "imageReference", label: "图片参考" },
  { value: "audioReference", label: "音频参考" },
];
const draft = ref(createDraft());
const options = ref("{}");
const formError = ref("");
let original: Record<string, unknown> = {};
let initialDraft = createDraft();
let initialExtraMode: unknown;
type ComfyNode = { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } };
type ComfyInputMapping = { nodeId: string; input: string };
type U17FieldDraft = { id: string; businessName: string; input: string; dataType: "string" | "number" | "boolean" | "array" | "object"; defaultValueText: string; required: boolean; optionsText: string; transform: "identity" | "string" | "number" | "boolean" | "array" };
const u17WorkflowId = "API-U17-9图1视频3音频V1-api";
type ComfyMapping = {
  prompt?: ComfyInputMapping; image?: ComfyInputMapping; firstFrame?: ComfyInputMapping; lastFrame?: ComfyInputMapping;
  referenceImages?: ComfyInputMapping[]; referenceVideos?: ComfyInputMapping[]; referenceAudios?: ComfyInputMapping[];
  aspectRatio?: ComfyInputMapping; megapixels?: ComfyInputMapping; multiple?: ComfyInputMapping; upscale?: ComfyInputMapping;
  width?: ComfyInputMapping; height?: ComfyInputMapping; resolution?: ComfyInputMapping; duration?: ComfyInputMapping; fps?: ComfyInputMapping;
  fieldSettings?: Record<string, { businessName?: string; dataType?: string; defaultValue?: unknown; required?: boolean; options?: unknown[]; transform?: string }>;
  durationUnit?: "seconds" | "frames"; frameRate?: number; outputNodeIds?: string[];
};
const workflowNodes = ref<Record<string, ComfyNode>>();
const zealmanWorkflowId = ref("");
const zealmanInputs = ref<Record<string, unknown>>();
const u17FieldDrafts = ref<U17FieldDraft[]>([]);
const previewDuration = ref(5);
const previewMegapixels = ref(0.9);
const previewAspectRatio = ref("16:9 (Widescreen)");
const previewUpscale = ref(1);
const mappingDraft = ref({
  prompt: "", image: "", firstFrame: "", lastFrame: "", width: "", height: "", resolution: "", aspectRatio: "", megapixels: "", multiple: "", upscale: "", duration: "", fps: "",
  referenceImages: [] as string[], referenceVideos: [] as string[], referenceAudios: [] as string[],
  durationUnit: "" as "" | "seconds" | "frames", frameRate: undefined as number | undefined, outputNodeIds: [] as string[],
});
const workflowInputOptions = computed(() => Object.entries(workflowNodes.value ?? {}).flatMap(([nodeId, node]) => Object.entries(node.inputs)
  .filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value) || zealmanWorkflowId.value && (Array.isArray(value) || isRecord(value)))
  .map(([input, value]) => ({ value: encodeMapping({ nodeId, input }), label: zealmanWorkflowId.value
    ? `${input} · 默认值 ${formatValue(value)}` : `#${nodeId} · ${node._meta?.title || node.class_type} → ${input}` }))));
const workflowOutputOptions = computed(() => Object.entries(workflowNodes.value ?? {}).filter(([, node]) => /save|video|combine/i.test(node.class_type))
  .map(([nodeId, node]) => ({ value: nodeId, label: `#${nodeId} · ${node._meta?.title || node.class_type}` })));
function cloneWorkflowValues(value?: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>;
}
const imageReferenceCount = computed(() => Number(draft.value.mixedModeCount.imageReference) || 0);
const videoReferenceCount = computed(() => Number(draft.value.mixedModeCount.videoReference) || 0);
const audioReferenceCount = computed(() => Number(draft.value.mixedModeCount.audioReference) || 0);
const isU17Workflow = computed(() => zealmanWorkflowId.value === u17WorkflowId);
const workflowVersion = computed(() => {
  const version = /V(\d+)(?:-|$)/i.exec(zealmanWorkflowId.value)?.[1];
  return version ? `V${version}` : "未在工作流 ID 中提供";
});
const previewAspectRatios = computed(() => u17FieldDrafts.value.find(item => item.id === "aspectRatio")?.optionsText
  ? tryParseJsonArray(u17FieldDrafts.value.find(item => item.id === "aspectRatio")!.optionsText).flatMap(item => typeof item === "string" ? [{ value: item, label: item }] : item && typeof item === "object" && typeof (item as { value?: unknown }).value === "string" ? [{ value: (item as { value: string }).value, label: typeof (item as { label?: unknown }).label === "string" ? (item as { label: string }).label : (item as { value: string }).value }] : [])
  : []);
const previewInputValues = computed(() => {
  const values = cloneWorkflowValues(zealmanInputs.value);
  const target = (id: string) => u17FieldDrafts.value.find(item => item.id === id)?.input;
  const set = (id: string, value: unknown) => { const input = target(id); if (input && Object.hasOwn(values, input)) values[input] = value; };
  for (const item of u17FieldDrafts.value) {
    try { values[item.input] = readDraftValue(item); } catch { /* Keep the last valid workflow default while the field is being edited. */ }
  }
  set("prompt", "[本地预览提示词]");
  for (const item of u17FieldDrafts.value.filter(item => /^(image|video|audio)Reference:\d+$/.test(item.id))) {
    if (item.input && Object.hasOwn(values, item.input)) values[item.input] = "";
  }
  set("aspectRatio", previewAspectRatio.value);
  set("megapixels", previewMegapixels.value);
  set("duration", previewDuration.value);
  set("upscale", previewUpscale.value);
  return values;
});
function referenceInputLabel(mediaType: "image" | "video" | "audio", index: number) {
  const key = `ref_${mediaType}_${index}`;
  const labels = { image: "图片", video: "视频", audio: "音频" };
  return zealmanInputs.value && Object.hasOwn(zealmanInputs.value, key) ? key : `选择工作流${labels[mediaType]}参数`;
}
function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "空";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
function inferValueType(value: unknown): U17FieldDraft["dataType"] {
  return Array.isArray(value) ? "array" : value && typeof value === "object" ? "object"
    : typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string";
}
function parseJsonArray(value: string): unknown[] {
  const parsed: unknown = JSON.parse(value || "[]");
  if (!Array.isArray(parsed)) throw new Error("可选值必须是 JSON 数组");
  return parsed;
}
function tryParseJsonArray(value: string) {
  try { return parseJsonArray(value); } catch { return []; }
}
function readDraftValue(item: U17FieldDraft) {
  if (item.dataType === "string") return item.defaultValueText;
  let value: unknown;
  try { value = JSON.parse(item.defaultValueText); }
  catch { throw new Error(`${item.businessName}默认值不是有效 JSON`); }
  if (item.dataType === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${item.businessName}默认值必须是数字`);
  if (item.dataType === "boolean" && typeof value !== "boolean") throw new Error(`${item.businessName}默认值必须是布尔值`);
  if (item.dataType === "array" && !Array.isArray(value)) throw new Error(`${item.businessName}默认值必须是数组`);
  if (item.dataType === "object" && (!isRecord(value))) throw new Error(`${item.businessName}默认值必须是对象`);
  return value;
}
function getMappingInput(mapping: ComfyInputMapping | undefined) {
  return mapping?.nodeId === "input_values" ? mapping.input : undefined;
}
function createU17FieldDrafts(inputs: Record<string, unknown> | undefined, mapping: ComfyMapping, rules: unknown[]) {
  if (!inputs) return [];
  const definitions: { id: string; businessName: string; mapping?: ComfyInputMapping }[] = [
    { id: "prompt", businessName: "提示词", mapping: mapping.prompt },
    ...Array.from({ length: 9 }, (_, index) => ({ id: `imageReference:${index}`, businessName: `参考图片 ${index + 1}`, mapping: mapping.referenceImages?.[index] })),
    { id: "videoReference:0", businessName: "参考视频 1", mapping: mapping.referenceVideos?.[0] },
    ...Array.from({ length: 3 }, (_, index) => ({ id: `audioReference:${index}`, businessName: `参考音频 ${index + 1}`, mapping: mapping.referenceAudios?.[index] })),
    { id: "aspectRatio", businessName: "画幅比例", mapping: mapping.aspectRatio },
    { id: "megapixels", businessName: "生成像素量", mapping: mapping.megapixels },
    { id: "duration", businessName: "视频时长", mapping: mapping.duration },
    { id: "upscale", businessName: "放大倍率", mapping: mapping.upscale },
  ];
  const settings = mapping.fieldSettings ?? {};
  return definitions.flatMap(item => {
    const input = getMappingInput(item.mapping);
    if (!input || !Object.hasOwn(inputs, input)) return [];
    const setting = settings[item.id] ?? {};
    const ruleOptions = item.id === "aspectRatio" ? (rules.find((rule): rule is Record<string, unknown> => isRecord(rule) && rule.field === "aspectRatio")?.options ?? []) : [];
    const options = Array.isArray(setting.options) ? setting.options : Array.isArray(ruleOptions) ? ruleOptions : [];
    const defaultValue = Object.hasOwn(setting, "defaultValue") ? setting.defaultValue : inputs[input];
    return [{
      id: item.id, businessName: typeof setting.businessName === "string" ? setting.businessName : item.businessName, input,
      dataType: ["string", "number", "boolean", "array", "object"].includes(String(setting.dataType)) ? setting.dataType as U17FieldDraft["dataType"] : inferValueType(defaultValue),
      defaultValueText: typeof defaultValue === "string" ? defaultValue : JSON.stringify(defaultValue ?? null),
      required: typeof setting.required === "boolean" ? setting.required : item.id === "prompt",
      optionsText: JSON.stringify(options),
      transform: ["string", "number", "boolean", "array"].includes(String(setting.transform)) ? setting.transform as U17FieldDraft["transform"] : "identity",
    }];
  });
}
watch([imageReferenceCount, videoReferenceCount, audioReferenceCount, zealmanInputs], ([imageCount, videoCount, audioCount, inputs]) => {
  if (!inputs) return;
  for (const [mediaType, count, field] of [["image", imageCount, "referenceImages"], ["video", videoCount, "referenceVideos"], ["audio", audioCount, "referenceAudios"]] as const) {
    const targets = mappingDraft.value[field];
    const keys = Object.keys(inputs).map(input => ({ input, match: new RegExp(`^ref_${mediaType}_(\\d+)$`).exec(input) }))
      .filter((item): item is { input: string; match: RegExpExecArray } => !!item.match)
      .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
    for (let index = 0; index < Math.min(count, keys.length); index++) {
      if (!targets[index]) targets[index] = encodeMapping({ nodeId: "input_values", input: keys[index]!.input });
    }
  }
});

function createDraft() {
  return {
    id: "", label: "", type: "image" as MediaProviderModel["type"], enabled: true,
    imageMode: [] as string[], videoMode: [] as string[], mixedMode: [] as string[],
    mixedModeCount: { videoReference: 1, imageReference: 1, audioReference: 1 } as Record<string, number | undefined>,
    audio: "optional" as "optional" | boolean,
    durationResolutionMap: [{ duration: [] as string[], resolution: [] as string[] }],
  };
}

watch(visible, (isVisible) => {
  if (!isVisible) return;
  draft.value = createDraft();
  formError.value = "";
  original = JSON.parse(JSON.stringify(model ?? {}));
  // ACT: 旧文本模型的扩展字段按原值保留，不再提供专用配置。
  const { id, label, type, ...extra } = original;
  Object.assign(draft.value, { id: id ?? "", label: label ?? "", type: type ?? "image", enabled: extra.enabled !== false });
  if (draft.value.type === "image" || draft.value.type === "video") {
    const knownModes = draft.value.type === "image" ? imageModes : videoModes.filter(item => item.value !== "multiReference");
    const selectedModes = draft.value.type === "image" ? draft.value.imageMode : draft.value.videoMode;
    const remainingModes: unknown[] = [];
    for (const mode of Array.isArray(extra.mode) ? extra.mode : []) {
      if (knownModes.some(item => item.value === mode)) {
        selectedModes.push(mode as string);
        continue;
      }
      const references = Array.isArray(mode) ? mode.map(value => String(value).match(/^(videoReference|imageReference|audioReference):([1-9]\d*)$/)) : [];
      if (draft.value.type === "video" && !draft.value.mixedMode.length && references.length && references.every(item => item && Number.isSafeInteger(Number(item[2]))) && new Set(references.map(item => item?.[1])).size === references.length) {
        for (const match of references) {
          draft.value.mixedMode.push(match![1]!);
          draft.value.mixedModeCount[match![1]!] = Number(match![2]);
        }
        selectedModes.push("multiReference");
      } else remainingModes.push(mode);
    }
    if (remainingModes.length) extra.mode = remainingModes;
    else delete extra.mode;
  }
  if (draft.value.type === "video") {
    draft.value.audio = typeof extra.audio === "boolean" ? extra.audio : "optional";
    const isImportedU17 = extra.zealmanWorkflowId === u17WorkflowId;
    if (isImportedU17) draft.value.durationResolutionMap = [];
    else if (Array.isArray(extra.durationResolutionMap) && extra.durationResolutionMap.length) {
      draft.value.durationResolutionMap = extra.durationResolutionMap.map(row => ({
        duration: Array.isArray(row?.duration) ? row.duration.map(String) : [],
        resolution: Array.isArray(row?.resolution) ? row.resolution.map(String) : [],
      }));
    }
    delete extra.audio;
    delete extra.durationResolutionMap;
  }
  zealmanWorkflowId.value = typeof extra.zealmanWorkflowId === "string" ? extra.zealmanWorkflowId : "";
  if (zealmanWorkflowId.value === u17WorkflowId) delete extra.enabled;
  zealmanInputs.value = isRecord(extra.zealmanInputs) ? extra.zealmanInputs : undefined;
  workflowNodes.value = zealmanWorkflowId.value && zealmanInputs.value
    ? { input_values: { class_type: "ZealmanInputValues", inputs: zealmanInputs.value } }
    : isRecord(extra.comfyWorkflow) ? extra.comfyWorkflow as Record<string, ComfyNode> : undefined;
  const comfyMapping = isRecord(extra.comfyMapping) ? extra.comfyMapping as ComfyMapping : {};
  delete extra.resolutionParameterMappings;
  delete extra.durationResolutionMap;
  delete extra.comfyWorkflow;
  delete extra.comfyMapping;
  delete extra.zealmanWorkflowId;
  delete extra.zealmanInputs;
  mappingDraft.value = {
    prompt: encodeMapping(comfyMapping.prompt) || (zealmanInputs.value && Object.hasOwn(zealmanInputs.value, "prompt")
      ? encodeMapping({ nodeId: "input_values", input: "prompt" }) : ""), image: encodeMapping(comfyMapping.image),
    referenceImages: Array.isArray(comfyMapping.referenceImages) ? comfyMapping.referenceImages.map(encodeMapping) : [],
    referenceVideos: Array.isArray(comfyMapping.referenceVideos) ? comfyMapping.referenceVideos.map(encodeMapping) : [],
    referenceAudios: Array.isArray(comfyMapping.referenceAudios) ? comfyMapping.referenceAudios.map(encodeMapping) : [],
    firstFrame: encodeMapping(comfyMapping.firstFrame), lastFrame: encodeMapping(comfyMapping.lastFrame),
    width: encodeMapping(comfyMapping.width), height: encodeMapping(comfyMapping.height),
    resolution: encodeMapping(comfyMapping.resolution), aspectRatio: encodeMapping(comfyMapping.aspectRatio),
    megapixels: encodeMapping(comfyMapping.megapixels), multiple: encodeMapping(comfyMapping.multiple), upscale: encodeMapping(comfyMapping.upscale), duration: encodeMapping(comfyMapping.duration),
    fps: encodeMapping(comfyMapping.fps), durationUnit: comfyMapping.durationUnit === "seconds" ? "seconds" : comfyMapping.durationUnit === "frames" ? "frames" : zealmanWorkflowId.value ? "" : "frames",
    frameRate: typeof comfyMapping.frameRate === "number" && Number.isFinite(comfyMapping.frameRate) ? comfyMapping.frameRate : zealmanWorkflowId.value ? undefined : 24,
    outputNodeIds: Array.isArray(comfyMapping.outputNodeIds) ? comfyMapping.outputNodeIds.filter((item): item is string => typeof item === "string") : [],
  };
  u17FieldDrafts.value = zealmanWorkflowId.value === u17WorkflowId
    ? createU17FieldDrafts(zealmanInputs.value, comfyMapping, Array.isArray(extra.rules) ? extra.rules : []) : [];
  const durationInput = getMappingInput(comfyMapping.duration);
  const megapixelsInput = getMappingInput(comfyMapping.megapixels);
  const aspectRatioInput = getMappingInput(comfyMapping.aspectRatio);
  const upscaleInput = getMappingInput(comfyMapping.upscale);
  previewDuration.value = typeof zealmanInputs.value?.[durationInput ?? ""] === "number" ? zealmanInputs.value[durationInput!] as number : 5;
  previewMegapixels.value = typeof zealmanInputs.value?.[megapixelsInput ?? ""] === "number" ? zealmanInputs.value[megapixelsInput!] as number : 0.9;
  previewAspectRatio.value = typeof zealmanInputs.value?.[aspectRatioInput ?? ""] === "string" ? zealmanInputs.value[aspectRatioInput!] as string : "16:9 (Widescreen)";
  previewUpscale.value = typeof zealmanInputs.value?.[upscaleInput ?? ""] === "number" ? zealmanInputs.value[upscaleInput!] as number : 1;
  options.value = JSON.stringify(extra, null, 2);
  initialDraft = JSON.parse(JSON.stringify(draft.value));
  initialExtraMode = extra.mode;
}, { immediate: true });

function confirmModel() {
  formError.value = "";
  try {
    const id = draft.value.id.trim();
    const label = draft.value.label.trim();
    if (!label || !id) throw new Error("请填写显示名称和模型 ID");
    if (models.some(item => item !== model && item.id.trim() === id)) throw new Error(`模型 ID 已存在：${id}`);
    let extra: Record<string, unknown>;
    try { extra = JSON.parse(options.value); }
    catch { throw new Error("更多配置不是有效的 JSON"); }
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) throw new Error("更多配置必须是 JSON 对象");
    const fields = ["id", "label", "type", ...(draft.value.type === "video" ? ["audio", "durationResolutionMap"] : [])];
    if (fields.some(field => field in extra)) throw new Error("已有表单项请直接在上方编辑");
    const value: MediaProviderModel = { ...extra, id, label, type: draft.value.type };
    if (comfyUiMode && workflowNodes.value) {
      const comfyMapping: ComfyMapping = {
        durationUnit: mappingDraft.value.durationUnit || undefined,
        frameRate: mappingDraft.value.frameRate,
        outputNodeIds: [...mappingDraft.value.outputNodeIds],
      };
      for (const field of ["prompt", "image", "firstFrame", "lastFrame", "width", "height", "resolution", "aspectRatio", "megapixels", "multiple", "upscale", "duration", "fps"] as const) {
        const selected = resolveMapping(mappingDraft.value[field]);
        if (selected) comfyMapping[field] = selected;
      }
      if (zealmanWorkflowId.value) {
        for (const [reference, field, count] of [
          ["imageReference", "referenceImages", imageReferenceCount.value],
          ["videoReference", "referenceVideos", videoReferenceCount.value],
          ["audioReference", "referenceAudios", audioReferenceCount.value],
        ] as const) {
          const mappings = mappingDraft.value[field].map(resolveMapping);
          if (draft.value.videoMode.includes("multiReference") && draft.value.mixedMode.includes(reference)
            && mappings.slice(0, count).some(item => !item)) throw new Error(`请为全部${referenceModes.find(item => item.value === reference)?.label}选择工作流参数`);
          comfyMapping[field] = mappings.filter((item): item is ComfyInputMapping => !!item);
        }
      } else if (draft.value.type === "video" && draft.value.videoMode.includes("multiReference") && draft.value.mixedMode.includes("imageReference")) {
        comfyMapping.referenceImages = Array.from({ length: imageReferenceCount.value }, (_, index) => {
          const selected = resolveMapping(mappingDraft.value.referenceImages[index] ?? "");
          if (!selected) throw new Error(`请为参考图 ${index + 1} 选择工作流图片参数`);
          return selected;
        });
        const targets = comfyMapping.referenceImages.map(item => `${item.nodeId}::${item.input}`);
        if (new Set(targets).size !== targets.length) throw new Error("多图参考不能重复映射到同一工作流参数");
      } else if (mappingDraft.value.referenceImages.length) {
        comfyMapping.referenceImages = mappingDraft.value.referenceImages.map(resolveMapping).filter((item): item is ComfyInputMapping => !!item);
      }
      if (zealmanWorkflowId.value) {
        value.zealmanWorkflowId = zealmanWorkflowId.value;
        const inputValues = cloneWorkflowValues(zealmanInputs.value);
        if (isU17Workflow.value) {
          const fieldSettings: NonNullable<ComfyMapping["fieldSettings"]> = {};
          for (const item of u17FieldDrafts.value) {
            if (item.required && !item.input) throw new Error(`${item.businessName}缺少工作流字段映射`);
            const schemaValue = zealmanInputs.value?.[item.input];
            if (inferValueType(schemaValue) !== item.dataType) throw new Error(`${item.input} 的数据类型必须保持工作流定义的 ${inferValueType(schemaValue)}`);
            if (item.transform !== "identity") throw new Error(`${item.input} 当前工作流只支持原值映射`);
            const defaultValue = readDraftValue(item);
            inputValues[item.input] = defaultValue;
            const options = parseJsonArray(item.optionsText);
            fieldSettings[item.id] = { businessName: item.businessName, dataType: item.dataType, defaultValue,
              required: item.required, options, transform: item.transform };
          }
          if (Array.isArray(extra.rules)) for (const rule of extra.rules) {
            if (!isRecord(rule) || typeof rule.field !== "string") continue;
            const setting = fieldSettings[rule.field];
            if (!setting) continue;
            rule.value = setting.defaultValue;
            if (rule.field === "aspectRatio") rule.options = setting.options;
          }
          const durationInput = zealmanInputs.value && Object.hasOwn(zealmanInputs.value, "value") ? "value" : "seconds";
          const upscaleInput = zealmanInputs.value && Object.hasOwn(zealmanInputs.value, "value_2") ? "value_2" : "value";
          if (comfyMapping.prompt?.input !== "prompt" || comfyMapping.aspectRatio?.input !== "aspect_ratio"
            || comfyMapping.megapixels?.input !== "megapixels" || comfyMapping.duration?.input !== durationInput
            || comfyMapping.durationUnit !== "seconds" || comfyMapping.upscale?.input !== upscaleInput) throw new Error("U17 核心字段映射与当前 API 定义不一致");
          if (comfyMapping.referenceImages?.length !== 9 || comfyMapping.referenceImages.some((item, index) => item.input !== `ref_image_${index}`)
            || comfyMapping.referenceVideos?.[0]?.input !== "ref_video_0" || comfyMapping.referenceVideos?.length !== 1
            || comfyMapping.referenceAudios?.length !== 3 || comfyMapping.referenceAudios.some((item, index) => item.input !== `ref_audio_${index}`)) {
            throw new Error("U17 参考素材映射必须保持图 1～9、视频 1、音频 1～3 的原有顺序");
          }
          comfyMapping.fieldSettings = fieldSettings;
          delete value.durationResolutionMap;
          delete value.resolutionParameterMappings;
          value.enabled = draft.value.enabled;
        }
        value.zealmanInputs = inputValues;
      } else value.comfyWorkflow = workflowNodes.value;
      value.comfyMapping = comfyMapping;
      const hasZealmanPrompt = !!zealmanWorkflowId.value && !!zealmanInputs.value && Object.hasOwn(zealmanInputs.value, "prompt");
      if (zealmanWorkflowId.value) {
        const promptMapping = comfyMapping.prompt;
        const promptValue = promptMapping?.nodeId === "input_values" ? zealmanInputs.value?.[promptMapping.input] : undefined;
        if (!promptMapping || typeof promptValue !== "string") throw new Error("请为此工作流选择有效的文本提示词参数映射");
        if (zealmanWorkflowId.value === u17WorkflowId && (!hasZealmanPrompt || promptMapping.input !== "prompt")) {
          throw new Error("U17 工作流必须包含并映射 input_values.prompt");
        }
      } else {
        const promptMapping = comfyMapping.prompt;
        const promptValue = promptMapping && workflowNodes.value?.[promptMapping.nodeId]?.inputs[promptMapping.input];
        if (typeof promptValue !== "string") throw new Error("请为此工作流选择有效的文本提示词节点参数");
      }
      if (zealmanWorkflowId.value && comfyMapping.duration && !comfyMapping.durationUnit) throw new Error("请按实际工作流选择时长单位");
      if (zealmanWorkflowId.value && (comfyMapping.durationUnit === "frames" || comfyMapping.fps)
        && (!Number.isFinite(comfyMapping.frameRate) || !comfyMapping.frameRate || comfyMapping.frameRate <= 0)) throw new Error("请按实际工作流填写帧率");
    }
    const typeChanged = !model || value.type !== model.type;
    const changed = (...fields: (keyof typeof initialDraft)[]) => typeChanged || fields.some(field => JSON.stringify(draft.value[field]) !== JSON.stringify(initialDraft[field]));
    const modelFields = value.type === "image" ? ["mode"] : value.type === "video" ? ["mode", "audio", ...(isU17Workflow.value ? [] : ["durationResolutionMap"])] : [];
    if (!typeChanged) for (const field of modelFields) if (field in original) value[field] = original[field];
    const modeChanged = changed(value.type === "image" ? "imageMode" : "videoMode", "mixedMode", "mixedModeCount") || JSON.stringify(extra.mode) !== JSON.stringify(initialExtraMode);
    if ((value.type === "image" || value.type === "video") && modeChanged) {
      if (extra.mode !== undefined && !Array.isArray(extra.mode)) throw new Error("更多配置中的 mode 必须是数组");
      const modes: unknown[] = value.type === "image" ? [...draft.value.imageMode] : draft.value.videoMode.filter(mode => mode !== "multiReference");
      if (value.type === "video" && draft.value.videoMode.includes("multiReference")) {
        if (!draft.value.mixedMode.length) throw new Error("请选择混合参考的媒体类型");
        modes.push(draft.value.mixedMode.map(reference => {
          const count = draft.value.mixedModeCount[reference];
          if (!Number.isSafeInteger(count) || !count || count < 1) throw new Error("参考数量必须是正整数");
          return `${reference}:${count}`;
        }));
      }
      modes.push(...(extra.mode as unknown[] ?? []));
      if (!modes.length) throw new Error("请至少选择一种生成模式");
      value.mode = modes;
    }
    if (value.type === "video" && (changed("audio") || isU17Workflow.value)) value.audio = draft.value.audio;
    if (value.type === "video" && !isU17Workflow.value && changed("durationResolutionMap")) {
      if (!draft.value.durationResolutionMap.length) throw new Error("请至少添加一组时长与分辨率");
      value.durationResolutionMap = draft.value.durationResolutionMap.map((row, index) => {
        const duration = row.duration.map(Number);
        const resolution = row.resolution.map(value => /^\d{3,4}$/.test(value.trim()) ? `${value.trim()}p` : value.trim());
        if (!duration.length || duration.some(value => !Number.isFinite(value) || value <= 0)) throw new Error(`第 ${index + 1} 组时长必须是正数`);
        if (!resolution.length || resolution.some(value => !value)) throw new Error(`请填写第 ${index + 1} 组分辨率`);
        return { duration, resolution };
      });
    }
    if (value.type === "video" && comfyUiMode && Array.isArray(value.durationResolutionMap)) {
      value.durationResolutionMap = value.durationResolutionMap.map((row: { duration: number[]; resolution: string[] }) => ({ ...row,
        resolution: row.resolution.map((item: string) => /^\d{3,4}$/.test(item) ? `${item}p` : item) }));
    }
    emit("confirmed", value);
    visible.value = false;
  } catch (error) {
    formError.value = error instanceof Error ? error.message : "模型配置无效";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function encodeMapping(value: ComfyInputMapping | undefined) {
  return value ? `${encodeURIComponent(value.nodeId)}::${encodeURIComponent(value.input)}` : "";
}

function decodeMapping(value: string): ComfyInputMapping | undefined {
  const separator = value.indexOf("::");
  if (separator < 0) return;
  return { nodeId: decodeURIComponent(value.slice(0, separator)), input: decodeURIComponent(value.slice(separator + 2)) };
}
function resolveMapping(value: string): ComfyInputMapping | undefined {
  if (workflowInputOptions.value.some(option => option.value === value)) return decodeMapping(value);
  if (zealmanWorkflowId.value && zealmanInputs.value && Object.hasOwn(zealmanInputs.value, value)) {
    return { nodeId: "input_values", input: value };
  }
}
</script>

<style lang="scss" scoped>
.dialogContent {
  max-height: min(65dvh, calc(100dvh - 230px));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 8px;

  .el-select { width: 100%; }

  .comfyMappingHint { margin: -8px 0 14px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
  .frameMapping { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .u17BasicInfo, .u17PreviewControls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
  .u17CapabilityMap { display: grid; gap: 8px; width: 100%; }
  .capabilityPair { display: flex; align-items: center; gap: 12px; min-height: 38px; padding: 6px 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
  .u17FieldMappings { overflow-x: auto; width: 100%; padding-bottom: 4px; }
  .u17FieldHeader, .u17FieldRow { display: grid; grid-template-columns: minmax(110px, 1.1fr) minmax(125px, 1fr) minmax(105px, .8fr) minmax(145px, 1.2fr) 48px minmax(145px, 1.2fr) minmax(155px, 1.2fr); align-items: center; gap: 8px; min-width: 900px; }
  .u17FieldHeader { padding: 0 8px 6px; color: var(--el-text-color-secondary); font-size: 12px; }
  .u17FieldRow { padding: 7px 8px; border-top: 1px solid var(--el-border-color-lighter); }
  .u17FieldRow strong { font-size: 12px; }
  .u17ResolutionMap, .u17Preview { display: grid; gap: 10px; margin-top: 18px; padding: 14px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; }
  .u17Preview h4 { margin: 0; font-size: 14px; }
  .u17Preview pre { max-height: 300px; margin: 0; padding: 12px; overflow: auto; border-radius: 6px; background: var(--el-fill-color-light); font-size: 12px; line-height: 1.5; }

  .videoModes {
    width: 100%;

    .referenceModes {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 20px;
      margin-top: 8px;

      .referenceItem {
        display: flex;
        align-items: center;
        gap: 8px;

        .el-checkbox { margin-right: 0; }
        .el-input-number { width: 88px; }
      }
    }
  }

  .mappingEditor {
    width: 100%;

    .mappingHeader {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      padding: 0 44px 4px 26px;
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }

    .mappingRow {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) 16px minmax(0, 1fr) 32px;
      align-items: start;
      gap: 8px;
      margin-bottom: 8px;

      .rowIndex, > svg { margin-top: 8px; color: var(--el-text-color-secondary); }
      .el-button { width: 32px; padding: 0; }
    }

    .addMapping { width: 100%; margin-top: 4px; }
  }

  .modelOptions {
    summary { width: fit-content; margin-bottom: 12px; cursor: pointer; }
  }
}

.formError { margin-top: 12px; }
@media (max-width: 640px) { .dialogContent { .u17BasicInfo, .u17PreviewControls { grid-template-columns: minmax(0, 1fr); } } }
</style>
