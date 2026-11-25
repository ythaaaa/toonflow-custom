# Toonflow 安装与更新指南（Windows）

本指南适用于从 GitHub 默认分支 `master` 新装或更新 Toonflow。Docker 部署会固定使用 Compose 项目 `toonflow` 和命名卷 `toonflow_toonflowData`，端口为 Web `3000`、OAuth 回调 `1455`。

## 1. 安装 Windows 依赖

使用 Windows 10/11 的 PowerShell。安装 Git、Docker Desktop 和 WSL2：

```powershell
winget install --id Git.Git --exact
winget install --id Docker.DockerDesktop --exact
wsl --install
wsl --update
```

如果 Windows 提示重启，请重启后打开 Docker Desktop，等待状态显示 Docker Engine 正在运行。Docker Desktop 设置中启用 WSL 2 引擎。Docker Desktop 会使用 WSL2 管理 Linux 容器；日常 Docker 部署不要求在 Windows 单独安装 Bun。

官方安装说明：[Git for Windows](https://git-scm.com/install/windows)、[Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/)、[安装 WSL](https://learn.microsoft.com/windows/wsl/install)。

## 2. 克隆并启动正式本地服务

在 PowerShell 选择一个源码目录，然后克隆仓库默认分支：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\source" | Out-Null
Set-Location "$env:USERPROFILE\source"
git clone https://github.com/ythaaaa/toonflow-custom.git
Set-Location .\toonflow-custom
docker compose up -d --build
```

首次构建需要下载依赖和基础镜像，完成后打开 <http://localhost:3000>。可用以下命令查看服务状态和日志：

```powershell
docker compose ps
docker compose logs --tail 100 toonflow
```

Compose 已固定项目名和数据卷名。即使源码目录改名，数据仍保存在 `toonflow_toonflowData`。OAuth 回调端口 `1455` 仅绑定本机，不要改为公网监听。

## 3. GPT 会员授权

1. 在浏览器打开 <http://localhost:3000>。
2. 进入短剧项目和分集，打开一个镜头详情。
3. 在“GPT 会员生图”区域点击“独立 ChatGPT 授权”。
4. 在打开的浏览器窗口完成授权，回到 Toonflow 确认授权状态。

授权使用应用自己的 OAuth PKCE 流程，不读取 Codex 登录文件，也不要求配置 `OPENAI_API_KEY`。授权文件保存在 Docker 数据卷内的 `gptImageSubscription/auth.json`，不会写入源码目录或镜像。换电脑后在新电脑重新授权。授权或生图功能的可用性受上游账号、产品政策及额度限制；打开授权入口不会触发生图请求。

## 4. 源码开发模式

安装 Bun 1.4.3，然后在仓库根目录安装冻结锁文件中的依赖并启动 Web 与 Server：

```powershell
iex "& {$(irm https://bun.com/install.ps1)} -Version 1.4.3"
bun --version
bun install --frozen-lockfile
bun run dev
```

打开终端显示的本地地址（默认 Web 端口为 `3000`）。开发模式使用项目自身的本地数据目录；正式 Docker 数据仍在命名卷中，两者分开管理。可用 `bun run dev:web` 或 `bun run dev:server` 单独启动对应模块。

Bun 官方 Windows 安装说明：[bun.sh/docs/installation](https://bun.sh/docs/installation)。

## 5. 拉取更新并更新 Docker 服务

更新前先确认本地修改已提交或另行保存。默认分支更新采用快进方式：

```powershell
git switch master
git pull --ff-only origin master
docker compose up -d --build
```

Docker Compose 会重建并更新现有 `toonflow` 服务，继续挂载 `toonflow_toonflowData`。不要使用 `docker compose down -v`，也不要运行会删除数据卷的清理命令。

## 6. 检查并清理 Docker 占用

先检查镜像、容器引用、构建缓存及磁盘占用：

```powershell
docker compose ps
docker image ls --digests
docker system df -v
docker buildx du
```

删除历史镜像前，先用 `docker image inspect <镜像ID>` 确认镜像用途，并确认没有容器引用该镜像；正在运行的镜像、需要保留的回滚镜像和 Bun/Alpine 等基础镜像不要删除。只删除明确不用的镜像，且不要添加 `-f`：

```powershell
docker image rm <明确不用且未被容器引用的镜像ID>
```

清理一周前已不再使用的构建缓存时，可先检查提示的回收范围，再按提示确认：

```powershell
docker builder prune --filter "until=168h"
```

最后再次执行 `docker system df -v` 对比空间。该命令不清理命名数据卷。不要使用 `docker system prune -a`、`docker volume prune`、`docker compose down -v`，也不要删除 `toonflow_toonflowData`。

## Android 签名

仓库历史中公开的 Android keystore 已不再可信，当前源码已移除该文件和硬编码密码。Debug 使用当前电脑 Android SDK 生成的标准调试密钥。Release 需要通过外部 `ANDROID_KEYSTORE_PATH`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS` 和 `ANDROID_KEY_PASSWORD` 提供独立生产签名；缺少配置时构建脚本会停止。不要复用历史密钥，也不要把签名文件或密码提交到 GitHub。
