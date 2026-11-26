import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import { useNode, useVueFlow } from "@vue-flow/core";
import { nodeTools, z } from "@toonflow/nodes-scaffold/nodeTools";
import { useNodePersistence, type NodePersistenceContext } from "@toonflow/nodes-scaffold/nodeDocument";
import type { NodeAudioRequest, NodeImageRequest, NodeMediaResult, NodeMediaTaskStatus, NodeVideoRequest, useNodeAi } from "@toonflow/nodes-scaffold/nodeAi";
import type { NodeOutputs } from "@toonflow/nodes-scaffold/values";
import { getUserFacingError, showNodeError } from "./showNodeError";

export type NodeGenerationTask = {
  taskId: string;
  directory: string;
  canvasPath: string;
  nodeId: string;
  mediaType: "image" | "video" | "audio";
  providerId: string;
  modelId: string;
  state: "submitting" | NonNullable<NodeMediaTaskStatus["state"]>;
  stage?: NodeMediaTaskStatus["stage"];
  providerStatus?: NodeMediaTaskStatus["providerStatus"];
  cloudEndConfirmed?: boolean;
  startedAt?: number;
  lastError?: string;
  lastErrorDetail?: string;
  resumable?: boolean;
  providerData?: unknown;
  recoveryData?: unknown;
  applied?: boolean;
};

type GenerationOptions = {
  ai: ReturnType<typeof useNodeAi>;
  recover?: (results: NodeMediaResult[], task: NodeGenerationTask, signal: AbortSignal) => Promise<NodeMediaResult[]>;
};

export function useNodeGeneration(outputs: Readonly<Ref<NodeOutputs>>, cancel: () => void, options?: GenerationOptions) {
  const { id, node } = useNode();
  const { findNode } = useVueFlow();
  const getPersistence = useNodePersistence();
  const savedData = computed(() => node.data as { mediaTask?: NodeGenerationTask });
  const lifetime = new AbortController();
  let executionController: AbortController | undefined;
  let recoveryController: AbortController | undefined;
  let recovering: Promise<void> | undefined;
  let attemptedTaskId = "";
  const executionStatus = ref<"idle" | "running" | "succeeded" | "failed">("idle");
  const status = computed(() => {
    if (executionStatus.value !== "idle") return executionStatus.value;
    const task = savedData.value.mediaTask;
    return task?.state === "succeeded" ? "succeeded" : task?.state === "failed" ? "failed" : "idle";
  });
  const error = ref("");
  const errorDetail = ref("");
  const now = ref(Date.now());
  const cancelling = ref(false);
  const generating = computed(() => executionStatus.value === "running");
  const taskId = computed(() => savedData.value.mediaTask?.taskId ?? "");
  const providerTaskId = computed(() => {
    const data = savedData.value.mediaTask?.providerData;
    return data && typeof data === "object" && "promptId" in data && typeof data.promptId === "string" ? data.promptId : "";
  });
  const elapsedSeconds = computed(() => generating.value ? Math.max(0, Math.floor((now.value - (savedData.value.mediaTask?.startedAt ?? now.value)) / 1000)) : 0);
  const generationStage = computed(() => {
    const stage = savedData.value.mediaTask?.stage;
    if (stage === "uploading") return "准备素材";
    if (stage === "submitting") return "提交任务";
    if (stage === "downloading") return "下载中";
    if (stage === "recovering") {
      if (savedData.value.mediaTask?.providerStatus === "running") return "生成中";
      if (savedData.value.mediaTask?.providerStatus === "queued") return "排队中";
      const data = savedData.value.mediaTask?.providerData;
      if (data && typeof data === "object" && "status" in data) {
        if (data.status === "running") return "生成中";
        if (data.status === "queued") return "排队中";
      }
      return "等待云端确认";
    }
    if (stage === "waiting") {
      if (savedData.value.mediaTask?.providerStatus === "running") return "生成中";
      if (savedData.value.mediaTask?.providerStatus === "queued") return "排队中";
      const data = savedData.value.mediaTask?.providerData;
      if (data && typeof data === "object" && "status" in data) {
        if (data.status === "running") return "生成中";
        if (data.status === "queued") return "排队中";
      }
      return "等待云端确认";
    }
    if (savedData.value.mediaTask?.providerStatus === "running") return "生成中";
    if (savedData.value.mediaTask?.providerStatus === "queued") return "排队中";
    return !savedData.value.mediaTask || savedData.value.mediaTask.state === "submitting" ? "准备素材" : "等待云端确认";
  });
  const generationError = computed(() => {
    const task = savedData.value.mediaTask;
    if (error.value) return error.value;
    if (task?.state === "failed") return `生成失败：${task.lastError || "云端返回了失败状态"}`;
    if (task?.state === "interrupted") return task.cloudEndConfirmed ? "" : task.lastError || "状态查询失败：云端状态暂时无法确认，请勿重复提交。";
    return task?.lastError || "";
  });
  const generationErrorDetail = computed(() => errorDetail.value || savedData.value.mediaTask?.lastErrorDetail || "");
  let elapsedTimer: ReturnType<typeof setInterval> | undefined;
  watch(generating, active => {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = active ? setInterval(() => { now.value = Date.now(); }, 1000) : undefined;
    now.value = Date.now();
  }, { immediate: true });
  const pendingRecovery = computed(() => !generating.value && needsRecovery());
  const cloudTaskAwaiting = computed(() => savedData.value.mediaTask?.providerId === "autodlComfyUi" && needsRecovery());
  const cloudTaskCanRequery = computed(() => cloudTaskAwaiting.value && savedData.value.mediaTask?.resumable === true);
  const cloudTaskNeedsManualConfirmation = computed(() => cloudTaskAwaiting.value && savedData.value.mediaTask?.state === "interrupted" && savedData.value.mediaTask.resumable === false);
  const taskMessage = computed(() => !cloudTaskAwaiting.value ? ""
    : savedData.value.mediaTask?.state === "succeeded"
      ? "AutoDL 任务已完成，重新查询可恢复视频结果。"
      : cloudTaskNeedsManualConfirmation.value
        ? "Toonflow 没有可查询的云端任务凭据，无法自动复查。请在 AutoDL 按提交时间核对；确认结束前会禁止重新提交。"
        : savedData.value.mediaTask?.state === "interrupted" || generationError.value
          ? "云端状态暂时无法确认，请勿重复提交。点击“重新查询云端状态”复查原任务。"
        : "AutoDL 云端任务尚未确认结束。停止按钮只结束 Toonflow 本地等待；请重新查询原任务，确认结束前不能重新提交。");
  const getStatus = () => ({ status: status.value, outputs: outputs.value, ...(generationError.value ? { error: generationError.value } : {}),
    ...(taskMessage.value ? { message: taskMessage.value } : {}),
    ...(savedData.value.mediaTask ? { task: { taskId: savedData.value.mediaTask.taskId, state: savedData.value.mediaTask.state, resumable: savedData.value.mediaTask.resumable } } : {}) });

  nodeTools.register({
    name: "getGenerationStatus",
    description: "查询节点生成或恢复状态（idle/running/succeeded/failed）、当前输出和最近一次错误。查询中断保留任务，下次生成操作优先复查已有任务，不会重复提交",
    parameters: z.strictObject({}),
    execute: getStatus,
  });
  nodeTools.register({
    name: "cancelGeneration",
    description: "停止当前生成等待。AutoDL 仅停止 Toonflow 本地轮询，云端任务可能仍在运行；须复查或明确确认云端任务结束后才能重新提交。其他供应商沿用现有取消流程。",
    parameters: z.strictObject({}),
    async execute() {
      const cancellationRequested = generating.value || needsRecovery();
      if (cancellationRequested) await cancelGeneration();
      return { ...getStatus(), cancellationRequested };
    },
  });

  function needsRecovery() {
    const task = savedData.value.mediaTask;
    // ACT: applied 仅在成功后释放任务；替换输出不能放弃仍可能已接单的任务。
    return !!task && task.state !== "failed" && task.state !== "cancelled"
      && !(task.state === "interrupted" && task.cloudEndConfirmed) && (task.state !== "succeeded" || !task.applied);
  }

  function checkTask(task: NodeGenerationTask, context: NodePersistenceContext) {
    lifetime.signal.throwIfAborted();
    if (task.state === "cancelled") throw new DOMException("生成已取消", "AbortError");
    if (findNode(id) !== node || savedData.value.mediaTask?.taskId !== task.taskId || task.directory !== context.directory || getPersistence?.()?.directory !== context.directory) {
      throw new Error("节点或工作区已变化，本次任务结果不再应用");
    }
  }

  function taskOptions(task: NodeGenerationTask, context: NodePersistenceContext, signal: AbortSignal) {
    return {
      taskId: task.taskId, nodeId: id, canvasPath: task.canvasPath,
      isCancelled: () => task.state === "cancelled",
      async onStatus(value: NodeMediaTaskStatus) {
        signal.throwIfAborted();
        checkTask(task, context);
        if (value.nodeId && value.nodeId !== id) throw new Error("生成任务不属于当前节点");
        if (value.canvasPath && value.canvasPath !== task.canvasPath) throw new Error("生成任务的原画布归属不一致");
        const before = JSON.stringify([task.state, task.resumable, task.providerStatus, task.providerData, task.stage, task.startedAt, task.lastError, task.lastErrorDetail]);
        if (value.state) task.state = value.state;
        if (value.stage) task.stage = value.stage;
        if (value.providerStatus) task.providerStatus = value.providerStatus;
        if (value.createdAt && !task.startedAt) task.startedAt = value.createdAt;
        if (value.state === "failed") task.lastError = value.result?.message || "生成失败";
        if (value.state === "failed" || (value.state === "interrupted" && value.result)) {
          task.lastError = value.result?.message || task.lastError || "云端状态暂时无法确认，请勿重复提交";
          const data = value.result?.data;
          if (data && typeof data === "object" && !Array.isArray(data) && typeof data.rawMessage === "string") task.lastErrorDetail = data.rawMessage;
        }
        if (value.state === "running") { task.lastError = ""; task.lastErrorDetail = ""; }
        if (value.resumable !== undefined) task.resumable = value.resumable;
        if (value.providerData !== undefined) task.providerData = value.providerData;
        if (before !== JSON.stringify([task.state, task.resumable, task.providerStatus, task.providerData, task.stage, task.startedAt, task.lastError, task.lastErrorDetail])) {
          const current = getPersistence?.();
          if (!current) throw new Error("画布已关闭，无法保存任务状态");
          await current.save(signal);
        }
        if (task.state === "interrupted" && task.resumable === false) {
          const nextStep = task.providerId === "autodlComfyUi"
            ? "Toonflow 没有可查询的云端任务凭据。请按提交时间在 AutoDL 核对；确认任务结束后，才能解除此节点的重复提交保护。"
            : "上次生成结果未知，可能已接单或扣费。请先核对供应商任务；如需重新生成，请点击“放弃任务”。";
          throw new Error([value.result?.message, nextStep].filter(Boolean).join("\n"));
        }
      },
    };
  }

  async function generate<T extends "image" | "video" | "audio">(mediaType: T, input: NodeImageRequest | NodeVideoRequest | NodeAudioRequest, signal: AbortSignal, recoveryData?: unknown) {
    if (!options) throw new Error("节点未提供媒体生成能力");
    if (needsRecovery()) throw new Error("当前节点仍有未确认的生成任务，请先复查或明确放弃此任务后再生成");
    const context = getPersistence?.();
    if (!context || context.directory !== input.directory) throw new Error("画布尚未就绪，无法保存生成任务");
    let task: NodeGenerationTask = {
      taskId: crypto.randomUUID(), directory: context.directory, canvasPath: context.canvasPath, nodeId: id,
      mediaType, providerId: input.providerId, modelId: input.modelId, state: "submitting", startedAt: Date.now(),
      ...(recoveryData === undefined ? {} : { recoveryData: JSON.parse(JSON.stringify(recoveryData)) }),
    };
    savedData.value.mediaTask = task;
    task = savedData.value.mediaTask;
    const waitingSignal = AbortSignal.any([lifetime.signal, signal]);
    try { await context.save(waitingSignal); }
    catch (error) { if (task.state !== "cancelled") task.state = "failed"; throw error; }
    signal.throwIfAborted();
    checkTask(task, context);
    const requestOptions = taskOptions(task, context, waitingSignal);
    try {
      const result = mediaType === "image" ? await options.ai.generateImage(input as NodeImageRequest, signal, requestOptions)
        : mediaType === "video" ? await options.ai.generateVideo(input as NodeVideoRequest, signal, requestOptions)
        : await options.ai.generateAudio(input as NodeAudioRequest, signal, requestOptions);
      checkTask(task, context);
      signal.throwIfAborted();
      return result as Extract<NodeMediaResult, { mediaType: T }>[];
    } catch (error) {
      // 只有明确拒绝接单的响应才能释放任务；断线、超时、冲突和 5xx 仍须先按 ID 复查。
      if (task.state === "submitting" && (error as { mediaTaskRejected?: boolean })?.mediaTaskRejected === true) {
        task.state = "failed";
        task.resumable = false;
        const current = getPersistence?.();
        if (current?.directory === context.directory && findNode(id) === node && savedData.value.mediaTask?.taskId === task.taskId) await current.save();
      }
      throw error;
    }
  }

  async function finish(signal: AbortSignal) {
    const task = savedData.value.mediaTask;
    if (!options || !task) return;
    const context = getPersistence?.();
    if (!context) throw new Error("画布已关闭，生成结果将在重新打开后恢复");
    checkTask(task, context);
    const applied = task.applied;
    task.applied = true;
    try { await context.save(signal); }
    catch (error) { task.applied = applied; throw error; }
  }

  async function execute<T>(action: () => Promise<T>): Promise<T> {
    if (cancelling.value) throw new Error("任务正在取消，请稍后重试");
    if (generating.value) throw new Error("节点正在生成，请等待完成");
    const controller = executionController = new AbortController();
    executionStatus.value = "running";
    now.value = Date.now();
    error.value = "";
    errorDetail.value = "";
    try {
      const result = await action();
      await finish(AbortSignal.any([lifetime.signal, controller.signal]));
      executionStatus.value = "succeeded";
      return result;
    } catch (failure) {
      const task = savedData.value.mediaTask;
      const cloudStatusUnknown = task?.providerId === "autodlComfyUi" && needsRecovery();
      executionStatus.value = cloudStatusUnknown ? "idle" : "failed";
      const friendlyError = getUserFacingError(failure, cloudStatusUnknown);
      errorDetail.value = task?.lastErrorDetail || friendlyError.detail;
      if (cloudStatusUnknown && task) {
        error.value = `状态查询失败：${friendlyError.message}`;
        task.lastError = error.value;
        task.lastErrorDetail = errorDetail.value;
        const current = getPersistence?.();
        if (current?.directory === task.directory && findNode(id) === node && savedData.value.mediaTask?.taskId === task.taskId) {
          try { await current.save(); }
          catch (saveError) { console.warn("保存云端状态查询错误详情失败", saveError); }
        }
      } else if (task?.state === "failed") {
        error.value = `生成失败：${task.lastError || friendlyError.message}`;
      } else {
        error.value = friendlyError.message;
      }
      throw failure;
    } finally {
      if (executionController === controller) executionController = undefined;
    }
  }

  function resume() {
    if (recovering) return recovering;
    const task = savedData.value.mediaTask;
    const context = getPersistence?.();
    if (!options || !task || !context || !needsRecovery()) return Promise.resolve();
    if (task.nodeId !== id || task.directory !== context.directory || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task.taskId)
      || !["image", "video", "audio"].includes(task.mediaType)) return Promise.reject(new Error("保存的生成任务归属无效，请放弃此任务后重新生成"));
    recoveryController = new AbortController();
    const signal = AbortSignal.any([lifetime.signal, recoveryController.signal]);
    recovering = execute(async () => {
      let results = await options.ai.resumeMedia(task.directory, task.taskId, signal, taskOptions(task, context, signal));
      checkTask(task, context);
      if (task.applied) return;
      if (options.recover) results = await options.recover(results, task, signal);
      signal.throwIfAborted();
      checkTask(task, context);
      const result = results[0];
      if (!result || result.mediaType !== task.mediaType) throw new Error("生成任务未返回对应的媒体结果");
      if (result.mediaType === "image") outputs.value.image = { dataType: "IMAGE", value: { url: result.path, mimeType: result.mimeType } };
      else if (result.mediaType === "video") outputs.value.video = { dataType: "VIDEO", value: { url: result.path, mimeType: result.mimeType } };
      else outputs.value.audio = { dataType: "AUDIO", value: { url: result.path, mimeType: result.mimeType } };
    }).finally(() => { recovering = undefined; recoveryController = undefined; });
    return recovering;
  }

  async function run(action: () => Promise<void>) {
    if (needsRecovery()) return resume();
    return execute(action);
  }

  async function cancelGeneration(persist = true) {
    if (cancelling.value) throw new Error("任务正在取消，请稍后重试");
    cancelling.value = true;
    let localSaveError: unknown;
    try {
      const originalTask = savedData.value.mediaTask;
      const originalContext = getPersistence?.();
      if (options && originalTask && needsRecovery()) {
        if (!originalContext) throw new Error("工作区已变化，无法取消此节点任务");
        const current = getPersistence?.();
        if (savedData.value.mediaTask?.taskId === originalTask.taskId && current?.directory === originalContext.directory && findNode(id) === node) {
          if (originalTask.providerId === "autodlComfyUi") {
            if (!["succeeded", "failed", "cancelled"].includes(originalTask.state)) originalTask.state = "interrupted";
            if (persist) {
              try { await current.save(); }
              catch (error) { localSaveError = error; }
            }
          } else {
            // ACT: 项目移动后的旧任务仅在当前节点放弃，不请求原目录的后台任务。
            if (originalTask.directory === originalContext.directory) await options.ai.cancelMedia(originalTask.directory, originalTask.taskId);
            const { state, resumable } = originalTask;
            originalTask.state = "cancelled";
            originalTask.resumable = false;
            try { if (persist) await current.save(); }
            catch (error) { originalTask.state = state; originalTask.resumable = resumable; throw error; }
          }
        }
      }
      recoveryController?.abort();
      executionController?.abort();
      await cancel();
      await recovering?.catch(() => {});
      const currentTask = savedData.value.mediaTask;
      const currentContext = getPersistence?.();
      if (options && currentTask?.providerId === "autodlComfyUi" && currentTask.directory === currentContext?.directory) {
        const stopped = await options.ai.stopWaitingMedia(currentTask.directory, currentTask.taskId);
        if (savedData.value.mediaTask?.taskId === currentTask.taskId && currentContext && getPersistence?.()?.directory === currentContext.directory) {
          currentTask.state = stopped.state ?? "interrupted";
          currentTask.resumable = stopped.resumable;
          if (stopped.providerData !== undefined) currentTask.providerData = stopped.providerData;
          await currentContext.save();
          localSaveError = undefined;
        }
        error.value = taskMessage.value;
      }
      if (localSaveError) throw localSaveError;
    } finally {
      cancelling.value = false;
    }
  }

  watch(() => getPersistence?.()?.canvasPath, path => {
    const task = savedData.value.mediaTask;
    if (!path || !options || !task || generating.value || !needsRecovery() || attemptedTaskId === task.taskId) return;
    attemptedTaskId = task.taskId;
    void resume().catch(error => {
      if (!lifetime.signal.aborted) showNodeError(generationError.value || error, "生成任务恢复失败", { detail: generationErrorDetail.value });
    });
  }, { immediate: true, flush: "post" });
  watch(outputs, () => {
    // 保留用户替换或编辑的输出；未决任务仍须复查完成或明确放弃，不能借此重新提交。
    if (!generating.value && needsRecovery() && savedData.value.mediaTask) savedData.value.mediaTask.applied = true;
  }, { deep: true, flush: "sync" });
  onScopeDispose(() => { lifetime.abort(); if (elapsedTimer) clearInterval(elapsedTimer); });

  async function confirmCloudTaskEnded() {
    const task = savedData.value.mediaTask;
    const context = getPersistence?.();
    if (!task || task.providerId !== "autodlComfyUi" || task.state !== "interrupted" || task.resumable !== false || !context) {
      throw new Error("当前 AutoDL 任务还不能确认结束，请先复查任务状态");
    }
    task.cloudEndConfirmed = true;
    task.applied = true;
    await context.save();
    error.value = "";
    errorDetail.value = "";
  }

  return { generating, pendingRecovery, cancelling, cloudTaskAwaiting, cloudTaskCanRequery, cloudTaskNeedsManualConfirmation, taskMessage,
    generationStage, generationError, generationErrorDetail, elapsedSeconds, taskId, providerTaskId, status, run, generate, resume, cancel: cancelGeneration, confirmCloudTaskEnded };
}
