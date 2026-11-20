# Toonflow 剧本与自动分镜能力核查

核查基于克隆的源码 `6086cdffceb704a632eca143dd16cd461a78cdac`，并区分代码、工作流文档和运行状态。由于 Docker 构建卡在依赖安装，前端未能启动，本次没有实际点击页面或让模型生成内容；所有涉及“AI 已生成”的能力都不能记为运行验收通过。

## 验收表

| 问题 | 结论 | 证据与限制 |
|---|---|---|
| 输入一句创意生成完整故事 | 文档声称/尚未运行验证 | 工作流技能把“一句话故事核→人物弧→三幕→分集大纲”列为剧本骨架步骤；实际生成需要已配置 LLM。未通过 UI 运行验证。 |
| 自动生成多集剧本 | 源码/技能文档确认流程存在，实际生成未验证 | `packages/skills/v118workflow/references/storySkeleton.md` 描述按项目集数生成分集大纲；`episodeScript.md` 规定按授权范围逐集写正式剧本。它是 Agent 工作流提示和画布约定，未证明当前版本提供一个自动一次生成全季的专用按钮。 |
| 完整人物设定与对白 | 文档声称 | `knowledge/scriptCraft.md` 覆盖人物身份、特征、目标、行动、能力边界、说话方式；`episodeScript.md` 规定场景人物、动作、台词。未运行模型输出。 |
| 自动拆分逐镜头分镜 | 文档和团队定义确认，运行未验证 | `packages/teams/storyboardTeam/team.json` 定义导演、编写、审阅成员；团队描述根据已有故事和约束产出可审阅的文字分镜。源代码含团队包，但运行时是否自动安装该团队尚未确认；`apps/server/src/index.ts` 当前注释掉了 `agentsRoot` 初始化。 |
| 分镜包含画面/景别/动作/时长/台词 | 文档确认 | `packages/skills/v118workflow/references/storyboardTable.md` 定义七列表分镜及镜头画面、景别/构图/机位/运镜、动作/反应、时长、对白/声音、转场等执行信息。这里是工作流规范，不是本次实际生成结果。 |
| 人工修改剧本和分镜 | 设计/代码层面可行，UI 未验证 | 工作流把剧本、分镜存为工作区画布/文本节点，并要求修订原位更新；Toonflow 有通用无限画布和文本节点。未能启动前端确认编辑交互。 |
| 剧本审核、多轮重写 | 文档确认有审核方法；迭代交互未验证 | `scriptCraft.md` 与 `storyboardTable.md` 有审核标准、问题分级、指定修复/重做约定；对话多轮重写依赖 LLM/Agent 和实际界面，本次未验证。 |
| 固定角色、场景与连续剧情 | 文档声称支持工作流连续性 | `storySkeleton.md` 和 `episodeScript.md` 要求维护人物弧、场景、人物关系、服装/道具及前后集状态；`packages/teams/storyboardTeam/knowledge/continuity.md` 指定分镜连续性。实际角色资产固定绑定和跨集保真未运行验证。 |
| 导出结构化剧本/分镜 | 部分源码能力可确认，专用导出未确认 | 工作区有文件读写/导出 API 与画布数据文件；工作流示例使用 `画布/剧本.json` 等约定。但未发现本次可确认的、专为剧本/分镜设计的结构化导出操作或导出格式，UI 未验证。 |
| MCP/API/插件供 Harness 操作 | 源码确认部分支持 | 存在 MCP 服务端路由与运行时、`packages/mcp`、`packages/mcp/README.md`、画布 Agent/节点工具。视频生成节点暴露结构化工具（读配置、改提示词/配置、发起生成、查询/取消任务等）。不等于已验证 Harness 可无缝完成整套编剧到分镜流程；路径与授权范围需配套配置，且本次未运行。 |

## 能力边界

- Toonflow 是画布节点 + Agent/技能的创作环境；仓库文档展示的是模型辅助的流程规范，不应等同于每一步都是无需用户确认的自动化专用界面。
- 生成故事、剧本和 AI 分镜通常需要配置语言模型 Provider/API Key。没有 Key 时仍可人工编辑文本、画布和素材；生成能力不能验收。
- 本次不读取或展示任何已有 Key，不配置 Key，不调用付费模型，不生成图像或视频。
- 团队包是否在当前生产启动配置中注册仍有疑点：`apps/server/src/index.ts` 中 `agentsRoot` 当前被注释；因此源码内团队定义的存在不能直接证明 UI 可选或 Agent 可执行。

## 关键源码/文档

- `packages/skills/v118workflow/references/knowledge/scriptCraft.md`
- `packages/skills/v118workflow/references/storySkeleton.md`
- `packages/skills/v118workflow/references/episodeScript.md`
- `packages/skills/v118workflow/references/storyboardTable.md`
- `packages/teams/storyboardTeam/team.json`
- `packages/teams/storyboardTeam/members/{director,writer,reviewer}.md`
- `packages/teams/storyboardTeam/knowledge/continuity.md`
- `packages/mcp/README.md`
- `packages/nodes/videoGenerationNode/src/index.vue`

官方 README 的能力介绍属于“文档声称”；当前本地源码确认具有上述部分组件；**没有任何剧本/分镜 AI 输出属于本次已运行验证**。

## 本轮实际 UI 验收补充（2026-11-17）

| 项目 | 结果 | 验收范围 |
|---|---|---|
| 前端与工作区 | 已运行验证 | Chrome 显示快速开始页，跳过配置后进入首页；选择空的 `myProject` 后打开画布。容器重启后浏览器重新载入恢复到同一项目。 |
| 剧本/分镜入口 | 部分已运行验证 | AI 面板显示“填入提示：梳理故事分镜”；技能选择器显示“v1.1.8 分集制作流程”。没有发送消息或生成内容。 |
| 文本与画布 | 已运行验证（入口） | 画布节点菜单有“文本”节点；文档面板有文件树和 `画布1.json`。未添加节点或修改任何故事内容。 |
| 分集剧本、人物设定、自动分镜结果 | 尚未确认运行效果 | 本地技能文档描述其工作流；空白项目没有剧本、人物或分镜样例。没有模型 Key，所以没有生成/重写内容。 |
| 审核与连续性 | 文档/源码确认，运行未验证 | 规则文档含审核、连续性与按集制作规范；未运行 Agent 生成或修改。 |
| 团队 Agent | 尚未确认可用 | 源码内有 `storyboardTeam` 包；但当前生产入口 `apps/server/src/index.ts` 的 `agentsRoot` 仍注释，不能据此宣称团队 Agent 在界面中可选。 |
| 结构化导出、Harness 完整流程 | 尚未确认 | 有通用画布/工作区文件和 MCP 工具基础；未确认专用剧本导出操作，也未以 Harness 实际执行全流程。 |

空项目本身不会自动产出“一句话创意→故事/多集→人物对白→逐镜分镜”；这类 AI 创作依赖语言模型配置，并且当前产品呈现为画布/文本节点 + 技能/对话流程，而非已预置完整故事页。模型费用仍未触发。
