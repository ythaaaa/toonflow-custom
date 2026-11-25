<template>
  <el-popover v-model:visible="settingsVisible" trigger="click" placement="top-start" width="min(340px, calc(100vw - 24px))" :disabled="props.disabled" :showArrow="false" :popperStyle="{ padding: '14px' }">
    <template #reference>
      <el-button class="settingsButton" text size="small" :disabled="props.disabled" :aria-expanded="settingsVisible" aria-label="图片生成设置">
        <span v-if="props.ratios.length" class="ratioShape" :class="{ automatic: ratio === 'auto' }" :style="ratioStyle(ratio)" aria-hidden="true" />
        <span>{{ props.ratios.length ? `${ratioLabel(ratio)} · ` : "" }}{{ sizeLabel(size) }} · 1张</span>
        <component :is="settingsVisible ? IconChevronDown : IconChevronUp" :size="14" aria-hidden="true" />
      </el-button>
    </template>
    <div class="generationSettings nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop @wheel.stop>
      <template v-if="isGptImageModel">
        <div class="sectionLabel">画幅比例</div>
        <div class="ratioOptions gptImageRatios" role="group" aria-label="画幅比例">
          <el-button
            v-for="item in props.ratios"
            :key="item"
            class="ratioButton"
            :disabled="props.disabled"
            :aria-label="`画幅比例 ${ratioLabel(item)}`"
            :aria-pressed="ratio === item"
            @click="ratio = item">
            <span class="ratioContent">
              <span class="ratioShape" :class="{ automatic: item === 'auto' }" :style="ratioStyle(item)" aria-hidden="true" />
              <span>{{ ratioLabel(item) }}</span>
            </span>
          </el-button>
        </div>
      </template>
      <div class="sectionLabel">分辨率</div>
      <el-radio-group v-model="size" class="sizeOptions" :class="{ gptImageSizes: isGptImageModel }" :disabled="props.disabled" aria-label="图片分辨率">
        <el-radio-button v-for="item in props.sizes" :key="item" :value="item">{{ sizeLabel(item) }}</el-radio-button>
      </el-radio-group>
      <template v-if="!isGptImageModel && props.ratios.length">
        <div class="sectionLabel">比例</div>
        <div class="ratioOptions" role="group" aria-label="图片比例">
          <el-button
            v-for="item in props.ratios"
            :key="item"
            class="ratioButton"
            :disabled="props.disabled"
            :aria-label="`比例 ${item}`"
            :aria-pressed="ratio === item"
            @click="ratio = item">
            <span class="ratioContent">
              <span class="ratioShape" :class="{ automatic: item === 'auto' }" :style="ratioStyle(item)" aria-hidden="true" />
              <span>{{ item }}</span>
            </span>
          </el-button>
        </div>
      </template>
      <modelForm v-model="other" :rules="props.model?.rules" :disabled="props.disabled" />
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElPopover, ElRadioGroup, ElRadioButton } from "element-plus";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-vue";
import type { NodeMediaModel } from "@toonflow/nodes-scaffold/runtime";
import modelForm from "./modelForm.vue";

const props = defineProps<{ sizes: string[]; ratios: string[]; model?: NodeMediaModel; disabled?: boolean }>();
const isGptImageModel = computed(() => {
  const model = props.model;
  return model?.providerId === "gptImageSubscription"
    && ["gpt-image-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"].includes(model.modelId);
});
const settingsVisible = ref(false);
const size = defineModel<string>("size", { required: true });
const ratio = defineModel<string>("ratio", { required: true });
const other = defineModel<Record<string, unknown>>("other", { required: true });

function ratioStyle(value: string) {
  if (value === "auto") return { width: "16px", height: "16px" };
  const [width = 1, height = 1] = value.split(":").map(Number);
  return { width: `${16 * Math.min(width / height, 1)}px`, height: `${16 * Math.min(height / width, 1)}px` };
}

function ratioLabel(value: string) {
  return value === "auto" ? "自动" : value;
}

function sizeLabel(value: string) {
  return value === "auto" ? "自动" : value;
}
</script>

<style scoped lang="scss">
.ratioShape {
  display: inline-block;
  flex-shrink: 0;
  border: 1px solid currentColor;
  border-radius: 2px;
  box-sizing: border-box;

  &.automatic {
    position: relative;
    border-style: dashed;

    &::after {
      position: absolute;
      inset: 2px 0 0;
      content: "A";
      font-size: 8px;
      line-height: 10px;
      text-align: center;
    }
  }
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

  .sizeOptions {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
    .el-radio-button {
      flex: 1;
      --el-radio-button-checked-bg-color: var(--el-fill-color);
      --el-radio-button-checked-text-color: var(--el-text-color-primary);
      --el-radio-button-checked-border-color: var(--el-text-color-regular);

      :deep(.el-radio-button__inner) {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--el-border-color);
        border-radius: var(--el-border-radius-base);
        box-shadow: none;

        &:hover { color: var(--el-text-color-primary); }
      }

      &.is-active :deep(.el-radio-button__inner) {
        border-color: var(--el-text-color-regular);
      }
    }
  }

  .gptImageSizes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    .el-radio-button { flex: initial; }
    :deep(.el-radio-button__inner) { padding: 8px; }
  }

  .ratioOptions {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;

    &.gptImageRatios { grid-template-columns: repeat(4, minmax(0, 1fr)); }

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
}
</style>
