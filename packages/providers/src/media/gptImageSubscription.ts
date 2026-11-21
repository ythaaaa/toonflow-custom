/// <reference path="../../types.d.ts" />

export default {
  id: "gptImageSubscription",
  label: "GPT 会员生图",
  icon: "",
  version: "1.0.0",
  readme: "使用独立 ChatGPT 会员授权。固定模型标识 gpt-image-2.6-flare；质量请求固定为 auto，实际质量不保证。图片比例通过已验证的画布尺寸与提示词请求，输出像素由上游决定。请先在分镜镜头页面完成 ChatGPT 授权。",
  rules: [],
  models: [{ id: "gpt-image-2.6-flare", label: "GPT Image（会员授权）", type: "image", mode: ["text", "multiReference"], imageRatios: ["1:1", "16:9", "9:16"] }],
  generateImage: async function (request) {
    if (request.model !== "gpt-image-2.6-flare") throw new Error("仅支持已验证模型 gpt-image-2.6-flare");
    return this.tool.gptImageSubscription.generateImage({ model: "gpt-image-2.6-flare", prompt: request.prompt, images: request.images, ratio: request.ratio });
  },
} satisfies ProviderDefinition;
