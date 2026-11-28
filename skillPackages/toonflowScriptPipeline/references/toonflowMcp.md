# Toonflow MCP 使用规范

## 连接选择与读取

- 每次会话开始或工作区切换后先调用 getAppState。记录目标 connectionId、directory 和激活 canvasId；不要用上次会话缓存取代实时状态。
- 所有业务读写都传入当前目标。服务端业务工具使用 target.connectionId 与 target.directory；画布操作还需确认当前画布及其所属项目/剧集。
- 当前真实工具包括 getDramaProject、getEpisodeScripts、getDramaAssets、getEpisodeScenes、getEpisodeShots、getEpisodeVideoSegments、openDramaCanvas、getCanvas、findCanvasNodes、getCanvasNodes、getCanvasEdges、getNodeTools、nodeTools、addNode、connectNodes、moveNodes、renameNodes、createVideoSegment、updateVideoSegment。使用前查看当前 tools/list 的精确 schema；工具名或参数有变化时以实时 schema 为准。
- 当前可见 MCP 工具没有创建工作区操作。不得用文件写入、直接修改内部数据库或复制工作区目录来绕过。若用户未指定现有安全工作区，报告缺口。

## 业务对象写入

- 创建项尽量提供稳定 ID：projectId、seasonId、episodeId、characterId、lookId、assetId、sceneId、shotId、videoSegmentId、nodeId。重试前先读回；稳定 ID 存在且内容相同才视为幂等成功，存在冲突就停止，不通过换 ID 躲避冲突。
- createDramaProject、createSeason、createEpisode、createScriptVersion、createCharacter、createCharacterLook、createDramaAsset、createScene、createShot、createVideoSegment 等属于真实业务 API。每次读它们的当前 schema，按项目/季度/剧集范围填参数。
- createScriptVersion 新建的是草稿版本。confirmScriptVersion 会设置正式版，只能在创作者明确批准具体版本之后调用。
- 多项业务写入可按当前 schema 使用 applyDramaBatch；最多25项，失败会返回已完成/失败/未执行项，不具备跨文件事务回滚。正式剧本确认不属于批次操作。批次失败后先读回已完成项，再从失败项恢复。
- saveEpisodeDraft、createScriptVersion 与更新工具都要遵循当前修订号/稳定 ID 保护，不覆盖用户的现有正式稿。
- 不调用 remove、DELETE、清理、覆盖用户媒体或原始数据。安全恢复以重读与幂等重试为主，不做数据删除式回滚。

## 原生画布写入

1. 使用 openDramaCanvas(projectId, episodeId) 创建或打开该剧集的原生短剧画布。确认返回的 canvasId 属于指定工作区/剧集。
2. 调用 getCanvas(include: [nodeTypes]) 查实际 availableNodeTypes；不得根据节点标签猜 type。
3. 创建文本、图片、分镜、视频节点时，用 addNode 并给稳定 nodeId；内容复杂或与 Drama 对象对应的节点优先经短剧业务数据同步创建。
4. 对节点调用 getNodeTools 读取 name 和完整 parameters；按 schema 用 nodeTools 调用 setPrompt、setConfig 等真实存在的函数。不得自行假设函数名、模型参数字段、参考数组路径或默认值。
5. connectNodes 前调用 getCanvasNodes(fields: [ports]) 查 sourceHandle 与 targetHandle。连线方向、类型和连接约束须符合节点实际端口。
6. 多个镜头归一片段、资产复用到多个视频节点等关系由业务关系/原生画布边承载。不能仅将 ID 写进提示词，不能自行推测边顺序就是输入顺序。
7. 使用 moveNodes、renameNodes 或 arrangeCanvas 整理；避免扰动用户已有布局。布局后回读坐标、提示词/配置、edges 与业务对象。
8. 刷新页面或重开画布后再读一次，验证持久化；仅看到工具成功返回不算验收。

直接修改 canvas JSON、内部数据文件或节点 JSON 一律禁止。

## 进度文件

优先使用 Toonflow 的项目、剧本版本、资产、镜头、片段、生成任务和审核字段。若需要额外保存跨阶段状态，使用真实 workspaceFiles 工具把轻量状态文件写入当前工作区的 pipelineState/<projectId>.json。首次创建前检查目录和文件；创建目录时使用 mkdir；写入时按实际 schema 通过 base64 传递 UTF-8 JSON。覆盖已存在的进度文件前先读回并核对其 projectId，更新后再读回校验。不得把密钥、认证凭证或完整剧本复制进状态文件。参见 resumeRecoveryAcceptance.md。
