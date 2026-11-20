<template>
  <section class="localCodexConversation" aria-label="本机 Codex 聊天">
    <div class="localCodexNotice">本机 Codex Bridge · 仅支持文字对话；附件和 Toonflow 原生 Agent 工具暂不可用。</div>
    <div class="localCodexMessages" role="log" aria-live="polite">
      <p v-if="!messages.length" class="localCodexEmpty">输入消息，使用当前 ChatGPT 登录的 Codex 进行对话。</p>
      <div v-for="message in messages" :key="message.id" class="localCodexMessage" :class="message.role">
        <strong>{{ message.role === 'user' ? '你' : 'Codex' }}</strong>
        <div class="localCodexText">{{ message.content }}<span v-if="message.streaming" class="localCodexCursor">▍</span></div>
        <p v-if="message.error" class="localCodexError" role="alert">{{ message.error }}</p>
      </div>
    </div>
    <div class="localCodexComposer">
      <textarea v-model="draft" aria-label="Codex 消息" placeholder="输入文本消息…" :disabled="busy" maxlength="8000" @keydown.ctrl.enter.prevent="send" @keydown.meta.enter.prevent="send" />
      <div class="localCodexActions">
        <modelPopover v-model="selectedModel" :allowLocalCodex="true" :disabled="busy" />
        <button type="button" :disabled="busy" @click="newConversation">新对话</button>
        <button v-if="busy" type="button" aria-label="停止生成" @click="stop">停止生成</button>
        <button v-else type="button" aria-label="发送消息" :disabled="!draft.trim()" @click="send">发送</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from "vue";
import modelPopover from "@/components/modelPopover.vue";

type Message = { id: string; role: "user" | "assistant"; content: string; streaming?: boolean; error?: string };
const props = defineProps<{ directory?: string }>();
const emit = defineEmits<{ assistantCompleted: [text: string] }>();
const selectedModel = defineModel<string>("selectedModel", { required: true });
const key = `toonflowLocalCodex:${props.directory ?? "default"}`;
function restore(): { threadId?: string; messages: Message[] } {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    return value && Array.isArray(value.messages) ? { threadId: value.threadId, messages: value.messages.slice(-100).map((item: Message) => ({ ...item, streaming: false })) } : { messages: [] };
  } catch { return { messages: [] }; }
}
const saved = restore();
const messages = ref<Message[]>(saved.messages);
const threadId = ref<string | undefined>(saved.threadId);
const draft = ref("");
const busy = ref(false);
let controller: AbortController | undefined;
let runId: string | undefined;
watch([messages, threadId], () => {
  try { localStorage.setItem(key, JSON.stringify({ threadId: threadId.value, messages: messages.value.map(({ streaming, ...item }) => item) })); }
  catch { /* Storage can be unavailable; live chat remains usable. */ }
}, { deep: true });
function newConversation() { messages.value = []; threadId.value = undefined; draft.value = ""; }
async function stop() {
  if (runId) void fetch("http://127.0.0.1:18427/cancel", { method: "POST", headers: { "Content-Type": "application/json", "X-Toonflow-Codex-Bridge": "1" }, body: JSON.stringify({ runId }) }).catch(() => {});
  controller?.abort();
}
async function send() {
  const prompt = draft.value.trim();
  if (!prompt || busy.value) return;
  draft.value = "";
  busy.value = true;
  controller = new AbortController();
  const reply = reactive<Message>({ id: crypto.randomUUID(), role: "assistant", content: "", streaming: true });
  messages.value.push({ id: crypto.randomUUID(), role: "user", content: prompt }, reply);
  try {
    const response = await fetch("http://127.0.0.1:18427/chat", { method: "POST", headers: { "Content-Type": "application/json", "X-Toonflow-Codex-Bridge": "1" }, body: JSON.stringify({ prompt, threadId: threadId.value }), signal: controller.signal });
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || `Bridge 请求失败（${response.status}）`); }
    if (!response.body) throw new Error("Bridge 未返回流");
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = "";
    while (true) {
      const { value, done } = await reader.read();
      pending += value ?? "";
      const lines = pending.split("\n"); pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === "start") { runId = event.runId; threadId.value = event.threadId; }
        else if (event.type === "delta") reply.content += event.text;
        else if (event.type === "error") throw new Error(event.message);
        else if (event.type === "done") { emit("assistantCompleted", reply.content); return; }
      }
      if (done) throw new Error("Bridge 连接中断");
    }
  } catch (error) {
    reply.error = controller.signal.aborted ? "已停止生成" : error instanceof TypeError ? "无法连接本机 Codex Bridge，请先启动 Bridge" : error instanceof Error ? error.message : "Codex 请求失败";
  } finally { reply.streaming = false; runId = undefined; controller = undefined; busy.value = false; }
}
onBeforeUnmount(() => { controller?.abort(); });
async function sendPrompt(prompt: string) {
  if (busy.value) throw new Error("Codex 正在处理上一条消息");
  draft.value = prompt;
  await send();
}
defineExpose({ sendPrompt });
</script>

<style lang="scss" scoped>
.localCodexConversation { display: flex; flex-direction: column; min-height: 0; height: 100%; color: var(--el-text-color-primary); }
.localCodexNotice { padding: 10px 16px; font-size: 12px; color: var(--el-text-color-secondary); border-bottom: 1px solid var(--el-border-color); }
.localCodexMessages { flex: 1; min-height: 0; overflow: auto; padding: 16px; }
.localCodexEmpty { color: var(--el-text-color-secondary); }
.localCodexMessage { margin: 0 0 16px; }
.localCodexMessage strong { display: block; margin-bottom: 5px; font-size: 12px; }
.localCodexText { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
.localCodexError { color: var(--el-color-danger); }
.localCodexCursor { color: var(--el-color-primary); }
.localCodexComposer { padding: 12px; border-top: 1px solid var(--el-border-color); }
.localCodexComposer textarea { width: 100%; box-sizing: border-box; min-height: 72px; resize: vertical; padding: 9px; color: inherit; background: var(--el-fill-color); border: 1px solid var(--el-border-color); border-radius: 8px; }
.localCodexActions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.localCodexActions button { padding: 6px 10px; color: inherit; background: var(--el-fill-color); border: 1px solid var(--el-border-color); border-radius: 6px; cursor: pointer; }
.localCodexActions button:disabled { opacity: .5; cursor: default; }
</style>
