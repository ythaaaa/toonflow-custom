/// <reference path="../../types.d.ts" />

type ComfyInputMapping = { nodeId: string; input: string };
type ComfyWorkflowModel = ProviderModel & {
  zealmanWorkflowId?: string;
  zealmanInputs?: Record<string, unknown>;
  comfyWorkflow?: Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }>;
  comfyMapping?: {
    prompt?: ComfyInputMapping;
    image?: ComfyInputMapping;
    referenceImages?: ComfyInputMapping[];
    referenceVideos?: ComfyInputMapping[];
    referenceAudios?: ComfyInputMapping[];
    firstFrame?: ComfyInputMapping;
    lastFrame?: ComfyInputMapping;
    width?: ComfyInputMapping;
    height?: ComfyInputMapping;
    resolution?: ComfyInputMapping;
    aspectRatio?: ComfyInputMapping;
    megapixels?: ComfyInputMapping;
    upscale?: ComfyInputMapping;
    duration?: ComfyInputMapping;
    fps?: ComfyInputMapping;
    durationUnit?: "seconds" | "frames";
    frameRate?: number;
    outputNodeIds?: string[];
  };
};

const u17WorkflowId = "API-U17-9图1视频3音频V1-api";

type ComfyTaskData = {
  kind: "autodlComfyUi";
  promptId: string;
  model: string;
  baseUrlHash: string;
  status: string;
  protocol?: "zealman";
};

const rules: ProviderFormRule[] = [
  {
    type: "input",
    field: "baseUrl" as const,
    title: "服务地址",
    value: "",
    props: { placeholder: "AutoDL 映射地址，例如 http://公网地址:6008", clearable: true },
  },
  {
    type: "select",
    field: "authType" as const,
    title: "API 鉴权",
    value: "none",
    options: [
      { label: "无需鉴权（ComfyUI 默认）", value: "none" },
      { label: "Bearer Token", value: "bearer" },
      { label: "Basic Auth", value: "basic" },
      { label: "自定义请求头", value: "header" },
    ],
  },
  {
    type: "input",
    field: "authToken" as const,
    title: "鉴权令牌",
    value: "",
    props: { type: "password", showPassword: true, autocomplete: "off" },
  },
  {
    type: "input",
    field: "authHeaderName" as const,
    title: "自定义请求头名称",
    value: "X-API-Key",
    props: { placeholder: "X-API-Key" },
  },
  {
    type: "input",
    field: "authUsername" as const,
    title: "Basic Auth 用户名",
    value: "",
    props: { autocomplete: "username" },
  },
  {
    type: "input",
    field: "authPassword" as const,
    title: "Basic Auth 密码",
    value: "",
    props: { type: "password", showPassword: true, autocomplete: "current-password" },
  },
];

const version = "1.1.0";
function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function serviceUrl(context: ProviderContext) {
  const raw = typeof context.config.baseUrl === "string" ? context.config.baseUrl.trim() : "";
  if (!raw) throw new Error("请在「设置 → 媒体模型」中填写 AutoDL 映射的服务地址");
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error("服务地址必须是有效的 HTTP/HTTPS 地址"); }
  if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error("服务地址只接受不含凭据、查询参数和片段的 HTTP/HTTPS 地址");
  }
  return raw.replace(/\/+$/, "");
}

function headers(context: ProviderContext) {
  const result = new Headers({ Accept: "application/json" });
  const authType = typeof context.config.authType === "string" ? context.config.authType : "none";
  const token = typeof context.config.authToken === "string" ? context.config.authToken.trim() : "";
  if (authType === "bearer" && token) result.set("Authorization", `Bearer ${token}`);
  else if (authType === "basic") {
    const username = typeof context.config.authUsername === "string" ? context.config.authUsername : "";
    const password = typeof context.config.authPassword === "string" ? context.config.authPassword : "";
    if (!username || !password) throw new Error("Basic Auth 需要填写用户名和密码");
    result.set("Authorization", `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`);
  } else if (authType === "header" && token) {
    const name = typeof context.config.authHeaderName === "string" ? context.config.authHeaderName.trim() : "";
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) throw new Error("自定义鉴权请求头名称无效");
    result.set(name, token);
  } else if (!["none", "bearer", "basic", "header"].includes(authType)) throw new Error("API 鉴权方式无效");
  return result;
}

function jsonObject(value: unknown, label: string) {
  const result = record(value);
  if (!result) throw new Error(`${label}格式错误`);
  return result;
}

async function jsonResponse(response: Response, label: string, context: ProviderContext) {
  if (!response.ok) {
    const message = context.tool.errorMessage(await response.text().catch(() => ""));
    throw new Error(`${label}失败（HTTP ${response.status}）${message ? `：${message}` : ""}`);
  }
  try { return await response.json(); }
  catch { throw new Error(`${label}返回的不是有效 JSON`); }
}

function validateWorkflow(value: unknown): Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }> {
  const workflow = record(value);
  if (!workflow || Array.isArray(workflow.nodes) || "links" in workflow || !Object.keys(workflow).length || Object.keys(workflow).length > 5000) {
    throw new Error("工作流不是 ComfyUI API 格式；请导出以节点 ID 为键、包含 class_type 和 inputs 的 API JSON");
  }
  const result: Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }> = {};
  for (const [nodeId, value] of Object.entries(workflow)) {
    const node = record(value);
    const inputs = record(node?.inputs);
    if (!/^\d+$/.test(nodeId) || typeof node?.class_type !== "string" || !node.class_type || !inputs) {
      throw new Error(`API 工作流节点 ${nodeId} 缺少 class_type 或 inputs`);
    }
    const meta = record(node._meta);
    result[nodeId] = { class_type: node.class_type, inputs, ...(typeof meta?.title === "string" ? { _meta: { title: meta.title } } : {}) };
  }
  return result;
}

function mappedInput(workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }>, mapping: ComfyInputMapping | undefined, field: string) {
  if (!mapping) return;
  const node = workflow[mapping.nodeId];
  if (!node || !Object.hasOwn(node.inputs, mapping.input)) throw new Error(`工作流的${field}映射已失效，请重新选择节点参数`);
  const value = node.inputs[mapping.input];
  if (Array.isArray(value) || (value && typeof value === "object")) throw new Error(`工作流的${field}映射指向了连线输入，请改选可编辑的节点参数`);
  return { node, key: mapping.input, value };
}

function setMappedInput(workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }>, mapping: ComfyInputMapping | undefined,
  field: string, value: string | number) {
  const target = mappedInput(workflow, mapping, field);
  if (!target) return;
  target.node.inputs[target.key] = typeof target.value === "number" ? Number(value) : String(value);
}

function videoPrompt(prompt: string) {
  return prompt.replace(/\{\{ref (\d+)\}\}/g, (_, index: string) => `参考 ${index}`);
}

function outputFiles(history: Record<string, unknown>, outputNodeIds: string[] | undefined) {
  const outputs = record(history.outputs);
  if (!outputs) return [];
  const selected = outputNodeIds?.length ? new Set(outputNodeIds) : undefined;
  const files: { filename: string; subfolder: string; type: string }[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 8 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1); return; }
    const item = value as Record<string, unknown>;
    if (typeof item.filename === "string") {
      const extension = item.filename.split(".").pop()?.toLowerCase();
      if (["mp4", "webm", "mov", "mkv", "avi", "gif"].includes(extension ?? "")) {
        files.push({ filename: item.filename, subfolder: typeof item.subfolder === "string" ? item.subfolder : "", type: typeof item.type === "string" ? item.type : "output" });
      }
      return;
    }
    for (const [key, child] of Object.entries(item)) if (["videos", "gifs", "files", "video"].includes(key)) visit(child, depth + 1);
  };
  for (const [nodeId, output] of Object.entries(outputs)) if (!selected || selected.has(nodeId)) visit(output);
  return files;
}

function wait(signal: AbortSignal, milliseconds: number) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function requestSignal(context: ProviderContext, timeout = 30000) {
  const timeoutSignal = AbortSignal.timeout(timeout);
  return context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;
}

async function requestJson(context: ProviderContext, url: string, label: string, init: RequestInit = {}) {
  const response = await context.tool.fetch(url, { ...init, headers: new Headers([...headers(context), ...new Headers(init.headers)]), signal: init.signal ?? requestSignal(context), redirect: "error" });
  return jsonResponse(response, label, context);
}

async function checkQueue(context: ProviderContext, promptId: string) {
  const result = jsonObject(await requestJson(context, `${serviceUrl(context)}/queue`, "查询 ComfyUI 队列", { signal: requestSignal(context, 15000) }), "ComfyUI 队列");
  for (const [key, state] of [["queue_running", "running"], ["queue_pending", "queued"]] as const) {
    const queue = Array.isArray(result[key]) ? result[key] as unknown[] : [];
    if (queue.some(item => Array.isArray(item) ? item[1] === promptId
      : record(item)?.prompt_id === promptId || record(item)?.id === promptId)) return state;
  }
  return "waiting";
}

function historyEntry(value: unknown, promptId: string) {
  const data = jsonObject(value, "ComfyUI 历史记录");
  const entry = record(data[promptId]);
  if (entry) return entry;
  return record(record(data.history)?.[promptId]);
}

function failureMessage(entry: Record<string, unknown>, context: ProviderContext) {
  const status = record(entry.status);
  const messages = Array.isArray(status?.messages) ? status.messages : [];
  const details = context.tool.errorMessage(messages);
  return details || "ComfyUI 工作流执行失败，请检查工作流节点错误";
}

async function pollTask(context: ProviderContext, task: ComfyTaskData, model: ComfyWorkflowModel | undefined) {
  if (!context.signal) throw new Error("AutoDL ComfyUI 任务恢复缺少取消信号");
  const baseUrl = serviceUrl(context);
  if (String(context.tool.hash(baseUrl)) !== task.baseUrlHash) throw new Error("AutoDL 服务地址已变更，请恢复原服务地址后查询此任务");
  const signal = requestSignal(context, 30 * 60_000);
  let lastStatus = task.status;
  while (true) {
    signal.throwIfAborted();
    const history = historyEntry(await requestJson(context, `${baseUrl}/history/${encodeURIComponent(task.promptId)}`, "查询 ComfyUI 任务", { signal: requestSignal(context, 30000) }), task.promptId);
    if (history) {
      const status = record(history.status);
      const state = String(status?.status_str ?? status?.state ?? "").toLowerCase();
      if (state === "error" || state === "failed" || state === "failure") {
        throw Object.assign(new Error(failureMessage(history, context)), { code: "MEDIA_TASK_FAILED" });
      }
      const files = outputFiles(history, model?.comfyMapping?.outputNodeIds);
      const complete = status?.completed === true || ["success", "succeeded", "completed"].includes(state) || (!state && files.length > 0);
      if (complete) {
        if (!files.length) throw Object.assign(new Error("ComfyUI 任务已完成，但所选输出节点没有返回视频文件"), { code: "MEDIA_TASK_FAILED" });
        const assets: MediaAsset[] = [];
        for (const file of files) {
          signal.throwIfAborted();
          const params = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder, type: file.type });
          const response = await context.tool.fetch(`${baseUrl}/view?${params}`, { headers: headers(context), signal: requestSignal(context, 180000), redirect: "error" });
          if (!response.ok) {
            const message = context.tool.errorMessage(await response.text().catch(() => ""));
            throw new Error(`下载 ComfyUI 视频失败（HTTP ${response.status}）${message ? `：${message}` : ""}`);
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (!bytes.length) throw new Error("ComfyUI 返回了空视频文件");
          assets.push({ type: "binary", data: bytes, mimeType: response.headers.get("content-type")?.split(";")[0] || videoMimeType(file.filename), mediaType: "video" });
        }
        return assets;
      }
    }
    const state = await checkQueue(context, task.promptId);
    if (state !== lastStatus) {
      lastStatus = state;
      task.status = state;
      await context.saveTaskData?.(task);
    }
    await wait(signal, 2000);
  }
}

function videoMimeType(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension === "webm" ? "video/webm" : extension === "mov" ? "video/quicktime" : "video/mp4";
}

function dimensions(resolution: string | undefined, ratio: string | undefined) {
  const longEdge = Number(/^(\d{3,4})p?$/i.exec(resolution ?? "")?.[1]);
  const [, widthValue, heightValue] = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/.exec(ratio ?? "16:9") ?? [];
  const ratioWidth = Number(widthValue);
  const ratioHeight = Number(heightValue);
  if (!Number.isFinite(longEdge) || longEdge <= 0 || !Number.isFinite(ratioWidth) || !Number.isFinite(ratioHeight) || !ratioWidth || !ratioHeight) return undefined;
  const scale = longEdge / Math.min(ratioWidth, ratioHeight);
  return { width: Math.round(ratioWidth * scale / 8) * 8, height: Math.round(ratioHeight * scale / 8) * 8 };
}

function defaultMediaName(input: MediaInput, mediaType: "image" | "video" | "audio", mimeType: string) {
  const extension = mimeType.split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg").replace("mpeg", "mp3")
    || (mediaType === "image" ? "png" : mediaType === "video" ? "mp4" : "wav");
  return typeof input.name === "string" && input.name ? input.name : `reference-${Date.now()}.${extension}`;
}

function mediaBytes(input: MediaInput, context: ProviderContext, signal: AbortSignal, mediaType: "image" | "video" | "audio") {
  const mimeType = input.mimeType || (mediaType === "image" ? "image/png" : mediaType === "video" ? "video/mp4" : "audio/wav");
  const name = defaultMediaName(input, mediaType, mimeType);
  if (input.type === "binary") return Promise.resolve({ bytes: new Uint8Array(input.data), name, mimeType });
  if (input.type === "base64") {
    const data = input.data.replace(/^data:[^;]+;base64,/, "");
    return Promise.resolve({ bytes: new Uint8Array(Buffer.from(data, "base64")), name, mimeType });
  }
  return context.tool.fetch(input.url, { signal }).then(async response => {
    if (!response.ok) throw new Error(`读取 Zealman ${mediaType}参考素材失败（HTTP ${response.status}）`);
    return { bytes: new Uint8Array(await response.arrayBuffer()), name, mimeType: response.headers.get("content-type")?.split(";")[0] || mimeType };
  });
}

async function uploadImage(context: ProviderContext, input: MediaInput, baseUrl: string, signal: AbortSignal) {
  const source = await mediaBytes(input, context, signal, "image");
  if (!source.bytes.length || source.bytes.byteLength > 100 * 1024 * 1024) throw new Error("图生视频参考图为空或超过 100 MB");
  const form = new FormData();
  const blobBytes = new ArrayBuffer(source.bytes.byteLength);
  new Uint8Array(blobBytes).set(source.bytes);
  form.set("image", new Blob([blobBytes], { type: source.mimeType }), source.name);
  const response = await context.tool.fetch(`${baseUrl}/upload/image`, { method: "POST", headers: headers(context), body: form, signal: requestSignal(context, 120000), redirect: "error" });
  const result = jsonObject(await jsonResponse(response, "上传图生视频参考图", context), "ComfyUI 图片上传结果");
  if (typeof result.name !== "string" || !result.name) throw new Error("ComfyUI 图片上传未返回文件名");
  return [typeof result.subfolder === "string" && result.subfolder ? `${result.subfolder}/` : "", result.name].join("");
}

async function uploadZealmanMedia(context: ProviderContext, input: MediaInput, baseUrl: string, signal: AbortSignal, mediaType: "image" | "video" | "audio") {
  await context.reportStage?.("uploading");
  const source = await mediaBytes(input, context, signal, mediaType);
  if (!source.bytes.length || source.bytes.byteLength > 100 * 1024 * 1024) throw new Error(`Zealman ${mediaType}参考素材为空或超过 100 MB`);
  const form = new FormData();
  const buffer = new ArrayBuffer(source.bytes.byteLength);
  new Uint8Array(buffer).set(source.bytes);
  form.set("file", new Blob([buffer], { type: source.mimeType }), source.name);
  const result = jsonObject(await requestJson(context, `${baseUrl}/api/comfy/upload/file`, `上传 Zealman ${mediaType}参考素材`, {
    method: "POST", body: form, signal: requestSignal(context, 120000),
  }), "Zealman 文件上传结果");
  if (result.success === false) throw new Error(`Zealman 文件上传失败：${context.tool.errorMessage(result.error)}`);
  const data = record(result.data) ?? result;
  if (typeof data.name !== "string" || !data.name) throw new Error("Zealman 文件上传结果没有返回 name");
  return data.name;
}

function setZealmanInput(values: Record<string, unknown>, mapping: ComfyInputMapping | undefined, field: string, value: string | number) {
  if (!mapping) return;
  if (mapping.nodeId !== "input_values" || !Object.hasOwn(values, mapping.input)) throw new Error(`Zealman 工作流的${field}映射已失效`);
  const original = values[mapping.input];
  if (original !== null && typeof original !== "string" && typeof original !== "number") throw new Error(`Zealman 工作流的${field}参数不是可编辑的字符串或数字`);
  const converted = typeof original === "number" ? Number(value) : String(value);
  if (typeof converted === "number" && !Number.isFinite(converted)) throw new Error(`Zealman 工作流的${field}参数需要数字，请检查参数映射`);
  values[mapping.input] = converted;
}

async function pollZealmanTask(context: ProviderContext, task: ComfyTaskData) {
  if (!context.signal) throw new Error("AutoDL ComfyUI 任务恢复缺少取消信号");
  const baseUrl = serviceUrl(context);
  if (String(context.tool.hash(baseUrl)) !== task.baseUrlHash) throw new Error("AutoDL 服务地址已变更，请恢复原服务地址后查询此任务");
  await context.reportStage?.("waiting");
  const signal = requestSignal(context, 30 * 60_000);
  while (true) {
    signal.throwIfAborted();
    const result = jsonObject(await requestJson(context, `${baseUrl}/api/workflow/result?prompt_id=${encodeURIComponent(task.promptId)}`, "查询 Zealman 任务", {
      signal: requestSignal(context, 30000),
    }), "Zealman 任务结果");
    if (result.success === false || ["failed", "failure", "error"].includes(String(result.status ?? "").toLowerCase())) {
      throw Object.assign(new Error(context.tool.errorMessage(result.error ?? result.message) || "Zealman 工作流执行失败"), { code: "MEDIA_TASK_FAILED" });
    }
    const video = Array.isArray(result.results) ? result.results.map(record).find(item => item?.type === "video" && typeof item.url === "string") : undefined;
    if (video) {
      await context.reportStage?.("downloading");
      const url = new URL(String(video.url), `${baseUrl}/`);
      if (!/^https?:$/.test(url.protocol)) throw new Error("Zealman 视频地址不是 HTTP/HTTPS 地址");
      const response = await context.tool.fetch(url.toString(), {
        headers: url.origin === new URL(baseUrl).origin ? headers(context) : undefined,
        signal: requestSignal(context, 180000), redirect: "error",
      });
      if (!response.ok) throw new Error(`下载 Zealman 视频失败（HTTP ${response.status}）`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length) throw new Error("Zealman 返回了空视频文件");
      return [{ type: "binary", data: bytes, mimeType: response.headers.get("content-type")?.split(";")[0] || videoMimeType(url.pathname), mediaType: "video" }] satisfies MediaAsset[];
    }
    if (result.pending === false || ["success", "succeeded", "completed"].includes(String(result.status ?? "").toLowerCase())) {
      throw Object.assign(new Error("Zealman 任务已结束，但没有返回视频文件"), { code: "MEDIA_TASK_FAILED" });
    }
    if (task.status !== "running") {
      task.status = "running";
      await context.saveTaskData?.(task);
    }
    await wait(signal, 2000);
  }
}

async function submitZealman(context: ProviderContext, request: VideoRequest, model: ComfyWorkflowModel) {
  const baseUrl = serviceUrl(context);
  const workflowId = model.zealmanWorkflowId?.trim();
  const values = record(model.zealmanInputs);
  if (!workflowId || !values) throw new Error("Zealman 工作流缺少 workflow_id 或 input_values，请重新导入");
  const inputValues = JSON.parse(JSON.stringify(values)) as Record<string, unknown>;
  const mapping = model.comfyMapping ?? {};
  const hasPromptInput = Object.hasOwn(inputValues, "prompt");
  if (!mapping.prompt) throw new Error("请配置有效的正向提示词映射");
  if (mapping.prompt.nodeId !== "input_values" || !Object.hasOwn(inputValues, mapping.prompt.input)
    || typeof inputValues[mapping.prompt.input] !== "string") throw new Error("Zealman 工作流的提示词映射已失效");
  if (workflowId === u17WorkflowId && (!hasPromptInput || mapping.prompt.input !== "prompt")) throw new Error("U17 工作流必须包含并映射 input_values.prompt");
  if (mapping.prompt && !request.prompt.trim()) throw new Error("请填写视频提示词");
  const hasTypedReferenceMapping = !!mapping.referenceVideos?.length || !!mapping.referenceAudios?.length
    || !!request.videos?.length || !!request.audios?.length;
  const references = hasTypedReferenceMapping ? selectedZealmanReferences(request, mapping, inputValues) : undefined;
  const images = references ? [] : selectedImages(request, mapping);
  const allReferences = references ?? images.map(reference => ({ ...reference, mediaType: "image" as const }));
  for (const { field, target } of allReferences) {
    if (target.nodeId !== "input_values" || !Object.hasOwn(inputValues, target.input)
      || typeof inputValues[target.input] !== "string") {
      throw new Error(`Zealman 工作流的${field}映射不是有效的参考素材输入参数`);
    }
  }
  const signal = requestSignal(context, 30 * 60_000);
  for (const { field, input, target, mediaType } of allReferences) {
    setZealmanInput(inputValues, target, field, await uploadZealmanMedia(context, input, baseUrl, signal, mediaType));
  }
  if (mapping.prompt) setZealmanInput(inputValues, mapping.prompt, "提示词",
    workflowId === u17WorkflowId ? request.prompt : videoPrompt(request.prompt.trim()));
  const ratio = typeof request.other?.aspectRatio === "string" ? request.other.aspectRatio : request.ratio;
  const size = dimensions(request.resolution, ratio);
  if (size) {
    setZealmanInput(inputValues, mapping.width, "宽度", size.width);
    setZealmanInput(inputValues, mapping.height, "高度", size.height);
  }
  if (request.resolution) {
    const resolutionValue = mapping.resolution && typeof inputValues[mapping.resolution.input] === "number"
      ? Number(/^(\d{3,4})p?$/i.exec(request.resolution)?.[1]) : request.resolution;
    setZealmanInput(inputValues, mapping.resolution, "分辨率", resolutionValue);
  }
  if (request.duration) {
    if (mapping.duration && !mapping.durationUnit) throw new Error("Zealman 时长映射缺少单位，请按实际工作流配置");
    if (mapping.durationUnit === "frames" && (!mapping.frameRate || !Number.isFinite(mapping.frameRate) || mapping.frameRate <= 0)) {
      throw new Error("Zealman 帧数映射缺少实际帧率");
    }
    const duration = mapping.durationUnit === "frames" ? Math.round(request.duration * mapping.frameRate!) : request.duration;
    setZealmanInput(inputValues, mapping.duration, "时长", duration);
  }
  if (request.other?.aspectRatio !== undefined) setZealmanInput(inputValues, mapping.aspectRatio, "画幅比例", String(request.other.aspectRatio));
  if (request.other?.megapixels !== undefined) setZealmanInput(inputValues, mapping.megapixels, "生成像素量", Number(request.other.megapixels));
  if (request.other?.upscale !== undefined) setZealmanInput(inputValues, mapping.upscale, "放大倍率", Number(request.other.upscale));
  if (mapping.frameRate) setZealmanInput(inputValues, mapping.fps, "帧率", mapping.frameRate);
  await context.reportStage?.("submitting");
  const result = jsonObject(await requestJson(context, `${baseUrl}/api/workflow/generate`, "提交 Zealman 工作流", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow_id: workflowId, input_values: inputValues }),
    signal: requestSignal(context, 120000),
  }), "Zealman 提交结果");
  if (result.success === false) throw new Error(`Zealman 拒绝了工作流：${context.tool.errorMessage(result.error ?? result.message)}`);
  if (typeof result.prompt_id !== "string" || !result.prompt_id) throw new Error("Zealman 未返回 prompt_id");
  const task: ComfyTaskData = { kind: "autodlComfyUi", protocol: "zealman", promptId: result.prompt_id,
    model: request.model, baseUrlHash: String(context.tool.hash(baseUrl)), status: "queued" };
  await context.saveTaskData?.(task);
  return pollZealmanTask(context, task);
}

function referenceLimit(mode: VideoRequest["mode"], mediaType: "image" | "video" | "audio") {
  if (!Array.isArray(mode)) return 0;
  const value = mode.find(item => item.startsWith(`${mediaType}Reference:`))?.split(":")[1];
  const count = Number(value ?? 0);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function selectedZealmanReferences(request: VideoRequest, mapping: ComfyWorkflowModel["comfyMapping"], values: Record<string, unknown>) {
  const references: { field: string; input: MediaInput; target: ComfyInputMapping; mediaType: "image" | "video" | "audio" }[] = [];
  const categories = [
    { mediaType: "image" as const, inputs: request.images ?? [], targets: mapping?.referenceImages ?? [] },
    { mediaType: "video" as const, inputs: request.videos ?? [], targets: mapping?.referenceVideos ?? [] },
    { mediaType: "audio" as const, inputs: request.audios ?? [], targets: mapping?.referenceAudios ?? [] },
  ];
  const mappedTargets = categories.flatMap(category => category.targets.map(target => `${target.nodeId}::${target.input}`));
  if (new Set(mappedTargets).size !== mappedTargets.length) throw new Error("图片、视频和音频不能映射到同一个 Zealman 工作流参数");
  for (const category of categories) {
    const limit = referenceLimit(request.mode, category.mediaType);
    if (category.inputs.length > limit) throw new Error(`当前混合参考模式最多支持 ${limit} 个${category.mediaType}参考素材，实际有 ${category.inputs.length} 个`);
    if (category.targets.length < limit) throw new Error(`当前工作流缺少全部 ${category.mediaType}参考参数映射，请重新导入工作流`);
    for (const target of category.targets) {
      if (target.nodeId !== "input_values" || !Object.hasOwn(values, target.input)
        || (values[target.input] !== null && typeof values[target.input] !== "string")) {
        throw new Error(`Zealman 工作流的${category.mediaType}参考参数映射无效`);
      }
      // ACT: imported input_values may contain example file names; clear every mapped slot before filling only supplied media.
      setZealmanInput(values, target, `${category.mediaType}参考素材`, "");
    }
    category.inputs.forEach((input, index) => {
      const target = category.targets[index];
      if (!target) throw new Error(`当前工作流没有配置第 ${index + 1} 个${category.mediaType}参考参数映射`);
      references.push({ field: `${category.mediaType}参考素材 ${index + 1}`, input, target, mediaType: category.mediaType });
    });
  }
  if (mapping?.prompt && mappedTargets.includes(`${mapping.prompt.nodeId}::${mapping.prompt.input}`)) {
    throw new Error("参考素材与提示词不能映射到同一个 Zealman 工作流参数");
  }
  return references;
}

function selectedImages(request: VideoRequest, mapping: ComfyWorkflowModel["comfyMapping"]) {
  const images: { field: string; input: MediaInput; target: ComfyInputMapping }[] = [];
  const append = (field: string, input: MediaInput | undefined, target: ComfyInputMapping | undefined) => {
    if (!input) throw new Error(`当前模式缺少必填的${field}，请在画布中添加图片`);
    if (!target) throw new Error(`当前工作流没有配置「${field}」节点映射`);
    images.push({ field, input, target });
  };
  const mode = request.mode;
  if (Array.isArray(mode)) {
    const count = Number(mode.find(item => item.startsWith("imageReference:"))?.split(":")[1] ?? 0);
    const supplied = request.images ?? [];
    if (!count && supplied.length) throw new Error("当前混合参考模式没有启用图片参考");
    if (count && supplied.length < count) throw new Error(`当前模式需要 ${count} 张参考图，实际只有 ${supplied.length} 张，请补齐图片`);
    if (supplied.length > count) throw new Error(`当前模式最多支持 ${count} 张参考图，实际有 ${supplied.length} 张`);
    for (let index = 0; index < count; index++) append(`参考图 ${index + 1}`, supplied[index], mapping?.referenceImages?.[index]);
  } else if (mode === "singleImage") {
    if ((request.images?.length ?? 0) !== 1) throw new Error("单图参考模式需要恰好 1 张参考图");
    append("单张参考图", request.images![0], mapping?.image);
  } else if (["startEndRequired", "endFrameOptional", "startFrameOptional"].includes(String(mode))) {
    if (mode === "startEndRequired" || mode === "endFrameOptional") append("首帧", request.firstFrame, mapping?.firstFrame);
    else if (request.firstFrame) append("首帧", request.firstFrame, mapping?.firstFrame);
    if (mode === "startEndRequired" || mode === "startFrameOptional") append("尾帧", request.lastFrame, mapping?.lastFrame);
    else if (request.lastFrame) append("尾帧", request.lastFrame, mapping?.lastFrame);
  } else if ((request.images?.length ?? 0) || request.firstFrame || request.lastFrame) throw new Error("文生视频模式不能传入参考图片");
  const targets = images.map(({ target }) => `${target.nodeId}::${target.input}`);
  if (new Set(targets).size !== targets.length) throw new Error("图片映射目标重复，请为每张参考图选择不同的工作流参数");
  if (mapping?.prompt && targets.includes(`${mapping.prompt.nodeId}::${mapping.prompt.input}`)) {
    throw new Error("图片与提示词不能映射到同一个工作流参数");
  }
  return images;
}

async function submit(context: ProviderContext, request: VideoRequest, model: ComfyWorkflowModel) {
  const baseUrl = serviceUrl(context);
  const workflow = validateWorkflow(model.comfyWorkflow);
  const mapping = model.comfyMapping ?? {};
  const promptTarget = mappedInput(workflow, mapping.prompt, "提示词");
  if (!promptTarget) throw new Error("请先在工作流模型中配置提示词节点映射");
  if (!request.prompt.trim()) throw new Error("请输入视频提示词");
  const signal = requestSignal(context, 30 * 60_000);
  const images = selectedImages(request, mapping);
  for (const { field, target } of images) mappedInput(workflow, target, field);
  for (const { field, input, target } of images) {
    const uploaded = await uploadImage(context, input, baseUrl, signal);
    setMappedInput(workflow, target, field, uploaded);
  }
  setMappedInput(workflow, mapping.prompt, "提示词", videoPrompt(request.prompt.trim()));

  const size = dimensions(request.resolution, request.ratio);
  if (mapping.width && size) setMappedInput(workflow, mapping.width, "宽度", size.width);
  if (mapping.height && size) setMappedInput(workflow, mapping.height, "高度", size.height);
  if (mapping.resolution && request.resolution) setMappedInput(workflow, mapping.resolution, "分辨率", request.resolution);
  if (mapping.duration && request.duration) {
    const fps = mapping.frameRate && Number.isFinite(mapping.frameRate) ? mapping.frameRate : 24;
    const duration = mapping.durationUnit === "frames" ? Math.round(request.duration * fps) : request.duration;
    setMappedInput(workflow, mapping.duration, "时长", duration);
  }
  if (mapping.fps && mapping.frameRate) setMappedInput(workflow, mapping.fps, "帧率", mapping.frameRate);

  const response = await requestJson(context, `${baseUrl}/prompt`, "提交 ComfyUI 工作流", {
    method: "POST",
    headers: new Headers([...headers(context), ["Content-Type", "application/json"]]),
    body: JSON.stringify({ prompt: workflow }),
    signal: requestSignal(context, 120000),
  });
  const result = jsonObject(response, "ComfyUI 提交结果");
  if (typeof result.prompt_id !== "string" || !result.prompt_id) throw new Error("ComfyUI 未返回 prompt_id");
  if (result.node_errors && typeof result.node_errors === "object" && Object.keys(result.node_errors as object).length) {
    throw Object.assign(new Error(context.tool.errorMessage(result.node_errors) || "ComfyUI 拒绝了工作流"), { mediaTaskRejected: true });
  }
  const task: ComfyTaskData = {
    kind: "autodlComfyUi", promptId: result.prompt_id, model: request.model,
    baseUrlHash: String(context.tool.hash(baseUrl)), status: "queued",
  };
  await context.saveTaskData?.(task);
  return pollTask(context, task, model);
}

export default {
  id: "autodlComfyUi",
  label: "AutoDL ComfyUI",
  icon: "",
  version,
  readme: `AutoDL 自租 GPU 实例上的 ComfyUI API 接入，不使用 AutoDL.Art 工作流云端 API。

在 AutoDL 启动 Zealman ComfyUI v9.50 等支持 API 的模板，映射 ComfyUI 端口（常用 6008），将外部 HTTP/HTTPS 地址填入服务地址。ComfyUI 默认无需 API 鉴权；使用反向代理鉴权时可选 Bearer、Basic Auth 或自定义请求头。

在媒体模型设置中导入 ComfyUI 的「导出（API）」JSON，或含 workflow_id 与 input_values 的 Zealman JSON。普通界面工作流 JSON（含 nodes、links、widgets_values）不能直接提交。导入后按实际工作流选择提示词、图像、尺寸、时长等参数映射及生成模式，不根据参数名猜测含义。Zealman 会按 ref_image_N、ref_video_N 和 ref_audio_N 参数顺序映射混合参考素材，并通过上传接口返回的 name 传入工作流。

原生工作流使用 ComfyUI HTTP API：/upload/image、/prompt、/queue、/history/{prompt_id} 和 /view。Zealman 工作流导入包含 workflow_id 与 input_values 的 JSON，明确选择参数映射后使用 /api/workflow/generate 与 /api/workflow/result。两种模式都通过现有媒体任务流程写入当前工作区素材目录。`,
  rules,
  models: [],

  async testConnection(this: ProviderContext) {
    const baseUrl = serviceUrl(this);
    const models = (this as ProviderContext & { models?: ComfyWorkflowModel[] }).models ?? [];
    const zealmanModels = models.filter(model => typeof model.zealmanWorkflowId === "string" && model.zealmanWorkflowId.trim());
    if (zealmanModels.length) {
      const response = await this.tool.fetch(`${baseUrl}/api/workflow/list`, {
        headers: headers(this), signal: requestSignal(this, 10000), redirect: "error",
      });
      const result = jsonObject(await jsonResponse(response, "连接 Zealman 工作流 API", this), "Zealman 工作流列表");
      if (result.success !== true || !Array.isArray(result.workflows)) {
        throw new Error("Zealman 工作流 API 返回格式无效；请确认地址指向 Zealman API");
      }
      const availableIds = new Set(result.workflows.map(record).flatMap(workflow =>
        typeof workflow?.id === "string" ? [workflow.id] : []));
      const missingIds = [...new Set(zealmanModels.map(model => model.zealmanWorkflowId!.trim()))]
        .filter(workflowId => !availableIds.has(workflowId));
      if (missingIds.length) throw new Error(`Zealman API 可访问，但未找到已配置工作流：${missingIds.join("、")}`);
      return `连接成功，Zealman 工作流 API 可访问（已确认 ${new Set(zealmanModels.map(model => model.zealmanWorkflowId!.trim())).size} 个配置工作流）`;
    }

    const response = await this.tool.fetch(`${baseUrl}/system_stats`, {
      headers: headers(this), signal: requestSignal(this, 10000), redirect: "error",
    });
    if (!response.ok) {
      const message = this.tool.errorMessage(await response.text().catch(() => ""));
      throw new Error(`连接 AutoDL ComfyUI 失败（HTTP ${response.status}）${message ? `：${message}` : ""}`);
    }
    try { await response.json(); }
    catch { throw new Error("已连接服务，但 /system_stats 未返回有效 JSON；请确认地址指向 ComfyUI API"); }
    return "连接成功，ComfyUI API 可访问";
  },

  async generateVideo(this: ProviderContext, request: VideoRequest) {
    const model = (this as ProviderContext & { models: ComfyWorkflowModel[] }).models.find(item => item.id === request.model && item.type === "video");
    if (!model) throw new Error("AutoDL ComfyUI 工作流不存在，请在媒体模型设置中重新导入");
    if (!model.zealmanWorkflowId && (request.videos?.length || request.audios?.length)) throw new Error("当前原生 ComfyUI 工作流仅支持提示词和图片参考");
    if (!model.mode?.some(mode => JSON.stringify(mode) === JSON.stringify(request.mode))) {
      throw new Error("当前工作流未启用所选生成模式");
    }
    return model.zealmanWorkflowId ? submitZealman(this, request, model) : submit(this, request, model);
  },

  async resumeTask(this: ProviderContext, value: ProviderTaskData) {
    const task = value as unknown as ComfyTaskData;
    if (task.kind !== "autodlComfyUi" || typeof task.promptId !== "string" || !task.promptId || typeof task.model !== "string"
      || typeof task.baseUrlHash !== "string" || typeof task.status !== "string") {
      throw new Error("AutoDL ComfyUI 任务恢复数据无效，请确认实例地址与原任务一致");
    }
    const models = (this as ProviderContext & { models: ComfyWorkflowModel[] }).models;
    const model = models.find(item => item.id === task.model && item.type === "video");
    return task.protocol === "zealman" ? pollZealmanTask(this, task) : pollTask(this, task, model);
  },
} satisfies ProviderDefinition<typeof rules> & { testConnection: (this: ProviderContext) => Promise<string> };
