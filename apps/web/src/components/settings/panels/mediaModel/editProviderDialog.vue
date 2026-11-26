<template>
  <el-dialog
    v-model="visible"
    :title="`编辑媒体供应商：${provider?.label ?? ''}`"
    width="min(800px, calc(100vw - 32px))"
    alignCenter
    appendToBody
    destroyOnClose
    :closeOnClickModal="false"
    :closeOnPressEscape="!saving"
    :showClose="!saving"
    @closed="formApi = undefined">
    <div class="providerEditor">
      <messageMarkdown v-if="provider?.readme" class="providerReadme" :content="provider.readme" />
      <form-create v-model="formValues" v-model:api="formApi" :rule="formRules" :option="formOptions" />
      <div v-if="provider?.id === 'autodlComfyUi'" class="comfyTools">
        <div class="comfyConnection">
          <el-button :loading="testingConnection" :disabled="saving || !formApi" @click="testConnection">连接测试</el-button>
          <el-text type="info" size="small">连接测试检查原生 ComfyUI 或 Zealman 工作流 API，不会提交生成任务。</el-text>
        </div>
        <div class="workflowHeading">
          <div>
            <h4>ComfyUI / Zealman 视频工作流</h4>
            <el-text type="info" size="small">导入 ComfyUI API JSON，或包含 workflow_id 与 input_values 的 Zealman JSON；在模型编辑中确认参数映射。</el-text>
          </div>
          <input ref="workflowInput" type="file" accept=".json,application/json" hidden :disabled="saving" @change="importComfyWorkflow" />
          <el-button :icon="IconPlus" size="small" :disabled="saving" @click="workflowInput?.click()">导入 API 工作流</el-button>
        </div>
        <el-alert title="支持原生 ComfyUI API JSON 和 Zealman workflow_id / input_values JSON；普通界面工作流 JSON 不能直接提交。单个文件最大 500 KB。" type="info" :closable="false" />
        <div v-if="comfyWorkflows.length" class="workflowList">
          <el-card v-for="item in comfyWorkflows" :key="item.id" shadow="never">
            <div class="workflowSummary">
              <div><strong>{{ item.label }}</strong><span>{{ item.zealmanWorkflowId ? `Zealman · ${Object.keys(item.zealmanInputs ?? {}).length} 个参数` : `${Object.keys(item.comfyWorkflow ?? {}).length} 个节点` }}</span></div>
              <el-button text size="small" :disabled="saving" @click="editModel(models.indexOf(item))">配置模型与映射</el-button>
            </div>
            <el-text type="info" size="small">{{ workflowMappingSummary(item) }}</el-text>
          </el-card>
        </div>
        <el-text v-else type="info" size="small">尚未导入工作流。</el-text>
      </div>
      <div class="modelHeader">
        <h4>模型配置 <el-text type="info">{{ models.length }}</el-text></h4>
        <el-button :icon="IconPlus" size="small" :disabled="saving" @click="editModel()">手动添加</el-button>
      </div>
      <div class="modelList">
        <el-card v-for="(item, index) in models" :key="index" class="modelCard" shadow="never">
          <div class="topInfo">
            <div class="modelNameWrap">
              <modelIcon :model="item.id" :size="24" />
              <div class="modelInfo">
                <span class="modelName">{{ item.label }}</span>
                <el-text class="modelId" type="info" size="small">{{ item.id }}</el-text>
              </div>
            </div>
            <div class="actionButtons">
              <el-button text size="small" :icon="IconPlayerPlay" :loading="loadingTestModel === index" :disabled="saving || loadingTestModel !== undefined || item.type === 'text'" :title="item.type === 'text' ? '此处支持图片、视频和音频模型测试' : undefined" :aria-label="`测试模型 ${item.label}`" @click="testModel(index)">测试</el-button>
              <el-button text size="small" :icon="IconEdit" :disabled="saving" :aria-label="`编辑模型 ${item.label}`" @click="editModel(index)">编辑</el-button>
              <el-button text size="small" type="danger" :icon="IconTrash" :disabled="saving" :aria-label="`删除模型 ${item.label}`" @click="models.splice(index, 1)">删除</el-button>
            </div>
          </div>
          <div class="modelTags">
            <el-tag size="small">{{ modelTypes[item.type] }}</el-tag>
            <el-tag v-if="item.zealmanWorkflowId === 'API-U17-9图1视频3音频V1-api'" size="small" :type="item.enabled === false ? 'danger' : 'success'">{{ item.enabled === false ? '已停用' : '已启用' }}</el-tag>
            <el-tag v-for="(tag, tagIndex) in modelTags(item)" :key="tagIndex" size="small" type="info">{{ tag }}</el-tag>
          </div>
        </el-card>
        <el-text v-if="!models.length" type="info">暂无模型</el-text>
      </div>
    </div>
    <el-alert v-if="formError" class="formError" :title="formError" type="error" :closable="false" showIcon />
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :icon="IconDeviceFloppy" :loading="saving" :disabled="!formApi" @click="saveModels">保存</el-button>
    </template>
    <component
      :is="modelEditorDialog"
      v-model="modelEditorVisible"
      :model="editingModelIndex === undefined ? undefined : models[editingModelIndex]"
      :models="models"
      :comfyUiMode="provider?.id === 'autodlComfyUi'"
      :providerId="provider?.id"
      :providerLabel="provider?.label"
      :providerVersion="provider?.version"
      @confirmed="confirmModel" />
  </el-dialog>
  <el-dialog v-model="testVisible" :title="`测试媒体模型：${testProvider?.label ?? ''}`" width="min(1120px, calc(100vw - 32px))" alignCenter appendToBody destroyOnClose :closeOnClickModal="false">
    <div class="modelTestBody">
      <providerTestPanel v-if="testVisible && testProvider" :source="testSource" :provider="testProvider" :config="testConfig" :modelId="testModelId" :models="testProvider.models" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { translate } from "@toonflow/i18n/vue";

import axios from "axios";
import { computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, toRaw, watch, type Component } from "vue";
import { IconPlus, IconTrash, IconDeviceFloppy, IconEdit, IconPlayerPlay } from "@tabler/icons-vue";
import { ElMessage } from "element-plus";
import formCreate, { type Api, type Options } from "@toonflow/provider-web/formCreate";
import { modelIcon } from "@toonflow/model-icons";
import messageMarkdown from "@/components/messageMarkdown.vue";
import type { MediaProvider, MediaProviderModel } from "@toonflow/provider-web/types";
import { settings, saveSettings } from "@/stores/settings";
import { invalidateNodeModels } from "@toonflow/nodes-scaffold/nodeAi";
import providerTestPanel from "./providerTestPanel.vue";

const { provider } = defineProps<{ provider?: MediaProvider }>();
const modelEditorDialog = shallowRef<Component>();
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ saved: [provider: MediaProvider] }>();
const models = ref<MediaProviderModel[]>([]);
const modelEditorVisible = ref(false);
const editingModelIndex = ref<number>();
const saving = ref(false);
const formApi = shallowRef<Api>();
const formRules = shallowRef<ReturnType<typeof formCreate.copyRules>>([]);
const formValues = ref<Record<string, unknown>>({});
const formOptions = computed<Options>(() => ({ form: { labelPosition: "top", disabled: saving.value }, appendValue: false, submitBtn: false, resetBtn: false }));
const revision = ref("");
const formError = ref("");
const testVisible = ref(false);
const loadingTestModel = ref<number>();
const testModelId = ref("");
const testProvider = shallowRef<MediaProvider>();
const testSource = ref("");
const testConfig = ref<Record<string, unknown>>({});
const testingConnection = ref(false);
const workflowInput = ref<HTMLInputElement>();
type ComfyMappingField = { nodeId: string; input: string };
type ComfyWorkflow = MediaProviderModel & {
  comfyWorkflow?: Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }>;
  zealmanWorkflowId?: string;
  zealmanInputs?: Record<string, unknown>;
  comfyMapping?: Record<string, unknown> & {
    prompt?: ComfyMappingField;
    image?: ComfyMappingField;
    referenceImages?: ComfyMappingField[];
    referenceVideos?: ComfyMappingField[];
    referenceAudios?: ComfyMappingField[];
    firstFrame?: ComfyMappingField;
    lastFrame?: ComfyMappingField;
    width?: ComfyMappingField;
    height?: ComfyMappingField;
    resolution?: ComfyMappingField;
    aspectRatio?: ComfyMappingField;
    megapixels?: ComfyMappingField;
    multiple?: ComfyMappingField;
    upscale?: ComfyMappingField;
    duration?: ComfyMappingField;
    fps?: ComfyMappingField;
    durationUnit?: "seconds" | "frames";
    frameRate?: number;
    outputNodeIds?: string[];
  };
};
const comfyWorkflows = computed(() => models.value.filter((item): item is ComfyWorkflow => !!item.comfyWorkflow || !!item.zealmanWorkflowId));
let testLoading: AbortController | undefined;
const modelTypes = { get image() { return translate("图片"); }, get video() { return translate("视频"); }, get audio() { return translate("音频"); }, get text() { return translate("文本"); } };
const modeLabels: Record<string, string> = {
  singleImage: "单图参考", multiReference: "多图参考", startEndRequired: "首尾帧必填",
  endFrameOptional: "尾帧可选", startFrameOptional: "首帧可选",
  imageReference: "图片参考", videoReference: "视频参考", audioReference: "音频参考",
};

watch(visible, isVisible => {
  testLoading?.abort();
  testLoading = undefined;
  loadingTestModel.value = undefined;
  testVisible.value = false;
  if (!isVisible) return;
  formError.value = "";
  modelEditorVisible.value = false;
  editingModelIndex.value = undefined;
  const configs = settings.value.mediaProviderConfigs as Record<string, Record<string, unknown>> | undefined;
  formRules.value = formCreate.copyRules(provider?.rules ?? []);
  formValues.value = structuredClone(toRaw((provider && configs?.[provider.id]) ?? {}));
  revision.value = provider?.revision ?? "";
  models.value = JSON.parse(JSON.stringify(provider?.models ?? []));
}, { immediate: true });
onBeforeUnmount(() => testLoading?.abort());

async function testModel(index: number) {
  const model = models.value[index];
  if (saving.value || loadingTestModel.value !== undefined || !provider || !model || model.type === "text") return;
  const controller = new AbortController();
  testLoading = controller;
  loadingTestModel.value = index;
  formError.value = "";
  try {
    const currentProvider = { ...provider, models: JSON.parse(JSON.stringify(models.value)) as MediaProviderModel[] };
    const currentRevision = revision.value;
    const config = structuredClone(toRaw(formApi.value?.formData() ?? formValues.value));
    const modelId = model.id;
    const { data } = await axios.get<{ code: number; data: { source: string; revision: string }; message?: string }>("/api/providers/media/source", {
      params: { fileName: currentProvider.fileName }, headers: { "x-toonflow-workspace": "1" }, signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    if (data.code !== 200 || !data.data) throw new Error(data.message || "读取供应商代码失败");
    if (data.data.revision !== currentRevision) throw new Error("供应商代码已更新，请重新打开编辑窗口后测试");
    testSource.value = data.data.source;
    testProvider.value = currentProvider;
    testConfig.value = config;
    testModelId.value = modelId;
    testVisible.value = true;
  } catch (error) {
    if (!controller.signal.aborted) formError.value = axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "读取供应商代码失败";
  } finally {
    if (testLoading === controller) { testLoading = undefined; loadingTestModel.value = undefined; }
  }
}

async function testConnection() {
  if (!provider || provider.id !== "autodlComfyUi" || testingConnection.value || !formApi.value) return;
  testingConnection.value = true;
  try {
    const { data } = await axios.post<{ code: number; data?: { message?: string }; message?: string }>("/api/providers/media/testConnection", {
      fileName: provider.fileName,
      revision: revision.value,
      config: structuredClone(toRaw(formApi.value.formData())),
    }, { headers: { "x-toonflow-workspace": "1" }, timeout: 15000 });
    if (data.code !== 200) throw new Error(data.message || "连接测试失败");
    ElMessage.success(data.data?.message || "连接成功");
  } catch (error) {
    ElMessage.error(axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "连接测试失败");
  } finally { testingConnection.value = false; }
}

async function importComfyWorkflow(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    if (file.size > 500 * 1024) throw new Error("单个工作流文件不能超过 500 KB");
    const source: unknown = JSON.parse(await file.text());
    const rawWorkflow = source && typeof source === "object" && !Array.isArray(source) ? source as Record<string, unknown> : undefined;
    if (typeof rawWorkflow?.workflow_id === "string" && rawWorkflow.workflow_id.trim()) {
      const inputValues = rawWorkflow.input_values && typeof rawWorkflow.input_values === "object" && !Array.isArray(rawWorkflow.input_values)
        ? rawWorkflow.input_values as Record<string, unknown> : undefined;
      if (!inputValues || !Object.keys(inputValues).length) {
        throw new Error("Zealman JSON 需要包含非空 input_values 参数对象");
      }
      const workflowId = rawWorkflow.workflow_id.trim();
      const label = file.name.replace(/\.json$/i, "").trim() || workflowId;
      const referenceMappings = Object.fromEntries((["image", "video", "audio"] as const).flatMap(mediaType => {
        const references = Object.keys(inputValues)
          .map(inputName => ({ inputName, match: new RegExp(`^ref_${mediaType}_(\\d+)$`).exec(inputName) }))
          .filter((item): item is { inputName: string; match: RegExpExecArray } => !!item.match)
          .sort((left, right) => Number(left.match[1]) - Number(right.match[1]))
          .slice(0, workflowId === "API-U17-9图1视频3音频V1-api" ? { image: 9, video: 1, audio: 3 }[mediaType] : undefined)
          .map(item => ({ nodeId: "input_values", input: item.inputName }));
        return references.length ? [[`reference${mediaType[0]!.toUpperCase()}${mediaType.slice(1)}s`, references]] : [];
      })) as NonNullable<ComfyWorkflow["comfyMapping"]>;
      const mode: (string | string[])[] = ["text"];
      const references = [
        { mediaType: "image", count: referenceMappings.referenceImages?.length },
        { mediaType: "video", count: referenceMappings.referenceVideos?.length },
        { mediaType: "audio", count: referenceMappings.referenceAudios?.length },
      ].filter((item): item is { mediaType: string; count: number } => typeof item.count === "number" && item.count > 0);
      if (references.length) mode.push(references.map(({ mediaType, count }) => `${mediaType}Reference:${count}`));
      const comfyMapping = { ...referenceMappings };
      if (Object.hasOwn(inputValues, "prompt")) comfyMapping.prompt = { nodeId: "input_values", input: "prompt" };
      let modelRules: Record<string, unknown>[] | undefined;
      if (workflowId === "API-U17-9图1视频3音频V1-api") {
        if (typeof inputValues.value_2 === "number") inputValues.value_2 = 1;
        const mapping = (input: string) => Object.hasOwn(inputValues, input) ? { nodeId: "input_values", input } : undefined;
        comfyMapping.aspectRatio = mapping("aspect_ratio");
        comfyMapping.megapixels = mapping("megapixels");
        comfyMapping.multiple = mapping("multiple");
        comfyMapping.duration = mapping("value") ?? mapping("seconds");
        comfyMapping.durationUnit = "seconds";
        comfyMapping.upscale = mapping("value_2") ?? (comfyMapping.duration?.input === "seconds" ? mapping("value") : undefined);
        comfyMapping.fps = mapping("fps");
        if (comfyMapping.fps) comfyMapping.frameRate = 24;
        const aspectRatio = ["1:1 (Square)", "2:3 (Portrait Photo)", "3:2 (Photo)", "3:4 (Portrait Standard)", "4:3 (Standard)", "9:16 (Portrait Widescreen)", "16:9 (Widescreen)", "21:9 (Ultrawide)"];
        modelRules = [
          ...(comfyMapping.aspectRatio ? [{ type: "select", field: "aspectRatio", title: "画幅比例", value: aspectRatio.includes(String(inputValues.aspect_ratio)) ? inputValues.aspect_ratio : "16:9 (Widescreen)", options: aspectRatio.map(value => ({ label: value, value })) }] : []),
          ...(comfyMapping.megapixels && typeof inputValues.megapixels === "number" ? [{ type: "inputNumber", field: "megapixels", title: "生成像素量（megapixels）", value: inputValues.megapixels, props: { step: 0.1 } }] : []),
          ...(comfyMapping.upscale && typeof inputValues[comfyMapping.upscale.input] === "number" ? [{ type: "inputNumber", field: "upscale", title: "放大倍率", value: inputValues[comfyMapping.upscale.input], props: { step: 0.1 } }] : []),
        ];
      }
      models.value.push({ id: `workflow${Date.now().toString(36)}`, label, type: "video", mode, audio: workflowId === "API-U17-9图1视频3音频V1-api" ? "optional" : undefined,
        ...(modelRules ? { rules: modelRules } : {}), ...(workflowId === "API-U17-9图1视频3音频V1-api" ? { enabled: true } : {}),
        zealmanWorkflowId: workflowId, zealmanInputs: inputValues, comfyMapping,
      });
      ElMessage.success("Zealman 工作流已导入，请核对参考素材、提示词及参数映射后保存");
      editModel(models.value.length - 1);
      return;
    }
    if (!rawWorkflow || !Object.keys(rawWorkflow).length || Object.keys(rawWorkflow).length > 5000 || Array.isArray(rawWorkflow.nodes) || "links" in rawWorkflow) {
      throw new Error("这不是 ComfyUI API 格式工作流；请从 ComfyUI 导出（API）JSON");
    }
    const workflow: NonNullable<ComfyWorkflow["comfyWorkflow"]> = {};
    for (const [nodeId, value] of Object.entries(rawWorkflow)) {
      const node = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
      const inputs = node?.inputs && typeof node.inputs === "object" && !Array.isArray(node.inputs) ? node.inputs as Record<string, unknown> : undefined;
      if (!/^\d+$/.test(nodeId) || typeof node?.class_type !== "string" || !node.class_type || !inputs) throw new Error(`节点 ${nodeId} 不是有效的 API 节点`);
      const meta = node._meta && typeof node._meta === "object" && !Array.isArray(node._meta) ? node._meta as Record<string, unknown> : undefined;
      workflow[nodeId] = { class_type: node.class_type, inputs, ...(typeof meta?.title === "string" ? { _meta: { title: meta.title } } : {}) };
    }
    const id = `workflow${Date.now().toString(36)}`;
    const label = file.name.replace(/\.json$/i, "").trim() || "ComfyUI 工作流";
    const comfyMapping = inferComfyMapping(workflow);
    const mode = ["text"];
    if (comfyMapping.image) mode.push("singleImage");
    if (comfyMapping.firstFrame && comfyMapping.lastFrame) mode.push("startEndRequired");
    models.value.push({
      id, label, type: "video", mode,
      durationResolutionMap: [{ duration: [5], resolution: ["720p"] }],
      comfyWorkflow: workflow,
      comfyMapping,
    });
    ElMessage.success("API 工作流已导入，请配置模型和节点映射后保存");
    editModel(models.value.length - 1);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "导入工作流失败");
  }
}

function inferComfyMapping(workflow: NonNullable<ComfyWorkflow["comfyWorkflow"]>) {
  const inputs = Object.entries(workflow).flatMap(([nodeId, node]) => Object.entries(node.inputs)
    .filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))
    .map(([input, value]) => ({ nodeId, input, value, classType: node.class_type.toLowerCase(), title: node._meta?.title?.toLowerCase() ?? "" })));
  const find = (predicate: (item: typeof inputs[number]) => boolean) => {
    const item = inputs.find(predicate);
    return item ? { nodeId: item.nodeId, input: item.input } : undefined;
  };
  const mapping = {
    prompt: find(item => /text|prompt|positive/.test(item.input.toLowerCase()) && /clip|textencode|prompt/i.test(item.classType)),
    image: find(item => item.input === "image" && /loadimage/i.test(item.classType)),
    firstFrame: find(item => item.input === "image" && /loadimage/i.test(item.classType) && /first|start|首帧/i.test(item.title)),
    lastFrame: find(item => item.input === "image" && /loadimage/i.test(item.classType) && /last|end|尾帧/i.test(item.title)),
    width: find(item => item.input.toLowerCase() === "width"),
    height: find(item => item.input.toLowerCase() === "height"),
    resolution: find(item => item.input.toLowerCase() === "resolution"),
    duration: find(item => /^(duration|length|num_frames|frames|total_frames)$/i.test(item.input)),
    fps: find(item => /^(fps|frame_rate|framerate)$/i.test(item.input)),
    durationUnit: "frames" as const,
    frameRate: 24,
    outputNodeIds: Object.entries(workflow).filter(([, node]) => /savevideo|videocombine|video.*combine/i.test(node.class_type)).map(([nodeId]) => nodeId),
  };
  if (mapping.duration && !/frame|length/i.test(mapping.duration.input)) mapping.durationUnit = "seconds" as typeof mapping.durationUnit;
  return Object.fromEntries(Object.entries(mapping).filter(([, value]) => value !== undefined));
}

function workflowMappingSummary(model: ComfyWorkflow) {
  const mapping = model.comfyMapping ?? {};
  const mapped = [
    ["提示词", mapping.prompt], ["参考图", mapping.image || mapping.referenceImages?.length || mapping.firstFrame || mapping.lastFrame],
    ["参考视频", mapping.referenceVideos?.length], ["参考音频", mapping.referenceAudios?.length],
    ["尺寸", mapping.width || mapping.height || mapping.resolution], ["画幅", mapping.aspectRatio],
    ["像素量", mapping.megapixels], ["放大倍率", mapping.upscale], ["时长", mapping.duration],
    ["输出", model.zealmanWorkflowId ? "Zealman 结果视频" : mapping.outputNodeIds?.length ? mapping.outputNodeIds.join("、") : undefined],
  ].map(([label, value]) => `${label}${value ? "✓" : "—"}`);
  return mapped.join(" · ");
}

function modelTags(model: MediaProviderModel) {
  const modes = Array.isArray(model.mode) ? model.mode.flat().filter((mode): mode is string => typeof mode === "string") : [];
  return modes.map(mode => {
    if (mode === "text") return model.type === "image" ? translate("文生图") : translate("文生视频");
    const reference = /^(imageReference|videoReference|audioReference):(\d+)$/.exec(mode);
    return reference ? `${modeLabels[reference[1]!]} ×${reference[2]}` : modeLabels[mode] ?? mode;
  });
}

function editModel(index?: number) {
  modelEditorDialog.value ??= defineAsyncComponent(() => import("@toonflow/provider-web/modelEditor"));
  editingModelIndex.value = index;
  modelEditorVisible.value = true;
}

function confirmModel(model: MediaProviderModel) {
  const index = editingModelIndex.value;
  if (index === undefined) models.value.push(model);
  else models.value.splice(index, 1, model);
}

async function saveModels() {
  if (saving.value || !provider || !formApi.value) return;
  const { id: providerId, fileName } = provider;
  formError.value = "";
  let modelsSaved = false;
  let configSaved = false;
  saving.value = true;
  try {
    if (!(await formApi.value.validate().then(() => true, () => false))) return;
    const config = formApi.value.formData();
    if ("apiKey" in config) {
      config.apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
      if ((config.apiKey as string).length > 8192) throw new Error("API Key 过长");
    }
    const ids = new Set<string>();
    const values = models.value.map((item, index) => {
      const id = item.id.trim();
      const label = item.label.trim();
      if (!id || !label) throw new Error(`请填写第 ${index + 1} 个模型的 ID 和显示名称`);
      if (ids.has(id)) throw new Error(`模型 ID 重复：${id}`);
      ids.add(id);
      return { ...item, id, label };
    });
    const { data } = await axios.put<{ code: number; data: MediaProvider; message?: string }>("/api/providers/media/save", {
      fileName, revision: revision.value, models: values,
    });
    if (data.code !== 200 || !data.data) throw new Error(data.message || "保存模型失败");
    revision.value = data.data.revision;
    modelsSaved = true;
    invalidateNodeModels("media");
    await saveSettings(settings => {
      const configs = settings.mediaProviderConfigs as Record<string, Record<string, unknown>> | undefined;
      if (configs !== undefined && (!configs || typeof configs !== "object" || Array.isArray(configs))) throw new Error("媒体供应商配置格式无效");
      const current = configs?.[providerId];
      if (current !== undefined && (!current || typeof current !== "object" || Array.isArray(current))) throw new Error("当前供应商配置格式无效");
      if (Object.entries(config).every(([field, value]) => JSON.stringify(value) === JSON.stringify(current?.[field]))) return;
      return { mediaProviderConfigs: { ...configs, [providerId]: { ...current, ...config } } };
    });
    configSaved = true;
    const response = await axios.get<{ code: number; data: MediaProvider[]; message?: string }>("/api/providers/media/list");
    if (response.data.code !== 200 || !Array.isArray(response.data.data)) throw new Error(response.data.message || "读取最新模型失败");
    const latest = response.data.data.find(item => item.fileName === fileName);
    if (!latest) throw new Error("供应商已不存在");
    revision.value = latest.revision;
    emit("saved", latest);
    visible.value = false;
  } catch (error) {
    const message = axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : translate("保存失败，请重试");
    formError.value = configSaved ? `模型与连接配置已保存，读取最新模型失败：${message}。请重新打开编辑。`
      : modelsSaved ? `模型已保存，连接配置未保存：${message}。填写内容已保留，请重试。` : message;
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.providerEditor {
  max-height: 65dvh;
  padding: 8px 4px;
  overflow-y: auto;
  overscroll-behavior: contain;

  .providerReadme { margin-bottom: 20px; }

  .comfyTools {
    display: grid;
    gap: 12px;
    margin: 14px 0 20px;
    padding: 14px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    background: var(--el-fill-color-extra-light);

    .comfyConnection, .workflowHeading, .workflowSummary { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .comfyConnection { justify-content: flex-start; }
    .workflowHeading h4 { margin: 0 0 4px; font-size: 14px; }
    .workflowList { display: grid; gap: 8px; }
    .workflowSummary > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; min-width: 0; }
    .workflowSummary span { color: var(--el-text-color-secondary); font-size: 12px; }
  }

  .modelHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;

    h4 { margin: 0; }
  }

  .modelList {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .modelCard {
      .topInfo {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;

        .modelNameWrap {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;

          .modelInfo {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
            overflow-wrap: anywhere;

            .modelName { font-size: 15px; font-weight: 600; }
            .modelId { align-self: flex-start; }
          }
        }

        .actionButtons {
          display: flex;
          flex-shrink: 0;
          margin-left: auto;
        }
      }

      .modelTags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 16px;
      }
    }
  }
}

.formError { margin-top: 16px; }
.modelTestBody { height: min(660px, calc(100dvh - 160px)); min-height: 0; }
</style>
