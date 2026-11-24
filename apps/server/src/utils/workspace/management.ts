import { lstat, readFile, readdir, realpath, rm } from "@toonflow/file";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { Request } from "express";
import { hasActiveAgentRun } from "@/agent/runtime/sessions";
import { hasActiveTasks } from "@/utils/media/tasks";
import { hasActiveWorkspaceGeneration, getWorkspaceRoot, lockWorkspaceDeletion, resolveWorkspace } from "@/utils/workspace";
import { lockWorkspaceFiles } from "@/utils/workspace/files";

function samePath(left: string, right: string) {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isWithin(root: string, path: string) {
  const offset = relative(root, path);
  return offset === "" || (offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset));
}

async function resolveManagedWorkspace(req: Request, workspaceId: string, requestedDirectory: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(workspaceId)) {
    throw Object.assign(new Error("工作区 ID 无效，请刷新首页后重试"), { status: 400 });
  }
  if (!isAbsolute(requestedDirectory)) throw Object.assign(new Error("工作区目录必须是绝对路径"), { status: 400 });
  const root = await getWorkspaceRoot(req);
  const candidate = resolve(requestedDirectory);
  if (samePath(candidate, root) || !samePath(dirname(candidate), root)) {
    throw Object.assign(new Error("只能删除服务器工作区根目录下的单个工作区，不能删除根目录或其他位置"), { status: 403 });
  }
  const requested = await resolveWorkspace(req, candidate);
  const info = await lstat(candidate);
  if (!info.isDirectory() || info.isSymbolicLink()) throw Object.assign(new Error("工作区必须是普通目录，不能通过符号链接删除"), { status: 403 });
  if (!samePath(requested, candidate)) throw Object.assign(new Error("工作区实际路径与请求路径不一致"), { status: 403 });
  return { workspaceId, directory: requested, root, identity: { dev: info.dev, ino: info.ino } };
}

async function hasNestedMount(directory: string) {
  const mountInfo = await readFile("/proc/self/mountinfo", "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  for (const line of mountInfo.split("\n")) {
    const mountPoint = line.split(" ")[4]?.replace(/\\([0-7]{3})/g, (_match, code: string) => String.fromCharCode(Number.parseInt(code, 8)));
    if (mountPoint && isWithin(directory, resolve(mountPoint))) return true;
  }
  return false;
}

async function getWorkspaceContentCounts(directory: string) {
  let canvases = 0;
  let assets = 0;
  const dramaProjects = new Set<string>();
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop()!;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (!info.isFile()) continue;
      const pathFromWorkspace = relative(directory, path).replaceAll("\\", "/");
      if (/^assets\//i.test(pathFromWorkspace)) assets++;
      if (/^\.toonflow\/drama\/projects\/[^/]+\/project\.json$/i.test(pathFromWorkspace)) dramaProjects.add(pathFromWorkspace.split("/")[3]!);
      if (/^\.toonflow\/drama\/project\.json$/i.test(pathFromWorkspace)) dramaProjects.add("legacy");
      if (/\.json$/i.test(entry.name)) {
        try {
          const value = JSON.parse((await readFile(path, "utf8")).toString()) as { toonflowCanvas?: unknown };
          if (value.toonflowCanvas === true) canvases++;
        } catch { /* Non-canvas or malformed JSON does not count as a canvas. */ }
      }
    }
  }
  return { dramas: dramaProjects.size, canvases, assets };
}

async function isWorkspaceBusy(directory: string) {
  return hasActiveWorkspaceGeneration(directory) || await hasActiveAgentRun(directory) || await hasActiveTasks(directory);
}

export async function getWorkspaceDeletionSummary(req: Request, workspaceId: string, requestedDirectory: string) {
  const workspace = await resolveManagedWorkspace(req, workspaceId, requestedDirectory);
  const [counts, busy] = await Promise.all([getWorkspaceContentCounts(workspace.directory), isWorkspaceBusy(workspace.directory)]);
  return { workspaceId: workspace.workspaceId, directory: workspace.directory, name: basename(workspace.directory), counts, busy };
}

export async function removeManagedWorkspace(req: Request, workspaceId: string, requestedDirectory: string) {
  const workspace = await resolveManagedWorkspace(req, workspaceId, requestedDirectory);
  const releaseDeletion = lockWorkspaceDeletion(workspace.directory);
  try {
    const releaseFiles = lockWorkspaceFiles([workspace.directory]);
    try {
      if (await isWorkspaceBusy(workspace.directory)) {
        throw Object.assign(new Error("工作区正在执行生成或 Agent 任务，请等待任务结束后再删除"), { status: 409, code: "EWORKSPACEBUSY" });
      }
      if (await hasNestedMount(workspace.directory)) {
        throw Object.assign(new Error("工作区内存在独立挂载目录，为避免误删其他数据，已拒绝删除"), { status: 409 });
      }
      const info = await lstat(workspace.directory);
      const actual = await realpath(workspace.directory);
      if (!info.isDirectory() || info.isSymbolicLink() || !samePath(actual, workspace.directory)
        || info.dev !== workspace.identity.dev || info.ino !== workspace.identity.ino
        || !samePath(dirname(actual), workspace.root)) {
        throw Object.assign(new Error("工作区目录在确认期间发生变化，已拒绝删除"), { status: 409 });
      }
      await rm(workspace.directory, { recursive: true });
    } finally { releaseFiles(); }
  } finally { releaseDeletion(); }
  return { workspaceId: workspace.workspaceId };
}
