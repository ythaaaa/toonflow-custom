/// <reference path="../../types.d.ts" />

const imageQualities: Record<string, readonly string[]> = {
  "gpt-image-2": ["auto", "low", "medium", "high"],
  "gpt-image-2.5-flare": ["auto", "low", "medium", "high", "xhigh", "max"],
  "gpt-image-2.5-sunburst": ["auto", "low", "medium", "high", "xhigh", "max"],
};

export default {
  id: "gptImageSubscription",
  label: "GPT 会员生图",
  icon: "",
  version: "1.1.0",
  readme: "使用独立 ChatGPT 会员授权。提供 Harness 已注册的 GPT Image 2 与 2.5 Flare、Sunburst（实验）；按所选模型验证并原样发送模型 ID 和画质。支持自动或受支持的宽高尺寸、文生图及最多 5 张参考图；每次请求返回 1 张。请先在分镜镜头页面完成 ChatGPT 授权。",
  rules: [],
  models: [
    {
      id: "gpt-image-2",
      label: "GPT Image 2",
      type: "image",
      mode: ["text", "singleImage", "multiReference"],
      imageSizes: ["auto", "1024x1024", "1536x864", "864x1536", "2048x2048", "3072x1728", "1728x3072"],
      imageRatios: [],
      rules: [{ type: "select", field: "quality", title: "画质", value: "auto", options: [
        { label: "自动", value: "auto" }, { label: "低", value: "low" }, { label: "中", value: "medium" }, { label: "高", value: "high" },
      ] }],
    },
    {
      id: "gpt-image-2.5-flare",
      label: "GPT Image 2.5 Flare（实验）",
      type: "image",
      mode: ["text", "singleImage", "multiReference"],
      imageSizes: ["auto", "1024x1024", "1536x864", "864x1536", "2048x2048", "3072x1728", "1728x3072"],
      imageRatios: [],
      rules: [{ type: "select", field: "quality", title: "画质", value: "auto", options: [
        { label: "自动", value: "auto" }, { label: "低", value: "low" }, { label: "中", value: "medium" }, { label: "高", value: "high" }, { label: "极高", value: "xhigh" }, { label: "最高", value: "max" },
      ] }],
    },
    {
      id: "gpt-image-2.5-sunburst",
      label: "GPT Image 2.5 Sunburst（实验）",
      type: "image",
      mode: ["text", "singleImage", "multiReference"],
      imageSizes: ["auto", "1024x1024", "1536x864", "864x1536", "2048x2048", "3072x1728", "1728x3072"],
      imageRatios: [],
      rules: [{ type: "select", field: "quality", title: "画质", value: "auto", options: [
        { label: "自动", value: "auto" }, { label: "低", value: "low" }, { label: "中", value: "medium" }, { label: "高", value: "high" }, { label: "极高", value: "xhigh" }, { label: "最高", value: "max" },
      ] }],
    },
  ],
  generateImage: async function (request) {
    const qualities = imageQualities[request.model];
    if (!qualities) throw new Error(`GPT 会员生图不支持模型 ${request.model}`);
    const quality = request.other?.quality;
    if (quality !== undefined && (typeof quality !== "string" || !qualities.includes(quality)))
      throw new Error(`模型 ${request.model} 不支持画质 ${String(quality)}`);
    return this.tool.gptImageSubscription.generateImage({
      model: request.model,
      prompt: request.prompt,
      images: request.images,
      size: request.size,
      quality: quality as string | undefined,
      ratio: request.ratio,
    });
  },
} satisfies ProviderDefinition;
