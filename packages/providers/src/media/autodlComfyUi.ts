/// <reference path="../../types.d.ts" />

type ComfyInputMapping = { nodeId: string; input: string };
type ComfyWorkflowModel = ProviderModel & {
  comfyWorkflow?: Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }>;
  comfyMapping?: {
    prompt?: ComfyInputMapping;
    image?: ComfyInputMapping;
    firstFrame?: ComfyInputMapping;
    lastFrame?: ComfyInputMapping;
    width?: ComfyInputMapping;
    height?: ComfyInputMapping;
    resolution?: ComfyInputMapping;
    duration?: ComfyInputMapping;
    fps?: ComfyInputMapping;
    durationUnit?: "seconds" | "frames";
    frameRate?: number;
    outputNodeIds?: string[];
  };
};

type ComfyTaskData = {
  kind: "autodlComfyUi";
  promptId: string;
  model: string;
  baseUrlHash: string;
  status: string;
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

const version = "1.0.0";
const readme = `AutoDL 自租 GPU 实例上的 ComfyUI API 接入，不使用 AutoDL.Art 工作流云端 API。

在 AutoDL 启动 Zealman ComfyUI v9.50 等支持 API 的模板，映射 ComfyUI 端口（常用 6008），将外部 HTTP/HTTPS 地址填入服务地址。ComfyUI 默认无需 API 鉴权；使用反向代理鉴权时可选 Bearer、Basic Auth 或自定义请求头。

先在「编辑模型」中导入 ComfyUI 的「导出（API）」JSON。普通界面工作流 JSON（含 nodes、links、widgets_values）不能直接用于 API。导入后为工作流选择提示词、图像输入、宽高/分辨率、时长和输出节点映射，再设置节点支持的生成模式、时长与分辨率。

生成使用 ComfyUI HTTP API：/upload/image、/prompt、/queue、/history/{prompt_id} 和 /view。ComfyUI 任务完成后，Toonflow 会下载视频并由现有媒体任务流程写入当前工作区素材目录。`;

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
  const longEdge = Number(/^(\d{3,4})p$/i.exec(resolution ?? "")?.[1]);
  const [ratioWidth, ratioHeight] = (ratio ?? "16:9").split(":").map(Number);
  if (!Number.isFinite(longEdge) || longEdge <= 0 || !Number.isFinite(ratioWidth) || !Number.isFinite(ratioHeight) || !ratioWidth || !ratioHeight) return undefined;
  const scale = longEdge / Math.min(ratioWidth, ratioHeight);
  return { width: Math.round(ratioWidth * scale / 8) * 8, height: Math.round(ratioHeight * scale / 8) * 8 };
}

function imageBytes(input: MediaInput, context: ProviderContext, signal: AbortSignal): Promise<{ bytes: Uint8Array; name: string; mimeType: string }> {
  const name = typeof input.name === "string" && input.name ? input.name : `reference-${Date.now()}.png`;
  const mimeType = input.mimeType || "image/png";
  if (input.type === "binary") return Promise.resolve({ bytes: new Uint8Array(input.data), name, mimeType });
  if (input.type === "base64") {
    const data = input.data.replace(/^data:[^;]+;base64,/, "");
    return Promise.resolve({ bytes: new Uint8Array(Buffer.from(data, "base64")), name, mimeType });
  }
  return context.tool.fetch(input.url, { signal }).then(async response => {
    if (!response.ok) throw new Error(`读取图生视频参考图失败（HTTP ${response.status}）`);
    return { bytes: new Uint8Array(await response.arrayBuffer()), name, mimeType: response.headers.get("content-type")?.split(";")[0] || mimeType };
  });
}

async function uploadImage(context: ProviderContext, input: MediaInput, baseUrl: string, signal: AbortSignal) {
  const source = await imageBytes(input, context, signal);
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

function selectedImages(request: VideoRequest, mapping: ComfyWorkflowModel["comfyMapping"]) {
  const images: { field: "image" | "firstFrame" | "lastFrame"; input: MediaInput }[] = [];
  if (request.firstFrame) images.push({ field: "firstFrame", input: request.firstFrame });
  if (request.lastFrame) images.push({ field: "lastFrame", input: request.lastFrame });
  if (request.images?.length) {
    if (request.images.length > 1) throw new Error("当前 ComfyUI 映射支持单张参考图或首尾帧，请减少输入图片或调整工作流");
    images.push({ field: "image", input: request.images[0]! });
  }
  for (const { field } of images) if (!mapping?.[field]) throw new Error(`当前工作流没有配置「${field === "firstFrame" ? "首帧" : field === "lastFrame" ? "尾帧" : "参考图片"}」节点映射`);
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
  for (const { field, input } of images) {
    const uploaded = await uploadImage(context, input, baseUrl, signal);
    setMappedInput(workflow, mapping[field], field, uploaded);
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

const provider = {
  id: "autodlComfyUi",
  label: "AutoDL ComfyUI",
  icon: "",
  version,
  readme,
  rules,
  models: [],

  async testConnection(this: ProviderContext) {
    const response = await this.tool.fetch(`${serviceUrl(this)}/system_stats`, {
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
    if (request.videos?.length || request.audios?.length) throw new Error("当前 AutoDL ComfyUI 工作流仅支持提示词和图片参考");
    if (typeof request.mode !== "string" || !model.mode?.flatMap(mode => Array.isArray(mode) ? mode : [mode]).includes(request.mode)) {
      throw new Error("当前工作流未启用所选生成模式");
    }
    return submit(this, request, model);
  },

  async resumeTask(this: ProviderContext, value: ProviderTaskData) {
    const task = value as unknown as ComfyTaskData;
    if (task.kind !== "autodlComfyUi" || typeof task.promptId !== "string" || !task.promptId || typeof task.model !== "string"
      || typeof task.baseUrlHash !== "string" || typeof task.status !== "string") {
      throw new Error("AutoDL ComfyUI 任务恢复数据无效，请确认实例地址与原任务一致");
    }
    const models = (this as ProviderContext & { models: ComfyWorkflowModel[] }).models;
    const model = models.find(item => item.id === task.model && item.type === "video");
    return pollTask(this, task, model);
  },
} satisfies ProviderDefinition<typeof rules> & { testConnection: (this: ProviderContext) => Promise<string> };

export default provider;
