# 本机 Codex Bridge（M1 + M2）

前端：<http://127.0.0.1:3000> → 打开项目 → AI 对话 → 模型选择「本机 Codex」。Bridge 仅监听 `127.0.0.1:18427`，使用当前 `codex login` 的 ChatGPT 登录态；不使用 `OPENAI_API_KEY`。首版只处理文字。

## 启停

```powershell
Set-Location 'C:\Users\yth\Desktop\Toonflow'
& .\codexBridge\startBridge.ps1
& .\codexBridge\stopBridge.ps1
```

Bridge 通过 Codex app-server 的线程、增量消息和中断接口工作。Codex 线程默认只读沙箱，审批策略为 `never`；Bridge 固定调用 Codex，不接受网页传入命令、模型地址或系统参数。HTTP 请求必须满足本机 Host、精确 Origin、JSON 内容类型和自定义请求头；服务仅允许一个活动任务，请求体最大 16 KiB，单次任务超时 120 秒。

聊天记录保存在当前浏览器的 localStorage，以工作区目录区分；Codex 线程 ID 随记录保存，用于继续对话。新对话清空当前本机 Codex 聊天记录。关闭 Bridge、清理浏览器站点数据或换浏览器会影响后续体验；浏览器存储并非 Toonflow 原生 Agent 历史。

## 回滚

停止 Bridge，回退 `apps/web/src/components/agent`、`apps/web/src/components/modelPopover.vue`、`apps/web/src/stores/settings.ts` 和 `.gitignore` 的本轮改动，重新执行 `docker compose up -d --build`。不要回退既有的 `Dockerfile`/`bun.lock` 部署修复，也不要执行 `docker compose down -v`。
