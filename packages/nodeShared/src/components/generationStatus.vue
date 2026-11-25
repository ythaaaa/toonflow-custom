<template>
  <div v-if="active || error" class="generationStatus" :class="{ failed: !active }" role="status" aria-live="polite">
    <icon-loader-2 v-if="active" class="spinner" :size="28" aria-hidden="true" />
    <span>{{ active ? stage : error }}</span>
    <span v-if="active" class="elapsed">已用 {{ Math.floor(elapsed / 60) }}:{{ String(elapsed % 60).padStart(2, "0") }}</span>
  </div>
</template>

<script setup lang="ts">
import { IconLoader2 } from "@tabler/icons-vue";

defineProps<{ active: boolean; stage: string; elapsed: number; error: string }>();
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
  &.failed { color: var(--el-color-danger); }
}

@keyframes rotate { to { transform: rotate(360deg); } }
</style>
