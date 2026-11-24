import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";
import type { AgentAttachment } from "@/components/agent/types";

export type Project = {
  id: string;
  directory: string;
  name: string;
  lastOpenedAt: number;
};

type ProjectState = { project: Project | null; projectList: Project[] };

function directoryIdentity(directory: string) {
  const normalized = directory.replaceAll("\\", "/").replace(/\/+$/, "");
  return /^[a-z]:\//i.test(normalized) ? normalized.toLocaleLowerCase() : normalized;
}

function projectId(value: unknown, usedIds: Set<string>) {
  const id = typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)
    && !usedIds.has(value) ? value : crypto.randomUUID();
  usedIds.add(id);
  return id;
}

function normalizeProjectState(state: ProjectState) {
  const usedIds = new Set<string>();
  const directories = new Set<string>();
  const normalized: Project[] = [];
  for (const stored of Array.isArray(state.projectList) ? state.projectList : []) {
    if (!stored || typeof stored.directory !== "string" || !stored.directory) continue;
    const identity = directoryIdentity(stored.directory);
    if (directories.has(identity)) continue;
    directories.add(identity);
    normalized.push({
      id: projectId(stored.id, usedIds),
      directory: stored.directory,
      name: typeof stored.name === "string" && stored.name.trim()
        ? stored.name.trim() : stored.directory.split(/[\\/]/).filter(Boolean).at(-1) || stored.directory,
      lastOpenedAt: Number.isFinite(stored.lastOpenedAt) ? stored.lastOpenedAt : 0,
    });
  }
  const selectedDirectory = state.project?.directory ? directoryIdentity(state.project.directory) : "";
  let selected = normalized.find(item => directoryIdentity(item.directory) === selectedDirectory) ?? null;
  if (!selected && state.project?.directory) {
    selected = {
      id: projectId(state.project.id, usedIds),
      directory: state.project.directory,
      name: state.project.name?.trim() || state.project.directory.split(/[\\/]/).filter(Boolean).at(-1) || state.project.directory,
      lastOpenedAt: Number.isFinite(state.project.lastOpenedAt) ? state.project.lastOpenedAt : 0,
    };
    normalized.unshift(selected);
  }
  state.projectList = normalized;
  state.project = selected;
}

export const useWorkspaceStore = defineStore("workspace", () => {
  const project = ref<Project | null>(null);
  const projectList = ref<Project[]>([]);
  const projectLoading = ref(false);
  const projectLoadingDrawn = ref(false);
  const projectLoadingVisible = ref(false);
  const pendingAgentMessage = ref<{ directory: string; prompt: string; attachments?: AgentAttachment[]; model: string; reasoningEffort: string } | null>(null);

  async function refreshProjectList(signal?: AbortSignal) {
    const { data } = await axios.get<{ code: number; data?: { directories: { name: string; path: string }[]; absolutePath: string }; message?: string }>("/api/workspaces/list", {
      headers: { "x-toonflow-workspace": "1" }, signal,
    });
    signal?.throwIfAborted();
    if (data.code !== 200 || !data.data?.absolutePath || !Array.isArray(data.data.directories)) throw new Error(data.message || "读取工作区列表失败");
    const knownDirectories = new Set(projectList.value.map(item => directoryIdentity(item.directory)));
    const additions: Project[] = [];
    for (const entry of data.data.directories) {
      const directory = `${data.data.absolutePath.replace(/[\\/]+$/, "")}/${entry.path}`;
      const identity = directoryIdentity(directory);
      if (knownDirectories.has(identity)) continue;
      knownDirectories.add(identity);
      additions.push({ id: crypto.randomUUID(), directory, name: entry.name, lastOpenedAt: 0 });
    }
    if (additions.length) projectList.value = [...projectList.value, ...additions];
    return additions;
  }

  async function addProject(path: string, name?: string, signal?: AbortSignal, previousDirectory = path) {
    const { data } = await axios.get<{ code: number; data?: { directory: string }; message?: string }>("/api/workspaces/check", {
      params: { directory: path }, headers: { "x-toonflow-workspace": "1" }, signal,
    });
    signal?.throwIfAborted();
    if (data.code !== 200 || !data.data?.directory) throw new Error(data.message || "工作目录校验失败");
    const checkedDirectory = data.data.directory;
    const previousIdentity = directoryIdentity(previousDirectory);
    const checkedIdentity = directoryIdentity(checkedDirectory);
    const existing = projectList.value.find(project => directoryIdentity(project.directory) === previousIdentity)
      ?? projectList.value.find(project => directoryIdentity(project.directory) === checkedIdentity);
    const added = { id: existing?.id ?? crypto.randomUUID(), directory: checkedDirectory, name: name?.trim() || existing?.name || checkedDirectory.split(/[\\/]/).filter(Boolean).at(-1) || checkedDirectory, lastOpenedAt: Date.now() };
    projectList.value = [
      added,
      ...projectList.value.filter(item => item.id !== added.id && directoryIdentity(item.directory) !== previousIdentity && directoryIdentity(item.directory) !== checkedIdentity),
    ];
    return added;
  }

  async function openProject(path: string, previousDirectory = path, signal?: AbortSignal) {
    project.value = await addProject(path, undefined, signal, previousDirectory);
    pendingAgentMessage.value = null;
  }

  function renameProject(id: string, name: string) {
    const target = projectList.value.find(item => item.id === id);
    if (!target || !name.trim()) return;
    target.name = name.trim();
    if (project.value?.id === id) project.value = target;
  }

  function removeProject(id: string) {
    projectList.value = projectList.value.filter(item => item.id !== id);
    if (project.value?.id === id) project.value = null;
  }

  return { project, projectList, projectLoading, projectLoadingDrawn, projectLoadingVisible, pendingAgentMessage, refreshProjectList, addProject, openProject, renameProject, removeProject };
}, {
  persist: {
    key: "toonflow.projectList",
    pick: ["project", "projectList"],
    afterHydrate: ({ store }) => {
      normalizeProjectState(store.$state as ProjectState);
      store.$persist();
    },
  },
});
