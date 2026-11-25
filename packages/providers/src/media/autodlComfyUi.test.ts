import { describe, expect, it } from "bun:test";
import provider from "./autodlComfyUi";

const workflow = {
  "1": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["9", 0] } },
  "2": { class_type: "LoadImage", inputs: { image: "input.png" } },
  "3": { class_type: "VideoSampler", inputs: { width: 512, height: 512, num_frames: 49 } },
  "4": { class_type: "VHS_VideoCombine", inputs: { images: ["3", 0] } },
};

function createContext(options: { fail?: boolean; queued?: boolean } = {}) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const savedTasks: Record<string, unknown>[] = [];
  let historyCount = 0;
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname.endsWith("/system_stats")) return Response.json({ devices: [] });
    if (url.pathname.endsWith("/upload/image")) {
      expect(init.body).toBeInstanceOf(FormData);
      const form = init.body as FormData;
      expect(form.get("image")).toBeInstanceOf(File);
      return Response.json({ name: "uploaded.png", subfolder: "" });
    }
    if (url.pathname.endsWith("/prompt")) return Response.json({ prompt_id: "mock-prompt-001" });
    if (url.pathname.endsWith("/history/mock-prompt-001")) {
      historyCount++;
      if (options.fail) return Response.json({ "mock-prompt-001": { status: { status_str: "error", messages: [["execution_error", { message: "mock node failed" }]] }, outputs: {} } });
      if (options.queued && historyCount === 1) return Response.json({});
      return Response.json({ "mock-prompt-001": {
        status: { status_str: "success", completed: true },
        outputs: { "4": { videos: [{ filename: "mock.mp4", subfolder: "", type: "output" }] } },
      } });
    }
    if (url.pathname.endsWith("/queue")) return Response.json({ queue_running: [[0, "mock-prompt-001"]], queue_pending: [] });
    if (url.pathname.endsWith("/view")) return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), { headers: { "content-type": "video/mp4" } });
    throw new Error(`Unexpected mock request: ${url.pathname}`);
  };
  const context = {
    config: { baseUrl: "http://autodl.test:6008", authType: "bearer", authToken: "mock-secret" },
    models: [{
      id: "workflow001", label: "Test workflow", type: "video", mode: ["text", "singleImage"],
      comfyWorkflow: workflow,
      comfyMapping: {
        prompt: { nodeId: "1", input: "text" }, image: { nodeId: "2", input: "image" },
        width: { nodeId: "3", input: "width" }, height: { nodeId: "3", input: "height" },
        duration: { nodeId: "3", input: "num_frames" }, durationUnit: "frames", frameRate: 24, outputNodeIds: ["4"],
      },
    }],
    signal: new AbortController().signal,
    saveTaskData: async (data: Record<string, unknown>) => { savedTasks.push(structuredClone(data)); },
    tool: { fetch, hash: Bun.hash, errorMessage: (value: unknown) => String(value ?? "") },
  };
  return { context, calls, savedTasks };
}

describe("AutoDL ComfyUI API provider", () => {
  it("tests the ComfyUI API connection without submitting a generation", async () => {
    const { context, calls } = createContext();
    const result = await provider.testConnection!.call(context as never);
    expect(result).toContain("连接成功");
    expect(calls.map(call => call.url.pathname)).toEqual(["/system_stats"]);
  });

  it("submits text-to-video, maps dimensions and duration, then downloads the completed video", async () => {
    const { context, calls, savedTasks } = createContext();
    const assets = await provider.generateVideo!.call(context as never, {
      model: "workflow001", mode: "text", prompt: "  rainy street at night  ", resolution: "720p", ratio: "16:9", duration: 5,
    });

    const submit = JSON.parse(String(calls.find(call => call.url.pathname.endsWith("/prompt"))?.init.body)) as { prompt: typeof workflow };
    expect(submit.prompt["1"]!.inputs.text).toBe("rainy street at night");
    expect(submit.prompt["3"]!.inputs.width).toBe(1280);
    expect(submit.prompt["3"]!.inputs.height).toBe(720);
    expect(submit.prompt["3"]!.inputs.num_frames).toBe(120);
    expect(calls.some(call => call.url.pathname.endsWith("/history/mock-prompt-001"))).toBe(true);
    expect(calls.some(call => call.url.pathname.endsWith("/view"))).toBe(true);
    expect(assets).toHaveLength(1);
    expect(assets[0]!.type).toBe("binary");
    expect(assets[0]!.mediaType).toBe("video");
    expect(savedTasks).toHaveLength(1);
    expect(JSON.stringify(savedTasks[0])).not.toContain("mock-secret");
  });

  it("uploads an image reference before submitting image-to-video", async () => {
    const { context, calls } = createContext();
    await provider.generateVideo!.call(context as never, {
      model: "workflow001", mode: "singleImage", prompt: "animate this image",
      images: [{ type: "binary", data: new Uint8Array([137, 80, 78, 71]), mimeType: "image/png", name: "reference.png" }],
    });

    const uploadIndex = calls.findIndex(call => call.url.pathname.endsWith("/upload/image"));
    const promptIndex = calls.findIndex(call => call.url.pathname.endsWith("/prompt"));
    const submit = JSON.parse(String(calls[promptIndex]?.init.body)) as { prompt: typeof workflow };
    expect(uploadIndex).toBeGreaterThanOrEqual(0);
    expect(uploadIndex).toBeLessThan(promptIndex);
    expect(submit.prompt["2"]!.inputs.image).toBe("uploaded.png");
  });

  it("checks the ComfyUI queue and persists an updated running status while waiting", async () => {
    const { context, calls, savedTasks } = createContext({ queued: true });
    await provider.generateVideo!.call(context as never, {
      model: "workflow001", mode: "text", prompt: "wait for this mock task",
    });

    expect(calls.some(call => call.url.pathname.endsWith("/queue"))).toBe(true);
    expect(savedTasks.map(task => task.status)).toEqual(["queued", "running"]);
  });

  it("surfaces a ComfyUI execution failure without claiming success", async () => {
    const { context, calls } = createContext({ fail: true });
    await expect(provider.generateVideo!.call(context as never, {
      model: "workflow001", mode: "text", prompt: "fail this mock task",
    })).rejects.toMatchObject({ code: "MEDIA_TASK_FAILED" });
    expect(calls.some(call => call.url.pathname.endsWith("/view"))).toBe(false);
  });
});
