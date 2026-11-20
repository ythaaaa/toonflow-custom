# 优云智算 MiniMax H3 接入可行性报告

核查版本：Toonflow `6086cdffceb704a632eca143dd16cd461a78cdac`（2026-11-05）。本报告仅读源码和优云智算公开文档；没有读取或显示已有 API Key，没有配置凭据，没有发送 API 请求，没有创建视频任务或消耗积分。

## 结论

**可行，而且当前仓库已经有针对优云智算的媒体 Provider 和 MiniMax H3 专用实现。** `packages/providers/src/media/compshare.ts` 的 Provider ID 为 `compshare`、适配器版本 `2.0.2`，包含 `MiniMax-H3` 视频模型、H3 专用凭据字段、提交/轮询/恢复任务和返回视频 URL 的逻辑。预计接入无需新写适配器；部署完成后在设置里配置相应凭据并进行非生成的本地配置核查即可。任何真实生成测试都会调用远端服务，可能消耗积分；应单独获授权后再做。

仓库还提供 CompShare ModelVerse 通用 API 的路径，但它与 H3 视频工作台接口是两组地址、API Key 和协议，不能混用。

## Provider 架构与可配置性

- `packages/providers/types.d.ts` 定义统一 Provider 接口和 `generateVideo`；视频请求抽象支持 `prompt`、`mode`、图片/视频/音频参考、`firstFrame`、`lastFrame`、`duration`、`ratio`、`resolution`、`watermark`、`other` 等。
- `apps/server/src/utils/media/provider.ts` 负责加载/校验媒体 Provider 代码；前端设置页面支持管理媒体模型/供应商。
- `ProviderDefinition` 类型含可选 `apiUrl`，但这是 Provider 声明项，不代表每个适配器的服务地址都能在设置界面任意改写。
- 在 `compshare.ts` 中 `API_BASE = https://api.modelverse.cn`、`H3_BASE = https://cp.compshare.cn` 是源码常量，H3 请求直接拼固定地址；Compshare Provider 没有暴露 H3 Base URL 字段。因此当前 H3 端点不可通过常规设置自定义。需改地址时才需要适配器代码变更。
- Toonflow 的自定义 Provider 源码能力可承载自定义协议适配，但这属于写/维护适配器代码，不是把一个 OpenAI Base URL 填进去即可。

## H3 接口与代码对应

| 项目 | 当前代码表现 |
|---|---|
| 提交任务 | `POST https://cp.compshare.cn/minimax/v2/video_generation`，Bearer Token + JSON；model/content/resolution/duration/ratio 等作为请求体字段。 |
| 查询任务 | `GET https://cp.compshare.cn/minimax/v2/query/video_generation/{task_id}`。 |
| 异步等待 | 收到 `task_id` 后每 3 秒查询，最长等待 30 分钟；识别 succeeded、failed、cancelled、blocked，其它状态继续轮询。 |
| 恢复 | 保存 `{ kind: "h3Video", taskId, model, deadline }`；`resumeTask` 可恢复已有任务等待，不重复提交任务。 |
| 重试 | 源码支持等待/恢复任务，但未发现提交任务失败后的自动重试/退避策略，也不应对可能已接单的提交请求盲目重试。需避免重复收费任务。 |
| 成功结果 | 读取 `task.content.url`，作为视频媒体 URL 返回；视频生成节点用结果更新节点输出，显示视频预览/后续文件流程。 |
| 失败回写 | 失败/取消/拦截作为 `MEDIA_TASK_FAILED` 抛出并反馈节点；任务提交/查询错误由 Provider 转换成可读错误。 |
| 自定义 API 地址 | 当前 H3 地址写死在 Provider 源码常量中；设置界面无此适配器的 endpoint 输入字段。 |
| OpenAI 兼容 | **H3 视频工作台协议不是 OpenAI `/v1/videos` 兼容端点**；它使用 `content` 数组和 `/minimax/v2/...` 异步任务 API。现有 Provider 是专用协议适配，不是通用 OpenAI 视频 Provider。 |

## 图像/视频参考能力

- 首帧/尾帧：由 `firstFrame`、`lastFrame` 映射至 `content` 中 `role: "first_frame"` / `"last_frame"` 的 image_url。
- 首帧生成：如只带普通图片，适配器会作为首帧处理。
- 多参考图/视频/音频：映射 `reference_image`、`reference_video`、`reference_audio`；代码上限为 9 图、3 视频、3 音频、合计 12 项；音频不能单独作参考。
- 代码对参考图可转换 URL/Base64/二进制；H3 参考视频目前要求 HTTP(S) URL，不能把本地二进制直接转换上传。需特别留意素材要让远端 H3 服务可访问。
- 模型清单提供 text、singleImage、endFrameOptional 和多媒体 reference 模式，并声明 duration/resolution 范围；H3 时长校验为 4–30 秒、分辨率 480P/768P/1080P/2K/4K，比例支持 adaptive、21:9、16:9、4:3、1:1、3:4、9:16。
- `other` 可传 `use_context_ir`、`skill_id`、`mute_audio`、`aigc_watermark` 等特定参数；提示词优化只有显式置 true 才添加。应在 UI 表单支持范围内确认这些参数如何输入，不应假定每个字段都有独立控件。

## 是否需要开发

**当前 H3 基本接入不需要开发适配器**：源码已经包含 `MiniMax-H3` 分支，适配器可从 Provider 面板安装/使用，需确认运行版本安装了 `compshare` Provider 并配置 H3 模块专用 Key（只在本地设置，不应公开）。若只希望使用现有能力，重点是完成部署和本地设置，不要重复造一套适配器。

如果后续提出新增功能，预计改动点如下（当前未修改这些文件）：

1. `packages/providers/src/media/compshare.ts`：H3 API Base URL 配置、额外请求字段/参数映射、服务端兼容差异、文件参考上传支持，或有界重试与退避策略。
2. `packages/providers/types.d.ts`、视频生成节点参数 schema（`packages/nodes/videoGenerationNode/src/index.vue` 及关联节点设置 UI）：只有新增通用能力字段时需要；现有抽象已覆盖图片/首尾帧/多参考/异步任务，不必无理由改通用类型。
3. Provider 管理/表单组件：只有需要将 Base URL 或新参数配置化时才涉及。
4. 错误与任务状态逻辑：若补重试，应仅对可证明安全的查询请求或幂等提交做有界重试；须利用供应商支持的 `Idempotency-Key` 并避免重复扣积分。
5. 结果回写逻辑：当前通用视频节点已接收 Provider 的 `MediaAsset[]` 输出；只有 H3 返回结构或临时 URL 生命周期与现行处理不兼容时才需要改。

当前基于源码确认的 Provider 是否可从本次运行实例的 UI 顺利安装，以及实际 H3 账户的额度/认证，均**尚未确认**；部署尚未成功，且没有 Key，因此没有运行探测。

## 公开文档核对

优云智算的当前 H3 API 文档说明专用 `sk-ml-` Key、提交任务后按 task ID 查询/回调、成功结果在 `task.content.url`，支持文生视频、首尾帧和参考素材模式。公开文档：

- [MiniMax H3 视频任务 API](https://www.compshare.cn/docs/minimax-h3/api/minimax-h3-video-api)
- [MiniMax H3 产品介绍](https://compshare.cn/docs/minimax-h3/introduce)
- [MiniMax H3 视频生成操作指南](https://www.compshare.cn/docs/minimax-h3/workbench)

接口参数/计费细则可能变化；真实调用前以控制台当前接口文档为准。README 宣传价并非本报告认可或验证的报价。

## 本轮实际 UI 验收补充（2026-11-17）

- 设置 → 媒体模型页面实际显示内置 Provider“优云智算（支持30秒）”，`compshare.ts` 版本 `2.0.2`，共 9 个模型。
- Provider 编辑面板实际显示 H3 `MiniMax-H3`，以及文生视频、单图、可选尾帧、图片参考 ×9、视频参考 ×3、音频参考 ×3 能力标签。
- UI 有独立的“优云智算 API Key”与“MiniMax API Key”输入框。本实例数据卷为本轮新建；两个字段保持空白，没有保存或测试。
- MCP 设置页面可打开，状态“已关闭”，地址 `http://127.0.0.1:10588/mcp`；未开启服务，也未复制带访问凭证配置。
- 页面验收只检查现有配置入口，不代表远端 API、余额、模型调用或生成结果已验证。
