import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AgentCanvasSnapshot } from "@/agent/runtime/types";

export function createDramaContextTool(input: AgentCanvasSnapshot): ToolDefinition {
  const snapshot = structuredClone(input);
  return {
    name: "getDramaContext", label: "读取短剧业务上下文",
    description: "读取本条消息发送时冻结的选中节点业务详情、人物、场景、镜头、图片素材和真实连线关系。空选中时返回空节点，不推断其他创作对象。",
    promptSnippet: "画布问题先调用 getDramaContext 获取本条消息冻结的选中节点与业务上下文；没有选中节点时明确说明，不自行选取其他节点。按需再查询已知节点的局部画布数据。",
    promptGuidelines: ["getDramaContext 的快照在用户发送消息时创建。任务运行期间即使选择变化也只使用该快照。relations 中的 relation 是真实短剧业务关系，source/target 是方向。不要把画布其他节点当成当前选中对象。"],
    parameters: { type: "object", properties: {}, additionalProperties: false }, executionMode: "sequential",
    async execute(_id, _params, signal) {
      signal?.throwIfAborted();
      return { content: [{ type: "text", text: JSON.stringify(snapshot) }], details: snapshot };
    },
  };
}
