<template>
  <section ref="viewRoot" class="documentView" :class="{ fullScreen: fullScreen && editing }" aria-label="剧本文档">
    <header class="documentHeader">
      <div class="documentHeading">
        <p class="documentEyebrow">{{ subtitle }}</p>
        <h2>{{ title }}</h2>
      </div>
      <div class="documentActions">
        <span class="saveState" :class="{ pending: dirty }">{{ saving ? "正在保存" : dirty ? "尚未保存" : status }}</span>
        <span class="wordCount">{{ formattedCharacterCount }} 字</span>
        <el-dropdown v-if="versions.length" trigger="click" @command="emit('openVersion', $event)">
          <el-button aria-label="剧本版本">版本记录<icon-chevron-down :size="14" /></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="version in versions" :key="version.id" :command="version.id" :disabled="activeVersionId === version.id">{{ version.label }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <template v-if="editing">
          <el-button text :aria-label="fullScreen ? '退出全屏' : '全屏编辑'" @click="fullScreen = !fullScreen">
            <IconMinimize v-if="fullScreen" :size="16" />
            <IconMaximize v-else :size="16" />
            {{ fullScreen ? "退出全屏" : "全屏" }}
          </el-button>
          <el-button :disabled="saving" @click="emit('cancel')">取消</el-button>
          <el-button v-if="allowNewVersion" :disabled="saving || !content.trim()" :loading="savingVersion" @click="emit('saveVersion')">保存为新版本</el-button>
          <el-button type="primary" :disabled="saving" :loading="saving" title="Ctrl+S / ⌘S" @click="emit('save')">保存</el-button>
        </template>
        <el-button v-else type="primary" @click="emit('edit')">编辑</el-button>
      </div>
    </header>

    <div ref="documentBody" class="documentBody" :class="{ editing }">
      <el-skeleton v-if="loading" :rows="9" animated />
      <div v-else-if="editing" ref="editPane" class="editPane">
        <div ref="editorFrame" class="editorFrame" :style="editorFrameStyle">
          <markdownEditor v-if="editing" :context="editorContext" />
        </div>
        <div
          class="editorResizeHandle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="调整编辑器高度"
          aria-valuemin="220"
          :aria-valuenow="visibleEditorHeight"
          tabindex="0"
          @pointerdown="beginEditorResize"
          @keydown="resizeEditorWithKeyboard" />
        <footer class="editorStatus"><span>Ctrl+S 保存</span><span>拖动下方边界调整高度</span></footer>
      </div>
      <el-empty v-else-if="isEmpty" description="这份文档还没有内容">
        <el-button type="primary" @click="emit('edit')">开始编辑</el-button>
      </el-empty>
      <article v-else class="markdownBody" v-html="renderedContent" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { IconChevronDown, IconMaximize, IconMinimize } from "@tabler/icons-vue";
import type { ExtContext, ExtFiles } from "@toonflow/ext-scaffold/runtime";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import markdownEditor from "../../../../../packages/ext/md/src/index.vue";

const props = defineProps<{
  title: string;
  subtitle: string;
  content: string;
  workspaceDirectory: string;
  resourcePath: string;
  renderedContent: string;
  editing: boolean;
  dirty: boolean;
  loading: boolean;
  saving: boolean;
  savingVersion: boolean;
  status: string;
  isEmpty: boolean;
  allowNewVersion: boolean;
  activeVersionId: string;
  versions: { id: string; label: string }[];
}>();
const emit = defineEmits<{
  "update:content": [content: string];
  edit: [];
  save: [];
  saveVersion: [];
  cancel: [];
  openVersion: [versionId: string];
}>();
const viewRoot = ref<HTMLElement>();
const documentBody = ref<HTMLElement>();
const editPane = ref<HTMLElement>();
const editorFrame = ref<HTMLElement>();
const fullScreen = ref(false);
const editorHeight = ref<number>();
const editorFiles = useWorkspaceFiles(() => props.workspaceDirectory) as ExtFiles;
const characterCount = computed(() => Array.from(props.content).length);
const formattedCharacterCount = computed(() => new Intl.NumberFormat("zh-CN").format(characterCount.value));
const visibleEditorHeight = computed(() => Math.round(editorHeight.value ?? editorFrame.value?.getBoundingClientRect().height ?? 220));
const editorFrameStyle = computed(() => editorHeight.value === undefined
  ? { flex: "1 1 auto" }
  : { flex: "0 0 auto", height: `${editorHeight.value}px` });
const editorContext = computed<ExtContext>(() => ({
  resource: { kind: "file", directory: props.workspaceDirectory, path: props.resourcePath, label: props.title },
  files: editorFiles,
  text: props.content,
  loading: props.loading || !props.editing,
  error: "",
  dirty: props.dirty,
  active: props.editing && !props.loading,
  config: {},
  saveConfig: async () => {},
  updateText: text => emit("update:content", text),
  flushSave: async () => {},
  writeClipboardText: text => navigator.clipboard.writeText(text),
  openFile: async () => {},
}));
let resizeOrigin: { y: number; height: number; pointerId: number } | undefined;

function handleGlobalKeydown(event: KeyboardEvent) {
  if (fullScreen.value && event.key === "Escape") {
    event.preventDefault();
    fullScreen.value = false;
    return;
  }
  if (!viewRoot.value?.contains(event.target as Node)) return;
  if (props.editing && (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
    event.preventDefault();
    event.stopPropagation();
    emit("save");
  }
}

function beginEditorResize(event: PointerEvent) {
  if (event.button !== 0 || !editorFrame.value || !editPane.value) return;
  event.preventDefault();
  const height = editorFrame.value.getBoundingClientRect().height;
  editorHeight.value = height;
  resizeOrigin = { y: event.clientY, height, pointerId: event.pointerId };
  document.documentElement.classList.add("dramaEditorResizing");
  window.addEventListener("pointermove", updateEditorResize);
  window.addEventListener("pointerup", endEditorResize);
  window.addEventListener("pointercancel", endEditorResize);
}

function updateEditorResize(event: PointerEvent) {
  if (!resizeOrigin || event.pointerId !== resizeOrigin.pointerId || !editPane.value) return;
  const minimum = 220;
  const maximum = Math.max(minimum, editPane.value.clientHeight - 48);
  editorHeight.value = Math.max(minimum, Math.min(maximum, resizeOrigin.height + event.clientY - resizeOrigin.y));
}

function endEditorResize() {
  resizeOrigin = undefined;
  document.documentElement.classList.remove("dramaEditorResizing");
  window.removeEventListener("pointermove", updateEditorResize);
  window.removeEventListener("pointerup", endEditorResize);
  window.removeEventListener("pointercancel", endEditorResize);
}

function resizeEditorWithKeyboard(event: KeyboardEvent) {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  const current = editorHeight.value ?? editorFrame.value?.getBoundingClientRect().height ?? 220;
  const maximum = Math.max(220, (editPane.value?.clientHeight ?? current + 48) - 48);
  editorHeight.value = Math.max(220, Math.min(maximum, current + (event.key === "ArrowDown" ? 40 : -40)));
}

onMounted(() => window.addEventListener("keydown", handleGlobalKeydown, true));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleGlobalKeydown, true);
  endEditorResize();
});

watch(() => props.editing, async editing => {
  if (!editing) {
    fullScreen.value = false;
    editorHeight.value = undefined;
    return;
  }
  editorHeight.value = undefined;
  await nextTick();
  documentBody.value?.scrollTo({ top: 0 });
  editPane.value?.querySelector<HTMLElement>(".editorBody, .sourceEditor")?.scrollTo({ top: 0 });
}, { flush: "post" });
</script>

<style lang="scss" scoped>
.documentView { position: relative; display: flex; flex-direction: column; width: min(100%, 1100px); height: 100%; min-width: 0; min-height: 0; margin: 0 auto; background: var(--el-bg-color); }
.documentView.fullScreen { position: fixed; inset: 0; z-index: 1000; width: 100vw; height: 100vh; max-width: none; margin: 0; box-shadow: 0 0 0 1px var(--el-border-color-lighter); }
.documentHeader { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 22px 30px 18px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-bg-color); }
.documentHeading { min-width: 0; .documentEyebrow { margin: 0 0 5px; color: var(--el-text-color-secondary); font-size: 12px; } h2 { margin: 0; overflow-wrap: anywhere; color: var(--el-text-color-primary); font-size: 21px; font-weight: 600; letter-spacing: .01em; } }
.documentActions { display: flex; flex: 0 0 auto; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 8px; :deep(.el-button) { gap: 4px; } }
.saveState { color: var(--el-text-color-secondary); font-size: 12px; &.pending { color: var(--el-color-warning); } }
.documentBody { flex: 1; min-height: 0; overflow: auto; padding: 24px 30px 48px; background: var(--el-bg-color); &.editing { display: flex; flex-direction: column; overflow: hidden; padding: 12px 30px 14px; } }
.editPane { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
.editorFrame { flex: 1 1 auto; min-width: 0; min-height: 220px; overflow: hidden; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-bg-color); :deep(.markdownEditor) { height: 100%; } :deep(.editorSurface) { background: var(--el-bg-color); } :deep(.editorBody .tiptap) { font-size: 16px; line-height: 1.8; } :deep(.sourceEditor) { font-size: 16px; line-height: 1.8; } }
.editorResizeHandle { display: flex; flex: 0 0 12px; align-items: center; justify-content: center; cursor: ns-resize; touch-action: none; &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; } span { width: 34px; height: 3px; border-radius: 3px; background: var(--el-border-color); } &:hover span { background: var(--el-color-primary-light-5); } }
.editorStatus { display: flex; flex: 0 0 auto; justify-content: space-between; color: var(--el-text-color-secondary); font-size: 12px; line-height: 20px; }
.wordCount { color: var(--el-text-color-secondary); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.markdownBody { width: 100%; max-width: 1100px; margin: 0 auto; color: var(--el-text-color-primary); font-size: 16px; line-height: 1.8; overflow-wrap: anywhere; :deep(h1), :deep(h2), :deep(h3), :deep(h4) { margin: 1.7em 0 .7em; line-height: 1.35; font-weight: 650; } :deep(h1) { margin-top: .2em; font-size: 30px; } :deep(h2) { padding-bottom: .36em; border-bottom: 1px solid var(--el-border-color-lighter); font-size: 23px; } :deep(h3) { font-size: 18px; } :deep(p), :deep(ul), :deep(ol), :deep(blockquote), :deep(table), :deep(pre) { margin: 0 0 1.1em; } :deep(ul), :deep(ol) { padding-inline-start: 1.5em; } :deep(li + li) { margin-top: .3em; } :deep(blockquote) { padding: 2px 16px; border-inline-start: 3px solid var(--el-color-primary-light-5); color: var(--el-text-color-secondary); } :deep(code) { padding: .14em .36em; border-radius: 4px; background: var(--el-fill-color-light); font-size: .9em; } :deep(pre) { overflow: auto; padding: 16px; border-radius: 7px; color: var(--el-text-color-primary); background: var(--el-fill-color-light); line-height: 1.65; } :deep(pre code) { padding: 0; background: transparent; } :deep(table) { display: block; max-width: 100%; overflow: auto; border-collapse: collapse; } :deep(th), :deep(td) { padding: 9px 12px; border: 1px solid var(--el-border-color-lighter); text-align: left; } :deep(th) { background: var(--el-fill-color-light); } :deep(a) { color: var(--el-color-primary); } :deep(hr) { margin: 1.7em 0; border: 0; border-top: 1px solid var(--el-border-color-lighter); } }
.dramaEditorResizing { cursor: ns-resize !important; user-select: none !important; }
@media (max-width: 760px) { .documentHeader { align-items: flex-start; flex-direction: column; padding: 16px 18px; } .documentActions { justify-content: flex-start; } .documentBody { padding: 20px 18px 40px; } .documentBody.editing { padding: 16px; } }
</style>
