# Toonflow — AI 短剧创作与无限画布工作台

Toonflow 是一款用于本地创作的 AI 短剧工作台，结合无限画布、短剧项目管理和 AI 辅助工具。项目在 Windows 上可通过 Docker Desktop 本地运行，也可以安装依赖后进入源码开发模式。

## 已实现功能

- 无限画布与节点管理。
- 短剧项目、分集和剧本导入。
- 人物、场景、分镜及镜头管理。
- GPT 会员 OAuth 授权与镜头生图。
- AI 对话及画布上下文交互。
- 素材管理。
- Docker 本地部署，数据保存在独立 Docker 命名卷中。

具体能力以当前代码为准；GPT 会员生图需要用户自行完成授权，使用前请确认上游服务的账号条款和额度规则。

## 快速启动

安装并启动 Docker Desktop 后，在 PowerShell 中执行：

```powershell
git clone https://github.com/ythaaaa/toonflow-custom.git
cd toonflow-custom
docker compose up -d --build
```

打开 <http://localhost:3000>。详细的新电脑安装、授权、开发、更新和 Docker 清理步骤见[安装指南](INSTALL.md)。

## 数据与授权

- GitHub 仓库保存程序源码和必要配置模板。
- Docker 命名卷 `toonflow_toonflowData` 保存 Toonflow 运行数据，包括项目工作区、画布、素材、设置及 GPT 会员授权状态。
- OAuth 凭据不应提交到 GitHub 或写入公开镜像。更换电脑后，在新电脑运行的 Toonflow 中重新完成 GPT 会员授权。
- 更新或移除容器时不要使用 `docker compose down -v`，也不要删除 `toonflow_toonflowData`。

## 开发

需要 Bun 1.4.3。克隆默认 `master` 分支后，在仓库根目录运行：

```powershell
bun install --frozen-lockfile
bun run dev
```

Web 与 Server 构建和 Docker 部署说明见 [INSTALL.md](INSTALL.md)。

## 项目来源与许可证

本仓库是对 [HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app) 的持续二次开发。上游项目作者、贡献者、许可声明和第三方组件署名按原项目要求保留；当前仓库的新增及修改由本仓库提交历史记录。项目根目录的 [LICENSE](LICENSE) 保留上游 MIT 许可证。

## Android 安全说明

仓库历史中曾公开过 Android 签名密钥。该密钥已从当前源码中移除并视为不可信；历史 Git 对象仍可能包含旧文件。当前 Android Debug 使用本机标准调试签名，Release 仅接受外部独立生产签名配置。此项目当前以 Windows + Docker 本地创作为主，不提供默认 Android Release 签名。
