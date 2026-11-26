<template>
  <div v-if="active || error" class="generationStatus" :class="{ failed: !active }" role="status" aria-live="polite">
    <icon-loader-2 v-if="active" class="spinner" :size="28" aria-hidden="true" />
    <span>{{ active ? stage : error }}</span>
    <span v-if="taskId" class="taskId">任务 ID：{{ taskId }}</span>
    <span v-if="active" class="elapsed">已用 {{ Math.floor(elapsed / 60) }}:{{ String(elapsed % 60).padStart(2, "0") }}</span>
    <details v-if="!active && errorDetail" class="errorDetails">
      <summary>错误详情（开发者）</summary>
      <span>{{ errorDetail }}</span>
    </details>
  </div>
</template>

<script setup lang="ts">
import { IconLoader2 } from "@tabler/icons-vue";

defineProps<{ active: boolean; stage: string; elapsed: number; error: string; errorDetail?: string; taskId?: string }>();
</script>

<style scoped lang="scss">
.generationStatus {
  position: absolute;
  z-index: 3;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  color: var(--el-text-color-primary);
  text-align: center;
  background: var(--el-fill-color-blank);

  .spinner { animation: rotate 1s linear infinite; }
  .elapsed { color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; }
  .taskId { max-width: 100%; overflow-wrap: anywhere; color: var(--el-text-color-secondary); font-size: 12px; }
  .errorDetails { max-width: 100%; overflow-wrap: anywhere; color: var(--el-text-color-secondary); font-size: 12px; text-align: left; }
  &.failed { color: var(--el-color-danger); }
}

@keyframes rotate { to { transform: rotate(360deg); } }
</style>
