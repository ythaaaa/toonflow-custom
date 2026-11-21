# GPT 会员生图：部署与重新授权

## 首次部署

在 Windows 安装 Git、Docker Desktop 和 Bun 1.4.3 后，克隆当前开发分支：

```powershell
git clone --branch poc/gpt-image-provider https://github.com/ythaaaa/toonflow-custom.git
cd toonflow-custom
docker compose -p toonflow -f compose.yaml up -d --build
```

服务使用 `http://127.0.0.1:3000`，OAuth 回调使用本机端口 `1455`。不要将回调端口暴露到公网。Compose 项目名保持 `toonflow`，短剧文件和设置保存在命名卷 `toonflow_toonflowData`；更新镜像时不要使用 `docker compose down -v`。

## ChatGPT 会员重新授权

1. 打开 `http://127.0.0.1:3000`，进入短剧项目和一集的“分镜镜头”。
2. 打开任意镜头详情，在“GPT 会员生图”区域点击“独立 ChatGPT 授权”。
3. 在新开的浏览器窗口完成 ChatGPT 登录和授权，回到 Toonflow，状态显示“已连接”后即可生成。
4. 授权失效时再次点击授权；需要撤销本机保存的授权时点击“退出授权”，之后可重新登录。

Toonflow 使用独立的 OAuth PKCE 授权流程，不读取 Codex 登录文件，不使用 `OPENAI_API_KEY`，也不调用付费 API。授权文件只保存在当前服务数据目录的 `gptImageSubscription/auth.json`，Linux 权限设置为 `0600`；不要将该文件、Cookie 或 Token 复制进 Git、镜像或日志。换电脑后在新电脑自己的 Toonflow 页面重新授权即可。

## 生图行为

- 固定请求模型标识：`gpt-image-2.6-flare`。
- 质量请求值固定为 `auto`；上游可能返回不同质量，界面不承诺精确控制。
- 支持请求 `1:1`、`16:9`、`9:16`。实际输出像素和最终构图由上游决定，比例不是精确像素保证。
- 支持文生图以及最多 5 张 PNG、JPEG 或 WebP 参考图编辑。
- 生成文件写入当前工作区 `.toonflow/drama/assets/<项目 ID>/generated`，并登记为现有 `DramaAsset`。只有用户点击“确认用作首帧”后，素材才关联到镜头首帧；参考素材 ID 与项目、剧集、场景、镜头关联一并保留。

## 更新当前功能分支

```powershell
git fetch origin
git switch poc/gpt-image-provider
git pull --ff-only origin poc/gpt-image-provider
docker compose -p toonflow -f compose.yaml up -d --build
```

`--ff-only` 会在远端分支出现分叉时停止，不会覆盖本地提交。Docker 数据卷需要单独备份并按组织的数据迁移流程处理；OAuth 授权建议在新电脑重新完成。
