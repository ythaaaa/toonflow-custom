<template>
  <section class="localCodexConversation" aria-label="本机 Codex 智能创作中心">
    <div v-if="context" class="localCodexNotice">当前上下文：{{ context }}</div>
    <div class="localCodexNotice">Codex App Server · {{ threadId ? `会话已恢复 ${threadId.slice(0, 8)}` : '新会话' }} · 命令：/ · 引用：@</div>
    <div class="localCodexMessages" role="log" aria-live="polite">
      <p v-if="!messages.length" class="localCodexEmpty">输入任务。使用 / 查看命令，@ 搜索工作区文件。</p>
      <div v-for="message in messages" :key="message.id" class="localCodexMessage" :class="message.role">
        <strong>{{ message.role === 'user' ? '你' : 'Codex' }}</strong>
        <div class="localCodexText">{{ message.content }}<span v-if="message.streaming" class="localCodexCursor">▍</span></div>
        <div v-for="event in message.events" :key="event.id" class="localCodexEvent"><span>{{ event.status }}</span> {{ event.label }}<pre v-if="event.result">{{ event.result }}</pre></div>
        <p v-if="message.error" class="localCodexError" role="alert">{{ message.error }}</p>
      </div>
    </div>
    <div v-if="menu" class="localCodexMenu" role="listbox" :aria-label="menu === 'command' ? 'Codex 命令' : '文件引用'">
      <button v-for="item in menuItems" :key="item.id" type="button" @click="chooseMenu(item)"><b>{{ item.label }}</b><small>{{ item.detail }}</small></button>
      <small v-if="!menuItems.length">{{ catalogLoading ? '正在读取 Codex 能力…' : '没有匹配内容' }}</small>
    </div>
    <div class="localCodexComposer">
      <textarea v-model="draft" aria-label="Codex 消息" placeholder="输入任务，/ 查看命令，@ 引用文件…" :disabled="busy" maxlength="100000" @input="updateMenu" @keydown.ctrl.enter.prevent="send" @keydown.meta.enter.prevent="send" @keydown.enter.exact.prevent="menu && menuItems.length ? chooseMenu(menuItems[0]!) : send()" />
      <div class="localCodexActions">
        <input ref="attachmentInput" type="file" accept="image/*,video/*,.md,.markdown,.txt,.pdf,.json,.csv" multiple hidden @change="selectAttachments" />
        <span v-for="file in attachments" :key="file.file.name" class="attachmentChip">{{ file.file.name }} <button type="button" :aria-label="`移除 ${file.file.name}`" @click="attachments = attachments.filter(item => item !== file)">×</button></span>
        <el-select v-model="selectedModel" size="small" aria-label="Codex 模型" :disabled="busy" placeholder="默认模型" clearable style="width: 160px">
          <el-option v-for="model in catalog.models" :key="model.slug" :label="model.displayName || model.slug" :value="model.slug" />
        </el-select>
        <el-select v-model="reasoningEffort" size="small" aria-label="推理强度" :disabled="busy" placeholder="默认推理" clearable style="width: 110px"><el-option v-for="item in efforts" :key="item" :label="item" :value="item" /></el-select>
        <button type="button" :disabled="busy" @click="attachmentInput?.click()">附件</button>
        <button type="button" :disabled="busy" @click="loadCatalog(true)">能力</button>
        <button type="button" :disabled="busy" @click="newConversation">新对话</button>
        <button v-if="busy" type="button" aria-label="停止生成" @click="stop">停止</button>
        <button v-else type="button" aria-label="发送消息" :disabled="!draft.trim() && !attachments.length && !skillName" @click="send">发送</button>
      </div>
      <div v-if="skillName" class="localCodexNotice">本轮 Skill：{{ skillName }} <button type="button" @click="skillName = ''">清除</button></div>
      <div v-if="catalogSummary" class="localCodexNotice" role="status">{{ catalogSummary }}</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";

type ToolEvent = { id: string; status: string; label: string; result?: string };
type Message = { id: string; role: "user" | "assistant"; content: string; streaming?: boolean; error?: string; events?: ToolEvent[] };
type Catalog = { models: Array<{ slug: string; displayName?: string }>; skills: Array<{ name: string; path: string; description?: string }>; mcp: Array<{ name?: string; authStatus?: string; tools?: Array<{ name: string; description?: string; readOnly?: boolean }> }> };
type MenuItem = { id: string; label: string; detail: string; action: string; value?: string };
type Attachment = { file: File; id?: string };
const props = defineProps<{ directory?: string; context?: string }>();
const emit = defineEmits<{ assistantCompleted: [text: string] }>();
const selectedModelValue = defineModel<string>("selectedModel", { required: true });
const files = useWorkspaceFiles(() => props.directory);
const key = `toonflowLocalCodex:${props.directory ?? "default"}`;
function restore(): { threadId?: string; messages: Message[] } { try { const v = JSON.parse(localStorage.getItem(key) ?? "null"); return v && Array.isArray(v.messages) ? { threadId: v.threadId, messages: v.messages.slice(-100).map((m: Message) => ({ ...m, streaming: false })) } : { messages: [] }; } catch { return { messages: [] }; } }
const saved = restore();
const messages = ref<Message[]>(saved.messages);
const threadId = ref(saved.threadId);
const draft = ref("");
const busy = ref(false);
const attachments = ref<Attachment[]>([]);
const attachmentInput = ref<HTMLInputElement>();
const selectedModel = ref("");
const reasoningEffort = ref("");
const efforts = ["minimal", "low", "medium", "high", "xhigh", "max"];
const catalog = ref<Catalog>({ models: [], skills: [], mcp: [] });
const catalogLoading = ref(false);
const catalogLoaded = ref(false);
const catalogSummary = ref("");
const skillName = ref("");
const menu = ref<"command" | "file">();
const query = ref("");
const menuItems = computed<MenuItem[]>(() => {
  if (menu.value === "command") {
    const all: MenuItem[] = [
      { id: "help", label: "/help", detail: "命令说明", action: "help" },
      { id: "skills", label: "/skills", detail: "读取 Codex App Server 已发现的 Skills", action: "skills" },
      { id: "mcp", label: "/mcp", detail: "读取已连接 MCP 服务器与工具", action: "mcp" },
      { id: "models", label: "/models", detail: "读取可用模型与推理选项", action: "models" },
      { id: "new", label: "/new", detail: "开启本地新会话", action: "new" },
      ...catalog.value.skills.map(s => ({ id: `skill:${s.name}`, label: `/skill:${s.name}`, detail: s.description ?? s.path, action: "skill", value: s.name })),
    ];
    return all.filter(i => i.label.toLowerCase().includes(query.value.toLowerCase()));
  }
  const tools = catalog.value.mcp.flatMap(server => (server.tools ?? []).map(tool => ({ id: `tool:${server.name}:${tool.name}`, label: `@tool:${server.name}.${tool.name}`, detail: tool.description ?? (tool.readOnly ? "只读 MCP 工具" : "MCP 工具"), action: "tool", value: `${server.name}.${tool.name}` })));
  return [...fileItems.value, { id: "project", label: "@project", detail: props.directory ?? "当前工作区", action: "project" }, ...tools].filter(i => i.label.toLowerCase().includes(query.value.toLowerCase()));
});
const fileItems = ref<MenuItem[]>([]);
let controller: AbortController | undefined;
let runId: string | undefined;
let catalogRequest: Promise<void> | undefined;
watch([messages, threadId], () => { try { localStorage.setItem(key, JSON.stringify({ threadId: threadId.value, messages: messages.value.map(({ streaming: _s, ...m }) => m) })); } catch { /* storage optional */ } }, { deep: true });
function api(path: string, init?: RequestInit) { return fetch(`http://127.0.0.1:18427${path}`, { ...init, headers: { ...(init?.headers ?? {}), "X-Toonflow-Codex-Bridge": "1" } }); }
function loadCatalog(force = false) {
  if (!force && catalogLoaded.value) return Promise.resolve();
  if (catalogRequest) return catalogRequest;
  catalogLoading.value = true;
  catalogRequest = (async () => {
    try { const r = await api("/catalog"); if (!r.ok) throw new Error(`能力读取失败 (${r.status})`); catalog.value = await r.json(); catalogLoaded.value = true; catalogSummary.value = `模型 ${catalog.value.models.length} · Skills ${catalog.value.skills.length} · MCP ${catalog.value.mcp.length}`; }
    catch (e) { catalogSummary.value = e instanceof Error ? e.message : "能力读取失败"; }
    finally { catalogLoading.value = false; catalogRequest = undefined; }
  })();
  return catalogRequest;
}
async function updateMenu() {
  const cmd = /^\/(.*)$/.exec(draft.value);
  const at = /(?:^|\s)@([^\s]*)$/.exec(draft.value);
  menu.value = cmd ? "command" : at ? "file" : undefined;
  query.value = cmd?.[1] ?? at?.[1] ?? "";
  if (menu.value === "command") await loadCatalog();
  if (menu.value === "file" && props.directory) {
    try {
      const pending = [""]; const entries: Array<{name:string; path:string; type:"file"|"directory"}> = [];
      while (pending.length && pending.length < 200) { const dir = pending.shift()!; const listing = await files.list(dir); for (const entry of listing.entries) { if (entry.type === "file") entries.push(entry); else if (pending.length + entries.length < 200) pending.push(entry.path); } }
      fileItems.value = entries.filter(e => /\.(md|markdown|txt|json|csv|ya?ml|toml|xml|html?|css|js|ts|vue|py|sh|ps1|sql)$/i.test(e.name)).map(e => ({ id: e.path, label: `@${e.name}`, detail: e.path, action: "file", value: e.path }));
    }
    catch { fileItems.value = []; }
  }
}
async function chooseMenu(item: MenuItem) {
  menu.value = undefined;
  if (item.action === "new") { newConversation(); return; }
  if (item.action === "help") { draft.value = "命令：/skills、/mcp、/models、/new、/skill:<名称>。输入 @ 搜索并读取工作区文本文件。"; return; }
  if (["skills", "mcp", "models"].includes(item.action)) { await loadCatalog(); catalogSummary.value = item.action === "skills" ? catalog.value.skills.map(s => `${s.name}: ${s.description ?? s.path}`).join("\n") || "没有发现 Codex Skill" : item.action === "mcp" ? JSON.stringify(catalog.value.mcp, null, 2) || "没有发现 MCP 工具" : `模型：${catalog.value.models.map(m => m.slug).join("、")}`; draft.value = ""; return; }
  if (item.action === "skill" && item.value) { skillName.value = item.value; draft.value = ""; return; }
  if (item.action === "project") { draft.value = `${draft.value.replace(/(?:^|\s)@[^\s]*$/, " ").trimEnd()}\n\n<当前 Toonflow 工作区>${props.directory ?? "未选择"}</当前 Toonflow 工作区>`; return; }
  if (item.action === "tool" && item.value) { draft.value = `${draft.value.replace(/(?:^|\s)@[^\s]*$/, " ").trimEnd()}\n\n请在本轮使用已配置的 MCP 工具 ${item.value}，并展示真实调用结果。`; return; }
  if (item.action === "file" && item.value) {
    try { const text = await files.readText(item.value, 400000); draft.value = draft.value.replace(/(?:^|\s)@[^\s]*$/, " ").trimEnd() + `\n\n<文件 ${item.value}>\n${text}\n</文件>`; }
    catch (e) { catalogSummary.value = e instanceof Error ? e.message : "文件读取失败"; }
  }
}
function selectAttachments(event: Event) { const input = event.target as HTMLInputElement; attachments.value.push(...Array.from(input.files ?? []).map(file => ({ file }))); input.value = ""; }
async function upload(file: File) { const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("附件读取失败")); reader.readAsDataURL(file); }); const r = await api("/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", data }) }); if (!r.ok) throw new Error((await r.json()).error ?? "附件上传失败"); return (await r.json()).id as string; }
function newConversation() { messages.value = []; threadId.value = undefined; draft.value = ""; skillName.value = ""; attachments.value = []; }
async function stop() { if (runId) void api("/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId }) }).catch(() => {}); controller?.abort(); }
async function send() {
  const prompt = draft.value.trim(); if ((!prompt && !attachments.value.length && !skillName.value) || busy.value) return;
  const contextualPrompt = props.context ? `当前 Toonflow 创作上下文：\n${props.context}\n\n用户任务：\n${prompt}` : prompt;
  menu.value = undefined; draft.value = ""; busy.value = true; controller = new AbortController();
  const userText = prompt + (attachments.value.length ? `\n附件：${attachments.value.map(a => a.file.name).join("、")}` : "") + (skillName.value ? `\nSkill：${skillName.value}` : "");
  const reply = reactive<Message>({ id: crypto.randomUUID(), role: "assistant", content: "", events: [], streaming: true });
  messages.value.push({ id: crypto.randomUUID(), role: "user", content: userText }, reply);
  try {
    const uploaded = await Promise.all(attachments.value.map(async a => ({ id: a.id ?? await upload(a.file) })));
    const response = await api("/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: contextualPrompt, threadId: threadId.value, attachments: uploaded, skillName: skillName.value || undefined, model: selectedModel.value || undefined, reasoningEffort: reasoningEffort.value || undefined }), signal: controller.signal });
    attachments.value = []; skillName.value = "";
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || `Bridge 请求失败（${response.status}）`); }
    if (!response.body) throw new Error("Bridge 未返回流");
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader(); let pending = "";
    while (true) { const { value, done } = await reader.read(); pending += value ?? ""; const lines = pending.split("\n"); pending = lines.pop() ?? "";
      for (const line of lines) { if (!line) continue; const ev = JSON.parse(line); if (ev.type === "start") { runId = ev.runId; threadId.value = ev.threadId; } else if (ev.type === "delta") reply.content += ev.text; else if (ev.type === "item") reply.events!.push({ id: crypto.randomUUID(), status: ev.event, label: [ev.item.server, ev.item.tool ?? ev.item.name ?? ev.item.type].filter(Boolean).join(" · "), result: ev.item.result ?? ev.item.aggregatedOutput ?? ev.item.error }); else if (ev.type === "error") throw new Error(ev.message); else if (ev.type === "done") { emit("assistantCompleted", reply.content); return; } }
      if (done) throw new Error("Bridge 连接中断");
    }
  } catch (error) { reply.error = controller.signal.aborted ? "已停止生成" : error instanceof TypeError ? "无法连接本机 Codex Bridge，请先启动 Bridge" : error instanceof Error ? error.message : "Codex 请求失败"; }
  finally { reply.streaming = false; runId = undefined; controller = undefined; busy.value = false; }
}
onBeforeUnmount(() => controller?.abort());
async function sendPrompt(prompt: string) { if (busy.value) throw new Error("Codex 正在处理上一条消息"); draft.value = prompt; await send(); }
defineExpose({ sendPrompt });
</script>

<style lang="scss" scoped>
.localCodexConversation { display:flex; flex-direction:column; min-height:0; height:100%; color:var(--el-text-color-primary); position:relative; }
.localCodexNotice { padding:8px 12px; font-size:12px; color:var(--el-text-color-secondary); border-bottom:1px solid var(--el-border-color); white-space:pre-wrap; }
.localCodexMessages { flex:1; min-height:0; overflow:auto; padding:16px; }
.localCodexEmpty { color:var(--el-text-color-secondary); }
.localCodexMessage { margin:0 0 16px; } .localCodexMessage strong { display:block; margin-bottom:5px; font-size:12px; }
.localCodexText { white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.6; } .localCodexError { color:var(--el-color-danger); } .localCodexCursor { color:var(--el-color-primary); }
.localCodexEvent { margin-top:6px; padding:6px 8px; background:var(--el-fill-color-light); font-size:12px; overflow-wrap:anywhere; } .localCodexEvent pre { white-space:pre-wrap; max-height:180px; overflow:auto; }
.localCodexComposer { padding:12px; border-top:1px solid var(--el-border-color); } .localCodexComposer textarea { width:100%; box-sizing:border-box; min-height:72px; resize:vertical; padding:9px; color:inherit; background:var(--el-fill-color); border:1px solid var(--el-border-color); border-radius:8px; }
.localCodexActions { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:8px; margin-top:8px; } .localCodexActions button { padding:6px 10px; color:inherit; background:var(--el-fill-color); border:1px solid var(--el-border-color); border-radius:6px; cursor:pointer; } .localCodexActions button:disabled { opacity:.5; cursor:default; }
.localCodexMenu { position:absolute; z-index:5; left:12px; right:12px; bottom:130px; max-height:260px; overflow:auto; display:grid; padding:6px; border:1px solid var(--el-border-color); border-radius:8px; background:var(--el-bg-color); box-shadow:0 4px 16px #0002; } .localCodexMenu button { display:grid; text-align:left; gap:4px; padding:9px; border:0; background:transparent; color:inherit; cursor:pointer; } .localCodexMenu button:hover { background:var(--el-fill-color-light); } .localCodexMenu small { color:var(--el-text-color-secondary); }
.attachmentChip { font-size:12px; padding:4px 6px; background:var(--el-fill-color-light); }
</style>
