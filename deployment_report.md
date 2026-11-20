# Toonflow 本地部署报告

更新时间：2026-11-17（Asia/Shanghai）

## 部署状态：成功

Toonflow 已按仓库官方 Docker Compose 配置构建、启动并完成本机基础验收。服务地址：<http://127.0.0.1:3000>。数据保存在 Docker 命名卷 `toonflow_toonflowData`，未删除卷；服务端口只绑定回环地址。

## Bun 安装故障根因及修复

只读诊断发现 `bun.lock` 的 1084 条包下载 URL 指向两个在宿主机和 Docker 容器都无法访问的旧镜像：`registry.npmmirror.com`（1056 条）以及 `registry.npm.taobao.org`（28 条）。两个环境可访问 npm 官方 Registry `registry.npmjs.org`（HTTP 200）。主机没有 Bun 命令；Dockerfile 固定使用官方要求的 Bun 1.4.3。未发现 `bunfig.toml`、Git 形式的依赖或 workspace 自有安装生命周期脚本；Windows/WSL/Docker 容器均未配置代理变量，WinHTTP 为 Direct Access。

最小修复：仅将 `bun.lock` 中这 1084 个下载地址改为 `https://registry.npmjs.org`。对比修改前后的锁文件时，将 Registry 地址归一化后内容完全相同，包图、版本和 SHA-512 integrity 校验值均保持不变。通过临时只读源码副本用 Bun 1.4.3 执行 `bun install --frozen-lockfile --verbose`，969 个包安装成功；Docker Compose 构建日志也确认 `969 packages installed`（约 116 秒）。上一轮观察到的约 12 分钟停滞由不可达镜像引起；全量冷缓存安装有时需一到数分钟，进度输出稀疏。

## 启动问题及修复

依赖和代码成功构建后，首次启动日志出现 `EACCES`：运行用户 `bun` 无法读取 `/app/build/tools/pluginDeveloper.tool.js`。只读检查证实构建产物为 `600 root:root`，而容器进程为 UID/GID 1000 的 `bun` 用户。

Dockerfile 最小修复：构建结束时将 `build` 和 `data` 目录一并 `chown -R bun:bun`。之后按 Compose 重建并启动，容器连续运行，`restart count=0`；日志含 `[服务启动成功]`。镜像构建的 Web 打包有大于 500 KB chunk 的非阻断提示。

## 环境、源码与版本

- 项目路径：`C:\Users\yth\Desktop\Toonflow`
- Git 远程：`https://github.com/HBAI-Ltd/Toonflow-app.git`
- 分支：`master`；基础 Commit：`6086cdffceb704a632eca143dd16cd461a78cdac`
- 工作区仅有预期改动：`bun.lock` Registry URL、`Dockerfile` build 目录所有权，以及三份报告。
- 宿主版本：Node `v24.19.0`；Git `2.55.0.windows.3`；Docker CLI `29.7.2`；Compose `v5.3.1`。宿主未安装 Bun；镜像内 Bun `1.4.3`。
- WSL 仅见 Docker Desktop 的 WSL 2 发行版。固件虚拟化已开启；C 盘剩余约 857 GB。
- BuildKit 最终成功构建镜像 `toonflow-toonflow:latest`；官方部署基于 `oven/bun:1.4.3`。

## 容器、网络与数据验收

- 容器：`toonflow-toonflow-1`，状态 `running`，Compose 发布 `127.0.0.1:3000->3000/tcp`，无 Docker healthcheck（因此以运行状态、日志、HTTP 和浏览器实际页面确认）。
- `Invoke-WebRequest http://127.0.0.1:3000` 返回 HTTP 200、`text/html`、2244 字节 HTML；Chrome 实际显示 Toonflow 快速开始页和项目首页，不是仅 API 响应。
- 首次工作区可选择镜像初始化的 `myProject` 空目录；创建并打开空画布项目后，文档面板出现 `画布1.json`。Compose restart 后，该文件仍在卷内，浏览器重新加载恢复到 `myProject` 工作区。
- 卷：`toonflow_toonflowData`（local driver），挂载 `/app/data`；其中内置工具 12 个、内置媒体 Provider 文件 `apiMart.ts`、`compshare.ts`、`metaso.ts` 已初始化。凭据没有读取或显示。
- 没有调用付费模型、图像或视频生成，也没有填写任何 API Key。

## 设置页验收

- 设置 → 媒体模型 → 优云智算 Provider 编辑面板可正常打开。界面显示 9 个模型，其中有 MiniMax-H3，并展示文生视频、单图、可选尾帧、最多 9 图/3 视频/3 音频参考模式。两个 Key 字段留空；没有点击“测试模型”或保存。
- 设置 → MCP 页面可正常打开；当前状态“已关闭”，本地服务地址显示 `http://127.0.0.1:10588/mcp`。未启用 MCP（启用会开放外部工具访问），也未复制带访问凭证的客户端配置。
- AI 对话技能选择器中可见“v1.1.8 分集制作流程”和“视频制作工作流”；只检查了选择器，没有提交 AI 请求。

## 当前已知问题/安全观察

- Compose 无 healthcheck；当前验收以容器 `running`、启动日志、HTTP 200、浏览器页面和持久化工作区为准。
- 容器重启日志出现一次设备互联管理接口 403：`只允许本机 Toonflow 页面管理设备互联`，随后服务正常启动。源码的该路由要求容器内 socket 来源为 `127.0.0.1`；Docker Desktop 端口转发后的 socket 地址并非回环，因此 Docker 部署下设备互联管理接口可能受限。本次没有修改其安全校验，也未验收或开启设备互联。
- Docker Engine 中已有另一个无关容器 `avs-p4-postgres` 发布 `0.0.0.0:15432->5432` 和 IPv6 全地址；未触碰它。Toonflow 本身仍只绑定本机 `127.0.0.1`。
- README 指出服务页面/API 没有独立登录鉴权；不要更改 Compose 的回环端口绑定或通过公网暴露。

## 常用命令

```powershell
Set-Location 'C:\Users\yth\Desktop\Toonflow'
docker compose up -d --build
docker compose ps
docker compose logs -f toonflow
docker compose stop
docker compose start
docker compose restart
```

如需删除容器但保留数据，可用 `docker compose down`。不要执行 `docker compose down -v`。
