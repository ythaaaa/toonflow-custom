<template>
  <aside class="assistantPane" :class="{ collapsed }" aria-label="Codex 创作助手">
    <header class="assistantHeader">
      <div v-if="!collapsed"><strong>Codex 创作助手</strong><span :title="context">{{ context }}</span></div>
      <el-button text :aria-label="collapsed ? '展开 Codex 创作助手' : '收起 Codex 创作助手'" @click="collapsed = !collapsed">{{ collapsed ? '‹' : '收起' }}</el-button>
    </header>
    <localCodexConversation v-if="!collapsed" ref="conversation" v-model:selectedModel="selectedModel" :directory="directory" :context="context" @assistantCompleted="emit('assistantCompleted', $event)" />
  </aside>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { nextTick } from "vue";
import localCodexConversation from "@/components/agent/localCodexConversation.vue";

defineProps<{ directory?: string; context: string }>();
const emit = defineEmits<{ assistantCompleted: [text: string] }>();
const selectedModel = defineModel<string>("selectedModel", { required: true });
const collapsed = defineModel<boolean>("collapsed", { default: false });
const conversation = ref<InstanceType<typeof localCodexConversation>>();
async function sendPrompt(prompt: string) {
  collapsed.value = false;
  await nextTick();
  return conversation.value?.sendPrompt(prompt);
}
defineExpose({ sendPrompt });
</script>

<style lang="scss" scoped>
.assistantPane { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-inline-start: 1px solid var(--el-border-color-lighter); background: var(--el-bg-color); }
.assistantPane.collapsed { width: 44px; }
.assistantHeader { display: flex; align-items: center; justify-content: space-between; gap: 4px; min-height: 48px; padding: 6px 10px; border-bottom: 1px solid var(--el-border-color-lighter); strong { display: block; font-size: 13px; } span { display: block; max-width: 250px; overflow: hidden; color: var(--el-text-color-secondary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; } }
.collapsed .assistantHeader { flex-direction: column; padding: 8px 2px; }
</style>
