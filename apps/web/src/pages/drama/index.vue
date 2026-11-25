<template>
  <main class="dramaCenter">
    <header class="dramaHeader">
      <div class="headerTitle">
        <h1>剧本文档中心</h1>
        <p>工作区：{{ workspace.project?.name || "未命名工作区" }}</p>
      </div>
      <div class="headerActions">
        <el-button @click="emit('returnWorkspace')">返回工作区</el-button>
        <el-button v-if="project" @click="returnToProjects">项目列表</el-button>
        <el-button v-if="!project && !showCreateForm && !loading" type="primary" @click="showCreateForm = true">新建短剧</el-button>
      </div>
    </header>

    <section v-if="loading" class="loadingState"><el-skeleton :rows="6" animated /></section>
    <section v-else-if="loadError" class="loadingState">
      <el-alert type="error" :title="loadError" showIcon />
      <el-button @click="loadProjects(false)">重试读取</el-button>
    </section>
    <section v-else-if="!project && !showCreateForm" class="projectList">
      <div class="listHeading">
        <div><h2>短剧项目</h2><p>选择项目后，在同一目录中阅读和管理共享设定与分集文档。</p></div>
        <el-button type="primary" @click="showCreateForm = true">新建短剧</el-button>
      </div>
      <el-empty v-if="!projectEntries.length" description="当前工作区还没有短剧项目" />
      <div v-else class="projectCards">
        <article v-for="entry in projectEntries" :key="entry.project.id" class="projectCard">
          <button type="button" class="projectCardMain" @click="openProject(entry.project)">
            <span class="projectCardName">{{ entry.project.name }}</span>
            <span class="projectCardMeta">{{ entry.project.seasons.length }} 季 · {{ entry.project.episodes.length }} 集 · 最近编辑 {{ formatDate(entry.project.updatedAt) }}</span>
            <span class="projectCardAction">打开项目 <icon-arrow-right :size="16" /></span>
          </button>
          <el-button class="renameButton" text @click.stop="renameProject(entry)">重命名</el-button>
        </article>
      </div>
    </section>
    <section v-else-if="!project" class="projectSetup">
      <el-button text @click="showCreateForm = false">返回项目列表</el-button>
      <h2>创建短剧项目</h2>
      <el-form labelPosition="top" @submit.prevent="createProject">
        <el-form-item label="项目名称"><el-input v-model="form.name" maxlength="120" /></el-form-item>
        <div class="formRow">
          <el-form-item label="类型 / 题材"><el-input v-model="form.genre" /></el-form-item>
          <el-form-item label="视觉风格"><el-input v-model="form.style" /></el-form-item>
        </div>
        <div class="formRow">
          <el-form-item label="目标集数"><el-input-number v-model="form.targetEpisodes" :min="1" :max="500" /></el-form-item>
          <el-form-item label="单集目标时长（秒）"><el-input-number v-model="form.targetDuration" :min="30" :max="7200" /></el-form-item>
        </div>
        <el-button type="primary" :loading="busy" @click="createProject">创建项目</el-button>
      </el-form>
    </section>
    <section v-else class="dramaLayout" :style="{ '--sidebar-width': `${sidebarWidth}px` }">
      <dramaStudioNav
        :projectId="project.id"
        :projects="projectEntries.map(item => ({ id: item.project.id, name: item.project.name }))"
        :seasons="project.seasons"
        :episodes="project.episodes"
        :selectedDocumentId="selectedDocumentId"
        @project="switchProject"
        @projectList="returnToProjects"
        @select="selectDocument"
        @canvas="openCanvasById"
        @addSeason="addSeason"
        @addEpisode="addEpisode"
      />
      <div
        class="sidebarResizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整目录宽度"
        aria-valuemin="220"
        aria-valuemax="520"
        :aria-valuenow="Math.round(sidebarWidth)"
        tabindex="0"
        @pointerdown="beginSidebarResize"
        @keydown="resizeSidebarWithKeyboard" />
      <div class="documentStage">
        <dramaDocumentView
          v-if="documentInfo"
          v-model:content="documentContent"
          :title="documentInfo.title"
          :subtitle="documentSubtitle"
          :sourceHint="documentInfo.sourceHint"
          :workspaceDirectory="workspaceDirectory || ''"
          :resourcePath="documentResourcePath"
          :renderedContent="renderedContent"
          :editing="editing"
          :dirty="isDirty"
          :loading="loadingDocument"
          :saving="savingDocument"
          :savingVersion="savingVersion"
          :status="documentStatus"
          :isEmpty="!documentContent.trim()"
          :allowNewVersion="documentInfo.kind === 'script'"
          :versions="versionOptions"
          :activeVersionId="activeVersionId"
          @edit="editing = true"
          @save="saveDocument"
          @saveVersion="saveAsVersion"
          @cancel="cancelEditing"
          @openVersion="openVersion"
        />
        <el-empty v-else description="从左侧目录选择一份文档" />
        <codexAssistantPane
          v-model:selectedModel="codexModel"
          v-model:collapsed="assistantCollapsed"
          :directory="workspaceDirectory"
          :context="assistantContext"
        />
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { IconArrowRight } from "@tabler/icons-vue";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { TextSnapshot } from "@/lib/workspaceFiles";
import dramaStudioNav from "./dramaStudioNav.vue";
import dramaDocumentView from "./dramaDocumentView.vue";
import codexAssistantPane from "./codexAssistantPane.vue";
import {
  applyDramaProjectSnapshot, cloneDramaProject, createDramaProject, createEpisode, createSeason, listDramaProjects, readEpisodeScript,
  renameDramaProject, saveDramaProject, saveEpisodeDraft, saveEpisodeScriptVersion,
  type DramaAsset, type DramaCharacter, type DramaEpisode, type DramaProject, type DramaProjectEntry,
  type DramaShot,
} from "@/lib/dramaWorkspace";

type DocumentKind = "markdown" | "storyOutline" | "visualStyle" | "episodeOutlines" | "script";
type DocumentInfo = { id: string; title: string; subtitle: string; kind: DocumentKind; path?: string; episode?: DramaEpisode; seasonId?: string; seed?: string; sourceHint?: string };
type DocumentFileState = { path: string; text: string; revision?: string; encoding?: TextSnapshot["encoding"]; missing: boolean };

const router = useRouter();
const props = defineProps<{ initialProjectId?: string; initialEpisodeId?: string; initialSection?: string }>();
const emit = defineEmits<{
  returnWorkspace: [];
  openCanvas: [target: {
    projectId: string; projectName: string; seasonId: string; seasonName: string;
    episodeId: string; episodeNumber: number; episodeTitle: string;
    episodes: { id: string; number: number; title: string }[];
  }];
}>();

const workspace = useWorkspaceStore();
const workspaceDirectory = ref(workspace.project?.directory);
const project = ref<DramaProject>();
const projectEntries = ref<DramaProjectEntry[]>([]);
const manifestPath = ref("");
const loading = ref(true);
const loadingDocument = ref(false);
const savingDocument = ref(false);
const savingVersion = ref(false);
const loadError = ref("");
const busy = ref(false);
const showCreateForm = ref(false);
const selectedDocumentId = ref("");
const documentContent = ref("");
const loadedContent = ref("");
const documentFileState = ref<DocumentFileState>();
const documentStatus = ref("已保存");
const editing = ref(false);
const activeVersionId = ref("");
const assistantCollapsed = ref(true);
const codexModel = ref(JSON.stringify(["localCodex", "codex"]));
const sidebarWidth = ref(280);
let projectRequestId = 0;
let documentRequestId = 0;
let sidebarResizeOrigin: { x: number; width: number; pointerId: number } | undefined;
const form = reactive({ name: "", genre: "", style: "", targetEpisodes: 12, targetDuration: 180 });

const documentInfo = computed(() => project.value ? getDocumentInfo(selectedDocumentId.value) : undefined);
const documentSubtitle = computed(() => {
  const info = documentInfo.value;
  return info ? [project.value?.name, info.subtitle].filter(Boolean).join(" · ") : "";
});
const documentResourcePath = computed(() => {
  const info = documentInfo.value;
  if (!info) return "document.md";
  if (info.path) return info.path;
  const root = manifestPath.value.replace(/\/project\.json$/, "");
  if (info.kind === "script" && info.episode) return info.episode.draftPath ?? `${root}/scripts/${info.episode.id}/draft.md`;
  return `${root}/documents/${info.id}.md`;
});
const renderedContent = computed(() => String(DOMPurify.sanitize(marked.parse(documentContent.value, { async: false, gfm: true, breaks: true }), {
  USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "iframe", "object", "embed"],
})));
const isDirty = computed(() => editing.value && documentContent.value !== loadedContent.value);
const versionOptions = computed(() => {
  if (documentInfo.value?.kind !== "script" || !project.value) return [];
  return (project.value.scriptVersions[documentInfo.value.episode!.id] ?? [])
    .slice().sort((left, right) => left.version - right.version)
    .map(item => ({ id: item.id, label: "V" + String(item.version).padStart(3, "0") + " · " + formatDate(item.createdAt) }));
});
const assistantContext = computed(() => documentInfo.value
  ? [project.value?.name, documentInfo.value.subtitle, documentInfo.value.title].filter(Boolean).join(" · ")
  : project.value?.name ?? "");

function beginSidebarResize(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  sidebarResizeOrigin = { x: event.clientX, width: sidebarWidth.value, pointerId: event.pointerId };
  document.documentElement.classList.add("dramaSidebarResizing");
  window.addEventListener("pointermove", updateSidebarResize);
  window.addEventListener("pointerup", endSidebarResize);
  window.addEventListener("pointercancel", endSidebarResize);
}

function updateSidebarResize(event: PointerEvent) {
  if (!sidebarResizeOrigin || event.pointerId !== sidebarResizeOrigin.pointerId) return;
  const maximum = Math.max(220, Math.min(520, window.innerWidth * 0.45));
  sidebarWidth.value = Math.max(220, Math.min(maximum, sidebarResizeOrigin.width + event.clientX - sidebarResizeOrigin.x));
}

function endSidebarResize() {
  sidebarResizeOrigin = undefined;
  document.documentElement.classList.remove("dramaSidebarResizing");
  window.removeEventListener("pointermove", updateSidebarResize);
  window.removeEventListener("pointerup", endSidebarResize);
  window.removeEventListener("pointercancel", endSidebarResize);
}

function resizeSidebarWithKeyboard(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const maximum = Math.max(220, Math.min(520, window.innerWidth * 0.45));
  sidebarWidth.value = Math.max(220, Math.min(maximum, sidebarWidth.value + (event.key === "ArrowRight" ? 20 : -20)));
}

onBeforeUnmount(endSidebarResize);

watch(() => workspace.project?.directory, directory => {
  workspaceDirectory.value = directory;
  project.value = undefined;
  manifestPath.value = "";
  selectedDocumentId.value = "";
  documentContent.value = "";
  editing.value = false;
  if (!directory) {
    void router.replace("/home");
    return;
  }
  void loadProjects(true);
}, { immediate: true });

async function loadProjects(autoOpenInitial: boolean) {
  const directory = workspaceDirectory.value;
  const requestId = ++projectRequestId;
  if (!directory) { await router.replace("/home"); return; }
  loading.value = true;
  loadError.value = "";
  project.value = undefined;
  try {
    const entries = await listDramaProjects(useWorkspaceFiles(directory));
    if (directory !== workspaceDirectory.value || requestId !== projectRequestId) return;
    projectEntries.value = entries;
    if (!autoOpenInitial || !props.initialProjectId) return;
    const entry = entries.find(item => item.project.id === props.initialProjectId);
    if (!entry) return;
    const initialEpisode = entry.project.episodes.find(item => item.id === props.initialEpisodeId);
    const initialDoc = initialEpisode
      ? "episode:" + initialEpisode.id + ":" + (props.initialSection === "storyboard" ? "storyboard" : "script")
      : defaultDocumentId(entry.project);
    await activateProject(entry, initialDoc);
  } catch (error) {
    if (directory === workspaceDirectory.value && requestId === projectRequestId) {
      loadError.value = error instanceof Error ? "读取短剧项目失败：" + error.message : "读取短剧项目失败";
    }
  } finally {
    if (directory === workspaceDirectory.value && requestId === projectRequestId) loading.value = false;
  }
}

function defaultDocumentId(value: DramaProject) {
  const episode = value.episodes.find(item => item.seasonId === value.seasons[0]?.id) ?? value.episodes[0];
  return episode ? "episode:" + episode.id + ":script" : "storyOutline";
}

async function activateProject(entry: DramaProjectEntry, documentId = defaultDocumentId(entry.project)) {
  project.value = entry.project;
  manifestPath.value = entry.path;
  showCreateForm.value = false;
  selectedDocumentId.value = documentId;
  await loadDocument(documentId);
}

async function openProject(value: DramaProject) {
  if (!await confirmDiscard()) return;
  const entry = projectEntries.value.find(item => item.project.id === value.id);
  if (entry) await activateProject(entry);
}

async function switchProject(projectId: string) {
  const entry = projectEntries.value.find(item => item.project.id === projectId);
  if (entry && projectId !== project.value?.id) await openProject(entry.project);
}

async function returnToProjects() {
  if (!await confirmDiscard()) return;
  project.value = undefined;
  manifestPath.value = "";
  selectedDocumentId.value = "";
  documentContent.value = "";
  loadedContent.value = "";
  editing.value = false;
  showCreateForm.value = false;
  await loadProjects(false);
}

async function confirmDiscard() {
  if (!isDirty.value) return true;
  return ElMessageBox.confirm("当前文档有未保存的修改。离开后会丢弃这些修改。", "放弃未保存修改？", {
    confirmButtonText: "放弃修改", cancelButtonText: "继续编辑", type: "warning",
  }).then(() => true, () => false);
}

async function createProject() {
  const directory = workspaceDirectory.value;
  if (!directory || !form.name.trim() || busy.value) return;
  busy.value = true;
  try {
    const files = useWorkspaceFiles(directory);
    const value = await createDramaProject(files, { ...form, name: form.name.trim() });
    createSeason(value, "第一季", form.targetEpisodes);
    const path = ".toonflow/drama/projects/" + value.id + "/project.json";
    await saveDramaProject(files, value, path);
    const entry: DramaProjectEntry = { project: value, path, storage: "isolated" };
    projectEntries.value = [entry, ...projectEntries.value];
    await activateProject(entry);
    ElMessage.success("短剧项目已创建");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "创建短剧项目失败");
  } finally { busy.value = false; }
}

async function renameProject(entry: DramaProjectEntry) {
  const result = await ElMessageBox.prompt("输入新的项目名称", "重命名短剧项目", {
    inputValue: entry.project.name, confirmButtonText: "保存", cancelButtonText: "取消",
  }).catch(() => null);
  if (!result || !workspaceDirectory.value) return;
  busy.value = true;
  try {
    const renamed = await renameDramaProject(useWorkspaceFiles(workspaceDirectory.value), entry.project.id, result.value);
    const index = projectEntries.value.findIndex(item => item.project.id === entry.project.id);
    if (index >= 0) projectEntries.value[index] = renamed;
    if (project.value?.id === renamed.project.id) {
      project.value = renamed.project;
      manifestPath.value = renamed.path;
    }
    ElMessage.success("项目名称已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "重命名项目失败");
  } finally { busy.value = false; }
}

async function addSeason() {
  if (!project.value || !workspaceDirectory.value) return;
  const result = await ElMessageBox.prompt("请输入季度名称", "新增季度", {
    inputValue: "第" + (project.value.seasons.length + 1) + "季",
    confirmButtonText: "新增", cancelButtonText: "取消",
  }).catch(() => null);
  if (!result?.value.trim()) return;
  busy.value = true;
  try {
    const season = createSeason(project.value, result.value.trim(), 12);
    await saveDramaProject(useWorkspaceFiles(workspaceDirectory.value), project.value, manifestPath.value);
    const documentId = "season:" + season.id + ":outline";
    selectedDocumentId.value = documentId;
    await loadDocument(documentId);
    ElMessage.success("季度已新增");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "新增季度失败");
  } finally { busy.value = false; }
}

async function addEpisode(seasonId: string) {
  if (!project.value || !workspaceDirectory.value) return;
  busy.value = true;
  try {
    const episode = await createEpisode(useWorkspaceFiles(workspaceDirectory.value), project.value, seasonId, {}, manifestPath.value);
    const documentId = "episode:" + episode.id + ":script";
    selectedDocumentId.value = documentId;
    await loadDocument(documentId);
    ElMessage.success("分集已新增");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "新增分集失败");
  } finally { busy.value = false; }
}

async function selectDocument(documentId: string) {
  if (documentId === selectedDocumentId.value && !editing.value) return;
  if (!await confirmDiscard()) return;
  selectedDocumentId.value = documentId;
  await loadDocument(documentId);
}

async function loadDocument(documentId: string) {
  const value = project.value;
  const directory = workspaceDirectory.value;
  const info = getDocumentInfo(documentId);
  const requestId = ++documentRequestId;
  if (!value || !directory || !info) return;
  loadingDocument.value = true;
  editing.value = false;
  activeVersionId.value = "";
  documentFileState.value = undefined;
  try {
    const files = useWorkspaceFiles(directory);
    let content: string;
    if (info.kind === "storyOutline") content = value.storyOutline ?? "";
    else if (info.kind === "visualStyle") content = value.style ?? "";
    else if (info.kind === "episodeOutlines") {
      documentFileState.value = await readDocumentFile(files, info.path!, buildEpisodeOutlines(info.seasonId!));
      content = documentFileState.value.text;
    } else if (info.kind === "script") {
      content = await readEpisodeScript(files, value, info.episode!.id, manifestPath.value);
      const root = manifestPath.value.replace(/\/project\.json$/, "");
      const draftPath = info.episode!.draftPath ?? `${root}/scripts/${info.episode!.id}/draft.md`;
      documentFileState.value = await readDocumentFile(files, draftPath, content);
      if (!documentFileState.value.missing) content = documentFileState.value.text;
    } else {
      documentFileState.value = await readDocumentFile(files, info.path!, info.seed ?? "");
      content = documentFileState.value.text;
    }
    if (requestId !== documentRequestId || value !== project.value || directory !== workspaceDirectory.value) return;
    documentContent.value = content;
    loadedContent.value = content;
    documentStatus.value = content ? "已保存" : "尚无内容";
  } catch (error) {
    if (requestId === documentRequestId) {
      documentStatus.value = "读取失败";
      ElMessage.error(error instanceof Error ? error.message : "读取文档失败");
    }
  } finally {
    if (requestId === documentRequestId) loadingDocument.value = false;
  }
}

async function readDocumentFile(files: ReturnType<typeof useWorkspaceFiles>, path: string, fallback: string): Promise<DocumentFileState> {
  try {
    const snapshot = await files.readTextSnapshot(path);
    return { path, text: snapshot.text, revision: snapshot.revision, encoding: snapshot.encoding, missing: false };
  } catch (error) {
    if (isMissingError(error)) return { path, text: fallback, missing: true };
    throw error;
  }
}

function isMissingError(error: unknown) {
  return error instanceof Error && (/404|ENOENT|不存在/i.test(error.message) || (error as Error & { status?: number }).status === 404);
}

function getDocumentInfo(documentId: string): DocumentInfo | undefined {
  const value = project.value;
  if (!value) return;
  const root = manifestPath.value.replace(/\/project\.json$/, "");
  const sharedDocuments: Record<string, { title: string; file?: string; kind?: DocumentKind }> = {
    overview: { title: "项目概览", file: "overview.md" },
    storyOutline: { title: "故事大纲", kind: "storyOutline" },
    world: { title: "世界观", file: "world.md" },
    characters: { title: "人物设定", file: "characters.md" },
    characterRelations: { title: "人物关系", file: "characterRelations.md" },
    scenes: { title: "场景设定", file: "scenes.md" },
    props: { title: "道具设定", file: "props.md" },
    visualStyle: { title: "视觉风格", kind: "visualStyle" },
  };
  const shared = sharedDocuments[documentId];
  if (shared) {
    const kind = shared.kind ?? "markdown";
    return {
      id: documentId, title: shared.title, subtitle: "全剧设定", kind,
      path: shared.file ? root + "/documents/" + shared.file : undefined,
      seed: shared.file ? buildSharedSeed(documentId) : undefined,
      sourceHint: kind === "storyOutline" || kind === "visualStyle"
        ? "此文档保存到 project.json；画布下次打开时读取项目数据。已编辑的画布节点不会从 Markdown 自动覆盖。"
        : "此 Markdown 是阅读和编辑副本，保存不会改写 project.json 或画布。生产仍以 project.json 与原生画布节点为准；如需生效，请通过现有项目导入流程或外部 Codex 更新源数据。",
    };
  }
  const seasonMatch = documentId.match(/^season:([^:]+):(outline|episodes)$/);
  if (seasonMatch) {
    const season = value.seasons.find(item => item.id === seasonMatch[1]);
    if (!season) return;
    const isOutlines = seasonMatch[2] === "episodes";
    return {
      id: documentId, title: isOutlines ? "分集大纲" : "分季大纲", subtitle: season.name,
      kind: isOutlines ? "episodeOutlines" : "markdown", seasonId: season.id,
      path: root + "/documents/seasons/" + season.id + "/" + (isOutlines ? "episodeOutlines" : "outline") + ".md",
      sourceHint: isOutlines
        ? "保存会按 EP 序号更新 project.json 中的分集大纲；现有画布节点内容不会从 Markdown 自动覆盖。"
        : "此 Markdown 是独立阅读和编辑副本，保存不会改写 project.json 或画布；生产仍以项目数据和原生画布节点为准。",
    };
  }
  const episodeMatch = documentId.match(/^episode:([^:]+):(script|storyboard|imagePrompts|videoPrompts)$/);
  if (!episodeMatch) return;
  const episode = value.episodes.find(item => item.id === episodeMatch[1]);
  if (!episode) return;
  const season = value.seasons.find(item => item.id === episode.seasonId);
  const episodeLabel = "EP" + String(episode.number).padStart(3, "0") + " · " + episode.title;
  const kind = episodeMatch[2] as "script" | "storyboard" | "imagePrompts" | "videoPrompts";
  const titles = { script: "剧本正文", storyboard: "分镜脚本", imagePrompts: "生图提示词", videoPrompts: "视频提示词" };
  const fileNames = { storyboard: "storyboard.md", imagePrompts: "imagePrompts.md", videoPrompts: "videoPrompts.md" };
  return {
    id: documentId, title: titles[kind], subtitle: [season?.name, episodeLabel].filter(Boolean).join(" · "),
    kind: kind === "script" ? "script" : "markdown", episode,
    path: kind === "script" ? undefined : root + "/scripts/" + episode.id + "/" + fileNames[kind],
    sourceHint: kind === "script"
      ? "保存会更新剧本工作稿；生产画布读取 project.json 中已导入的剧本版本和结构。保存工作稿不会自动覆盖画布；需要更新源数据时使用现有新版本/导入流程，画布上已编辑的节点会保留。"
      : "此 Markdown 是独立提示词副本，画布与生成流程不会自动读取它。生产使用 project.json 和原生无限画布节点；修改本文件后请通过现有流程更新源数据，系统不会覆盖已编辑的画布节点。",
    seed: kind === "storyboard" ? buildStoryboard(episode)
      : kind === "imagePrompts" ? buildPromptDocument(episode, "imagePrompt")
        : kind === "videoPrompts" ? buildPromptDocument(episode, "videoPrompt") : undefined,
  };
}

function buildSharedSeed(documentId: string) {
  const value = project.value;
  if (!value) return "";
  if (documentId === "overview") {
    return [
      "# " + value.name,
      value.genre ? "\n**题材：** " + value.genre : "",
      value.style ? "\n**视觉风格：** " + value.style : "",
      value.storyOutline ? "\n## 故事大纲\n\n" + value.storyOutline : "",
    ].filter(Boolean).join("\n");
  }
  if (documentId === "characters") return buildCharacterSettings(value.characters);
  if (documentId === "scenes") return buildSceneSettings(value);
  if (documentId === "props") return buildAssetSettings(value.assets.filter(item => item.kind === "prop"), "道具设定");
  return "";
}

function buildCharacterSettings(characters: DramaCharacter[]) {
  const items = characters.filter(item => !item.archived);
  if (!items.length) return "";
  return ["# 人物设定", ...items.map(item => [
    "## " + (item.name || "未命名人物"),
    item.identity ? "**身份：** " + item.identity : "",
    item.description ? "\n" + item.description : "",
    item.appearance ? "\n**外观：** " + item.appearance : "",
    item.outfit ? "\n**服装：** " + item.outfit : "",
    item.visualFeatures?.length ? "\n**视觉特征：** " + item.visualFeatures.join("、") : "",
  ].filter(Boolean).join("\n"))].join("\n\n");
}

function buildSceneSettings(value: DramaProject) {
  const assets = value.assets.filter(item => item.kind === "scene");
  const scenes = value.episodes.flatMap(episode => episode.scenes.filter(item => !item.archived).map(scene => ({ episode, scene })));
  const assetText = assets.map(item => "## " + (item.name || "未命名场景") + "\n\n" + (item.description || ""));
  const sceneText = scenes.map(({ episode, scene }) => "## EP" + String(episode.number).padStart(3, "0") + " · " + (scene.heading || "未命名场景") + "\n\n" + (scene.environment || scene.description || ""));
  const items = [...assetText, ...sceneText];
  return items.length ? ["# 场景设定", ...items].join("\n\n") : "";
}

function buildAssetSettings(assets: DramaAsset[], title: string) {
  if (!assets.length) return "";
  return ["# " + title, ...assets.map(item => "## " + (item.name || "未命名道具") + "\n\n" + (item.description || ""))].join("\n\n");
}

function buildEpisodeOutlines(seasonId: string) {
  const value = project.value;
  const season = value?.seasons.find(item => item.id === seasonId);
  if (!value || !season) return "";
  return season.episodes.map(id => value.episodes.find(item => item.id === id))
    .filter((item): item is DramaEpisode => !!item)
    .map(item => "## EP" + String(item.number).padStart(3, "0") + " · " + item.title + "\n\n" + (item.outline || ""))
    .join("\n\n");
}

function buildStoryboard(episode: DramaEpisode) {
  const scenes = episode.scenes.filter(item => !item.archived).slice().sort((a, b) => (a.order ?? a.number) - (b.order ?? b.number));
  const shots = episode.shots.filter(item => !item.archived).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!scenes.length && !shots.length) return "";
  const sections = scenes.map(scene => {
    const sceneShots = shots.filter(item => item.sceneId === scene.id);
    return [
      "## 场次 " + String(scene.number).padStart(3, "0") + " · " + (scene.heading || "未命名场景"),
      scene.location ? "\n**地点：** " + scene.location : "",
      scene.environment || scene.description ? "\n" + (scene.environment || scene.description) : "",
      ...sceneShots.map(formatShot),
    ].filter(Boolean).join("\n\n");
  });
  const unassigned = shots.filter(shot => !scenes.some(scene => scene.id === shot.sceneId));
  return ["# " + episode.title + " · 分镜脚本", ...sections, ...unassigned.map(formatShot)].join("\n\n");
}

function formatShot(shot: DramaShot) {
  return [
    "### " + shot.number,
    shot.description ? "**画面：** " + shot.description : "",
    shot.action ? "**动作：** " + shot.action : "",
    shot.dialogue ? "**台词：** " + shot.dialogue : "",
    shot.sound ? "**声音：** " + shot.sound : "",
    "**时长：** " + shot.duration + " 秒",
  ].filter(Boolean).join("\n\n");
}

function buildPromptDocument(episode: DramaEpisode, key: "imagePrompt" | "videoPrompt") {
  const shots = episode.shots.filter(item => !item.archived && item[key]?.trim()).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!shots.length) return "";
  const title = key === "imagePrompt" ? "生图提示词" : "视频提示词";
  return ["# " + episode.title + " · " + title, ...shots.map(shot => "## " + shot.number + "\n\n" + shot[key])].join("\n\n");
}

function parseEpisodeOutlines(content: string, seasonId: string, target: DramaProject) {
  const season = target.seasons.find(item => item.id === seasonId);
  if (!season) throw new Error("季度不存在");
  const episodes = season.episodes.map(id => target.episodes.find(item => item.id === id)).filter((item): item is DramaEpisode => !!item);
  const headers = [...content.matchAll(/^##\s*EP(\d{3})\b[^\r\n]*(?:\r?\n|$)/gm)];
  if (!headers.length) throw new Error("请使用“## EP001 · 集名”标题按分集整理大纲，以便同步到分集资料");
  let matched = 0;
  headers.forEach((header, index) => {
    const episode = episodes.find(item => item.number === Number(header[1]));
    if (!episode) return;
    const start = header.index! + header[0].length;
    const end = headers[index + 1]?.index ?? content.length;
    episode.outline = content.slice(start, end).trim();
    matched++;
  });
  if (!matched) throw new Error("文档中的 EP 序号与当前季度分集不匹配");
}

async function loadVersion(versionId: string) {
  const info = documentInfo.value;
  const value = project.value;
  const directory = workspaceDirectory.value;
  if (!info || info.kind !== "script" || !value || !directory) return;
  const version = (value.scriptVersions[info.episode!.id] ?? []).find(item => item.id === versionId);
  if (!version || !await confirmDiscard()) return;
  loadingDocument.value = true;
  try {
    const content = await useWorkspaceFiles(directory).readText(version.path);
    if (value !== project.value || selectedDocumentId.value !== info.id) return;
    documentContent.value = content;
    loadedContent.value = content;
    editing.value = false;
    activeVersionId.value = version.id;
    documentStatus.value = "版本 V" + String(version.version).padStart(3, "0");
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "读取剧本版本失败"); }
  finally { loadingDocument.value = false; }
}

async function openVersion(versionId: string) { await loadVersion(versionId); }

function cancelEditing() {
  documentContent.value = loadedContent.value;
  editing.value = false;
}

async function saveDocument() {
  const info = documentInfo.value;
  const value = project.value;
  const directory = workspaceDirectory.value;
  if (!info || !value || !directory || savingDocument.value) return;
  savingDocument.value = true;
  try {
    const files = useWorkspaceFiles(directory);
    if (info.kind === "script") {
      const fileState = documentFileState.value;
      if (!fileState) throw new Error("文档修订信息已失效，请重新加载后再保存");
      await saveEpisodeDraft(files, value, info.episode!.id, documentContent.value, manifestPath.value,
        fileState.missing ? null : { revision: fileState.revision!, encoding: fileState.encoding! });
      documentFileState.value = await readDocumentFile(files, fileState.path, documentContent.value);
    } else if (info.kind === "storyOutline" || info.kind === "visualStyle" || info.kind === "episodeOutlines") {
      const next = cloneDramaProject(value);
      if (info.kind === "storyOutline") next.storyOutline = documentContent.value;
      else if (info.kind === "visualStyle") next.style = documentContent.value;
      else parseEpisodeOutlines(documentContent.value, info.seasonId!, next);
      if (info.path) documentFileState.value = await writeMarkdown(files, info.path, documentContent.value, documentFileState.value);
      await saveDramaProject(files, next, manifestPath.value);
      applyDramaProjectSnapshot(value, next);
    } else {
      documentFileState.value = await writeMarkdown(files, info.path!, documentContent.value, documentFileState.value);
    }
    loadedContent.value = documentContent.value;
    editing.value = false;
    activeVersionId.value = "";
    documentStatus.value = "已保存";
    ElMessage.success("文档已保存");
  } catch (error) {
    const responseMessage = (error as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message;
    ElMessage.error(typeof responseMessage === "string" ? responseMessage : error instanceof Error ? error.message : "保存文档失败");
  } finally { savingDocument.value = false; }
}

async function saveAsVersion() {
  const info = documentInfo.value;
  const value = project.value;
  const directory = workspaceDirectory.value;
  if (!info || info.kind !== "script" || !value || !directory || !documentContent.value.trim() || savingVersion.value) return;
  savingVersion.value = true;
  try {
    const files = useWorkspaceFiles(directory);
    const fileState = documentFileState.value;
    if (!fileState) throw new Error("剧本修订信息已失效，请重新加载后再保存");
    await saveEpisodeDraft(files, value, info.episode!.id, documentContent.value, manifestPath.value,
      fileState.missing ? null : { revision: fileState.revision!, encoding: fileState.encoding! });
    documentFileState.value = await readDocumentFile(files, fileState.path, documentContent.value);
    const version = await saveEpisodeScriptVersion(files, value, info.episode!.id, documentContent.value, manifestPath.value);
    loadedContent.value = documentContent.value;
    editing.value = false;
    activeVersionId.value = version.id;
    documentStatus.value = "版本 V" + String(version.version).padStart(3, "0") + " 已保存";
    ElMessage.success("剧本新版本 V" + String(version.version).padStart(3, "0") + " 已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存新版本失败");
  } finally { savingVersion.value = false; }
}

async function writeMarkdown(files: ReturnType<typeof useWorkspaceFiles>, path: string, content: string, fileState?: DocumentFileState): Promise<DocumentFileState> {
  if (!fileState || fileState.path !== path) throw new Error("文档修订信息已失效，请重新加载后再保存");
  const separator = path.lastIndexOf("/");
  await ensureDirectory(files, path.slice(0, separator));
  if (fileState.missing) await files.write(path, content, true);
  else await files.writeTextSnapshot(path, content, { revision: fileState.revision!, encoding: fileState.encoding! });
  const snapshot = await files.readTextSnapshot(path);
  if (snapshot.text !== content) throw new Error("文档写入后回读校验失败；文件已保留，请重新载入");
  return { path, text: snapshot.text, revision: snapshot.revision, encoding: snapshot.encoding, missing: false };
}

async function ensureDirectory(files: ReturnType<typeof useWorkspaceFiles>, path: string) {
  let current = "";
  for (const part of path.split("/").filter(Boolean)) {
    const entries = await files.list(current);
    const existing = entries.entries.find(item => item.name === part);
    current = current ? current + "/" + part : part;
    if (existing?.type === "directory") continue;
    if (existing) throw new Error("目标路径不是目录：" + current);
    await files.mkdir(current);
  }
}

async function openCanvasById(episodeId: string) {
  if (!await confirmDiscard() || !project.value) return;
  const episode = project.value.episodes.find(item => item.id === episodeId);
  const season = episode && project.value.seasons.find(item => item.id === episode.seasonId);
  if (!episode || !season) return;
  emit("openCanvas", {
    projectId: project.value.id,
    projectName: project.value.name,
    seasonId: season.id,
    seasonName: season.name,
    episodeId: episode.id,
    episodeNumber: episode.number,
    episodeTitle: episode.title,
    episodes: season.episodes.flatMap(id => {
      const item = project.value?.episodes.find(candidate => candidate.id === id);
      return item ? [{ id: item.id, number: item.number, title: item.title }] : [];
    }),
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" });
}
</script>

<style lang="scss" scoped>
.dramaCenter { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; overflow: hidden; color: var(--el-text-color-primary); background: var(--el-bg-color-page); }
.dramaHeader { z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 72px; padding: 12px 24px 12px 124px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-bg-color); }
.headerTitle { min-width: 0; h1 { margin: 0; font-size: 19px; font-weight: 600; } p { margin: 5px 0 0; overflow: hidden; color: var(--el-text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; } }
.headerActions { display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 8px; }
.loadingState { display: grid; width: min(840px, calc(100% - 40px)); gap: 18px; margin: 48px auto; }
.projectList { width: min(920px, calc(100% - 40px)); margin: 34px auto; padding: 24px; border: 1px solid var(--el-border-color-lighter); border-radius: 9px; background: var(--el-bg-color); }
.listHeading { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 20px; h2 { margin: 0; font-size: 18px; } p { margin: 6px 0 0; color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.6; } }
.projectCards { display: grid; gap: 9px; }
.projectCard { display: flex; align-items: center; gap: 12px; overflow: hidden; border: 1px solid var(--el-border-color-lighter); border-radius: 7px; background: var(--el-bg-color); &:hover { border-color: var(--el-color-primary-light-5); background: var(--el-fill-color-light); } }
.projectCardMain { display: grid; flex: 1; min-width: 0; gap: 6px; border: 0; padding: 14px 16px; color: inherit; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.projectCardName { overflow: hidden; font-size: 15px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.projectCardMeta { color: var(--el-text-color-secondary); font-size: 12px; }
.projectCardAction { display: flex; align-items: center; gap: 4px; margin-top: 2px; color: var(--el-color-primary); font-size: 12px; }
.renameButton { margin-inline-end: 12px; }
.projectSetup { width: min(720px, calc(100% - 40px)); margin: 36px auto; padding: 26px; border: 1px solid var(--el-border-color-lighter); border-radius: 9px; background: var(--el-bg-color); h2 { margin: 16px 0 24px; font-size: 19px; } }
.formRow { display: flex; gap: 16px; > * { flex: 1; min-width: 0; } }
.dramaLayout { display: grid; flex: 1; grid-template-columns: minmax(220px, var(--sidebar-width, 280px)) 8px minmax(0, 1fr); min-height: 0; }
.sidebarResizer { position: relative; z-index: 2; cursor: col-resize; touch-action: none; &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; } &::after { position: absolute; top: 0; bottom: 0; left: 3px; width: 2px; background: transparent; content: ""; } &:hover::after { background: var(--el-color-primary-light-5); } }
.dramaSidebarResizing { cursor: col-resize !important; user-select: none !important; }
.documentStage { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: var(--el-bg-color); :deep(.assistantPane) { position: absolute; inset-block: 0; right: 0; z-index: 5; width: 340px; max-width: calc(100% - 24px); box-shadow: -6px 0 22px rgb(0 0 0 / 8%); } :deep(.assistantPane.collapsed) { width: 44px; box-shadow: none; } }
@media (max-width: 760px) { .dramaHeader { align-items: flex-start; flex-direction: column; gap: 10px; padding: 12px 16px 12px 124px; } .headerActions { justify-content: flex-start; } .dramaLayout { grid-template-columns: minmax(190px, var(--sidebar-width, 220px)) 8px minmax(0, 1fr); } .projectList { margin: 20px auto; padding: 16px; } .listHeading { align-items: flex-start; flex-direction: column; } .formRow { flex-direction: column; gap: 0; } }
</style>
