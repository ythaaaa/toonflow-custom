# Toonflow 二开：新电脑恢复

此仓库保留 Toonflow 上游源码、M1/M2 短剧创作中心和本机 Codex Bridge。工作区数据单独保存在 `toonflowData-20261121.tar.gz`，不得放入 Git 仓库。

## 1. 环境

- Windows 11，启用 WSL 2 和 Docker Desktop 的 Linux 容器模式；安装 Git。
- 源码要求 Bun 1.4.3（见 `package.json` 和 `Dockerfile`）。Docker 构建内自带 Bun；本机开发再安装相同版本。
- 本机 Codex Bridge 使用 Node.js；原机器验证版本为 24.19.0。安装 Codex CLI 后用 `codex login` 登录自己的 ChatGPT 账号，再用 `codex login status` 检查状态。不要复制原机器的认证文件。
- 原机器 Docker Engine 版本为 29.7.2。确保新机磁盘足够容纳源码、Docker 镜像和工作区归档。

## 2. 获取源码与启动

```powershell
git clone https://github.com/ythaaaa/toonflow-custom.git
Set-Location toonflow-custom
git remote add upstream https://github.com/HBAI-Ltd/Toonflow-app.git
docker compose build toonflow
```

`origin` 是个人私有仓库；`upstream` 指向官方，仅用于以后查看更新。项目默认不需要 `.env`；如未来增加配置，只在本机创建 `.env`，不要提交真实密钥。Docker 构建会执行 `bun install --frozen-lockfile` 和服务器、前端构建。本机源码开发可运行 `bun install --frozen-lockfile`。

## 3. 恢复工作区数据

先把独立备份文件复制到新电脑目录，例如 `C:\ToonflowBackup\toonflowData-20261121.tar.gz`，核对随备份交付的 SHA256。恢复前停止 Toonflow 服务；以下命令只用于新机的空数据卷，不能对已有用户数据卷重复执行。

```powershell
docker volume create toonflow_toonflowData
docker run --rm --user root --entrypoint sh -v toonflow_toonflowData:/target -v C:\ToonflowBackup:/backup:ro toonflow-toonflow:latest -lc 'tar -C /target -xzf /backup/toonflowData-20261121.tar.gz'
docker compose up -d --no-build toonflow
```

如果源码构建因网络问题失败，可先用另行交付的镜像备份执行 `docker load -i C:\ToonflowBackup\toonflow-m2-20261121.tar`，再执行 `docker tag toonflow-toonflow:m2-20261121 toonflow-toonflow:latest`，然后按上面的数据卷恢复和启动步骤操作。

## 4. Codex Bridge

在仓库根目录运行：

```powershell
codex login status
.\codexBridge\startBridge.ps1
```

停止时运行 `.\codexBridge\stopBridge.ps1`。Bridge 监听 `127.0.0.1:18427`，前端监听 `127.0.0.1:3000`；使用当前 Codex 登录态，不需 OpenAI API Key。当前 Bridge 只支持文本对话；浏览器本地聊天记录不会随 Docker 数据卷迁移。

## 5. 首次验收

1. `docker ps` 确认 `toonflow-toonflow-1` 正在运行，端口仅映射到 `127.0.0.1:3000`。
2. 打开 <http://127.0.0.1:3000>，进入 `ToonflowAcceptance` 工作区，点击“短剧”。
3. 项目列表应显示两个测试短剧项目。打开 `Codex短剧验收`，确认第一季有 12 集。
4. 进入 EP001 的“剧本编辑”，确认《爸爸的秘密快递》工作稿；“版本与审核”应有 V001、V002、V003，V003 为正式版。
5. “场景管理”应有客厅、厨房两个场景；“分镜管理”应有 6 个镜头，前三个属客厅，后三个属厨房。EP002 应没有剧本和镜头。
6. 重新加载页面，确认以上内容仍在。检查 `docker volume inspect toonflow_toonflowData`，确认挂载正常。

## 6. 故障排查

- 构建卡在 `bun install`：核对 Docker 网络、代理及 npm registry 可达性，不修改 `bun.lock` 或依赖版本。
- 页面打不开：运行 `docker compose ps`、`docker compose logs --tail=100 toonflow`，检查 3000 端口是否被占用。
- 项目列表为空：先确认当前工作区为 `ToonflowAcceptance`，再检查数据卷是否已恢复；不要在已有数据卷中重复解包。
- Codex 不可用：核对 `codex login status`、Node.js、Bridge 进程和 `127.0.0.1:18427`。不要复制 OAuth Token 或 Codex 认证文件。
- 工作稿和正式版不同属于正常：`draft.md` 独立自动保存，已确认版本文件不可被工作稿覆盖。
