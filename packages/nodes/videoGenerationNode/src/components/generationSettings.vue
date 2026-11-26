<template>
  <el-popover v-model:visible="settingsVisible" trigger="click" placement="top-start" width="min(340px, calc(100vw - 24px))" :disabled="disabled" :showArrow="false" :popperStyle="{ padding: '14px' }">
    <template #reference>
      <el-button class="settingsButton" text size="small" :disabled="disabled" :aria-expanded="settingsVisible" aria-label="视频生成设置">
        <span class="ratioShape" :style="ratioStyle(displayRatio)" aria-hidden="true" />
        <span>{{ [displayRatio, isU17Model ? `${u17Megapixels}MP` : resolution, duration ? `${duration}秒` : ''].filter(Boolean).join(' · ') }}</span>
        <component :is="settingsVisible ? IconChevronDown : IconChevronUp" :size="14" aria-hidden="true" />
      </el-button>
    </template>
    <div class="generationSettings nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop @wheel.stop>
      <div v-if="modes.length" class="sectionLabel">生成模式</div>
      <el-select v-if="modes.length" v-model="mode" :disabled="disabled" :teleported="false" aria-label="视频生成模式">
        <el-option v-for="item in modes" :key="item.value" :value="item.value" :label="item.label" />
      </el-select>
      <div v-if="isU17Model" class="outputOptions">
        <div class="outputField">
          <div class="sectionLabel">视频时长（秒）</div>
          <el-input-number v-model="duration" :disabled="disabled" :min="5" :max="15" :step="1" :precision="0" controlsPosition="right" aria-label="视频时长（秒）" />
        </div>
        <div class="outputField">
          <div class="sectionLabel">megapixels</div>
          <el-input-number v-model="u17Megapixels" :disabled="disabled" :step="0.1" controlsPosition="right" aria-label="megapixels" />
        </div>
      </div>
      <div v-else-if="durations.length || resolutions.length" class="outputOptions">
        <div v-if="durations.length" class="outputField">
          <div class="sectionLabel">视频时长</div>
          <el-select v-model="duration" :disabled="disabled" :teleported="false" aria-label="视频时长">
            <el-option v-for="item in durations" :key="item" :value="item" :label="`${item}秒`" />
          </el-select>
        </div>
        <div v-if="resolutions.length" class="outputField">
          <div class="sectionLabel">分辨率</div>
          <el-select v-model="resolution" :disabled="disabled" :teleported="false" aria-label="视频分辨率">
            <el-option v-for="item in resolutions" :key="item" :value="item" :label="item" />
          </el-select>
        </div>
      </div>
      <div v-if="model?.audio === 'optional'" class="audioOption">
        <span class="sectionLabel">生成音频</span>
        <el-switch v-model="generateAudio" :disabled="disabled" aria-label="生成音频" />
      </div>
      <div v-if="isU17Model" class="ratioSection">
        <div class="sectionLabel">画幅比例</div>
        <el-select v-model="u17AspectRatio" :disabled="disabled" :teleported="false" aria-label="画幅比例">
          <el-option v-for="item in u17RatioOptions" :key="item.value" :value="item.value" :label="item.label" />
        </el-select>
      </div>
      <div v-else class="ratioSection">
        <div v-if="!hasModelAspectRatio" class="sectionLabel">画幅比例</div>
        <modelForm v-if="hasModelAspectRatio" v-model="other" :rules="aspectRatioRules" :disabled="disabled" />
        <div v-else class="ratioOptions" role="group" aria-label="视频比例">
          <el-button v-for="item in ratios" :key="item" class="ratioButton" :disabled="disabled" :aria-label="`比例 ${item}`" :aria-pressed="ratio === item" @click="ratio = item">
            <span class="ratioContent">
              <span class="ratioShape" :style="ratioStyle(item)" aria-hidden="true" />
              <span>{{ item }}</span>
            </span>
          </el-button>
        </div>
      </div>
      <details v-if="advancedRules.length || isU17Model" class="advancedSettings">
        <summary>高级设置</summary>
        <div v-if="isU17Model" class="upscaleOptions">
          <div class="sectionLabel">放大倍率</div>
          <el-input-number v-model="u17Upscale" :disabled="disabled" :step="0.1" controlsPosition="right" aria-label="放大倍率" />
        </div>
        <modelForm v-if="advancedRules.length" v-model="other" :rules="advancedRules" :disabled="disabled" />
      </details>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElInputNumber, ElPopover, ElSelect, ElOption, ElSwitch } from "element-plus";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-vue";
import type { NodeMediaModel } from "@toonflow/nodes-scaffold/runtime";
import modelForm from "@toonflow/node-shared/modelForm";

const props = defineProps<{ model?: NodeMediaModel; disabled?: boolean; ratios: string[] }>();
const settingsVisible = ref(false);
const duration = defineModel<number | undefined>("duration", { required: true });
const resolution = defineModel<string>("resolution", { required: true });
const ratio = defineModel<string>("ratio", { required: true });
const mode = defineModel<string>("mode", { required: true });
const generateAudio = defineModel<boolean>("generateAudio", { required: true });
const other = defineModel<Record<string, unknown>>("other", { required: true });
const hasModelAspectRatio = computed(() => props.model?.providerId === "autodlComfyUi" && (props.model.rules?.some(item => item.field === "aspectRatio") ?? false));
const aspectRatioRules = computed(() => props.model?.rules?.filter(item => item.field === "aspectRatio") ?? []);
const isU17Model = computed(() => props.model?.providerId === "autodlComfyUi" && props.model.workflowId === "API-U17-9图1视频3音频V1-api");
const aspectRatioRule = computed(() => props.model?.rules?.find(item => item.field === "aspectRatio"));
const u17RatioOptions = computed(() => Array.isArray(aspectRatioRule.value?.options) ? aspectRatioRule.value.options.flatMap(item => {
  if (!item || typeof item !== "object") return [];
  const option = item as { value?: unknown; label?: unknown };
  return typeof option.value === "string" ? [{ value: option.value, label: typeof option.label === "string" ? option.label : option.value }] : [];
}) : []);
const u17DefaultRatio = computed(() => typeof aspectRatioRule.value?.value === "string" ? aspectRatioRule.value.value : u17RatioOptions.value[0]?.value ?? "");
const u17AspectRatio = computed({
  get: () => Object.hasOwn(other.value, "aspectRatio") ? typeof other.value.aspectRatio === "string" ? other.value.aspectRatio : "" : u17DefaultRatio.value,
  set: value => { other.value = { ...other.value, aspectRatio: value }; },
});
function getU17Number(field: "megapixels" | "upscale", fallback: number) {
  const value = other.value[field];
  if (Object.hasOwn(other.value, field)) return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const ruleValue = props.model?.rules?.find(item => item.field === field)?.value;
  return typeof ruleValue === "number" && Number.isFinite(ruleValue) ? ruleValue : fallback;
}
const u17Megapixels = computed({
  get: () => getU17Number("megapixels", 0.9),
  set: value => { other.value = { ...other.value, megapixels: value }; },
});
const u17Upscale = computed({
  get: () => getU17Number("upscale", 1),
  set: value => { other.value = { ...other.value, upscale: value }; },
});
const advancedRules = computed(() => props.model?.rules?.filter(item => item.field !== "megapixels" && item.field !== "aspectRatio" && (!isU17Model.value || item.field !== "upscale")) ?? []);
const displayRatio = computed(() => {
  const value = isU17Model.value ? u17AspectRatio.value : hasModelAspectRatio.value && typeof other.value.aspectRatio === "string" && other.value.aspectRatio ? other.value.aspectRatio : ratio.value;
  return /^\d+(?:\.\d+)?:\d+(?:\.\d+)?/.exec(value)?.[0] ?? value;
});
const modeLabels: Record<string, string> = {
  text: "文生视频", singleImage: "单图参考", startEndRequired: "首尾帧必填", endFrameOptional: "尾帧可选", startFrameOptional: "首帧可选",
};
const modes = computed(() => (props.model?.mode ?? []).map(item => ({
  value: JSON.stringify(item),
  label: Array.isArray(item) ? "混合参考" : modeLabels[item] ?? item,
})));
const mappings = computed(() => props.model?.durationResolutionMap ?? []);
const durations = computed(() => [...new Set(mappings.value.flatMap(item => item.duration))]
  .filter(value => resolutionsFor(value).length > 0).sort((a, b) => a - b));
const resolutions = computed(() => resolutionsFor(duration.value));

function resolutionsFor(value: number | undefined) {
  return [...new Set(mappings.value.filter(item => value !== undefined && item.duration.includes(value)).flatMap(item => item.resolution))];
}

function ratioStyle(value: string) {
  const [, widthValue, heightValue] = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/.exec(value) ?? [];
  const width = Number(widthValue) || 1;
  const height = Number(heightValue) || 1;
  return { width: `${16 * Math.min(width / height, 1)}px`, height: `${16 * Math.min(height / width, 1)}px` };
}
</script>

<style scoped lang="scss">
.ratioShape {
  display: inline-block;
  flex-shrink: 0;
  border: 1px solid currentColor;
  border-radius: 2px;
  box-sizing: border-box;
}

.settingsButton {
  flex-shrink: 0;
  :deep(> span) { gap: 6px; }
}

.generationSettings {
  text-align: left;

  .sectionLabel {
    margin-bottom: 8px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
    font-weight: 500;
  }

  > .el-select { margin-bottom: 14px; }

  .outputOptions {
    display: flex;
    gap: 12px;
    margin-bottom: 14px;
    .outputField { flex: 1; min-width: 0; }
  }

  .ratioOptions {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;

    .ratioButton {
      height: 60px;
      margin: 0;
      padding: 8px 4px;
      color: var(--el-text-color-secondary);
      --el-button-bg-color: var(--el-fill-color-light);
      --el-button-hover-bg-color: var(--el-fill-color);
      --el-button-hover-text-color: var(--el-text-color-primary);
      --el-button-hover-border-color: var(--el-border-color-darker);

      &[aria-pressed="true"] {
        color: var(--el-text-color-primary);
        border-color: var(--el-text-color-regular);
        background: var(--el-fill-color);
      }

      .ratioContent {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        font-size: 12px;
      }
    }
  }

  .audioOption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    .sectionLabel { margin: 0; }
  }

  .advancedSettings {
    summary { width: fit-content; padding-block: 8px; color: var(--el-text-color-regular); cursor: pointer; }
  }
}
</style>
