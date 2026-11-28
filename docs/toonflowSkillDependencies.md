# Toonflow Pipeline 依赖 Skills

检查日期：2026-11-28。当前电脑的 Codex 用户级 Skills 目录为 `%USERPROFILE%\.agents\skills`。

所有下列 Skill 均在本机对应目录找到 `SKILL.md`。这 14 个目录均没有 `.git` 元数据，主文档也没有声明语义版本或上游 commit，因此不能从本机安装副本准确还原安装版本。表中的 SHA-256 是检查时本机 `SKILL.md` 文件的指纹，用于识别当前快照，不代表上游版本号；没有复制这些第三方 Skill 到 Toonflow 仓库，也没有在本轮升级它们。

| Skill | 本机版本记录 | 来源仓库 | 可靠安装方式 |
| --- | --- | --- | --- |
| `short-drama` | 未声明版本；SKILL.md SHA-256 `C525FDCEC1535C23B6222F4417EAA8D1D43794F686495E13950CD9B1E02B9F8E` | [zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills) | `npx skills add https://github.com/zenstory-ai/drama-skills --skill short-drama -g` |
| `short-drama-develop` | 未声明版本；SKILL.md SHA-256 `A78276CF1C0D3D3BC6F3223CDB34BD5C4A275A2406310EC2D1D9F068B465DE18` | [zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills) | `npx skills add https://github.com/zenstory-ai/drama-skills --skill short-drama-develop -g` |
| `short-drama-write` | 未声明版本；SKILL.md SHA-256 `4E9645E99E817B593871ABAA6C05EF5E52064DCED0AFC12B0ABD22126BEE5F67` | [zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills) | `npx skills add https://github.com/zenstory-ai/drama-skills --skill short-drama-write -g` |
| `short-drama-review` | 未声明版本；SKILL.md SHA-256 `E6E19374E281FA191672E922CE343BCB094862B747E551056AA76DA02F840C0D` | [zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills) | `npx skills add https://github.com/zenstory-ai/drama-skills --skill short-drama-review -g` |
| `short-drama-assets` | 未声明版本；SKILL.md SHA-256 `050BBBBA6452A35E01E0D0360D2AAE650B541DB1EC5280D5D368FA16AF0FA344` | [zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills) | `npx skills add https://github.com/zenstory-ai/drama-skills --skill short-drama-assets -g` |
| `short-drama-storyboard` | 未声明版本；SKILL.md SHA-256 `DC075FF0E294BE9B0EA6E0DC13106D10326EB9B7D751FF980FE4EACA62AC25E8` | [zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills) | `npx skills add https://github.com/zenstory-ai/drama-skills --skill short-drama-storyboard -g` |
| `short-drama-image-prompts` | 未声明版本；SKILL.md SHA-256 `F0CCF2855883AF6E1D2993C8B38AF6898F38312A899D483B54E446B17105CF0B` | [zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills) | `npx skills add https://github.com/zenstory-ai/drama-skills --skill short-drama-image-prompts -g` |
| `short-drama-video-prompts` | 未声明版本；SKILL.md SHA-256 `35FD8F9208250279354DDAC0176F67F88D00838B9197CE116E37F0FFD874EF72` | [zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills) | `npx skills add https://github.com/zenstory-ai/drama-skills --skill short-drama-video-prompts -g` |
| `short-drama-novel-analyze` | 未声明版本；SKILL.md SHA-256 `773C68892EFDD0612781FDE01E7C2C91FE1FD1C29614236C24A58BFEF00EA582` | [zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills) | `npx skills add https://github.com/zenstory-ai/drama-skills --skill short-drama-novel-analyze -g` |
| `short-drama-breakdown` | 未声明版本；SKILL.md SHA-256 `72F93B0D0D7188A0C8B9A376FC54B2D4ECB183D53432B8A3895CFA6DF8243635` | [zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills) | `npx skills add https://github.com/zenstory-ai/drama-skills --skill short-drama-breakdown -g` |
| `short-drama-produce` | 未声明版本；SKILL.md SHA-256 `1A9421B90DF6AEA15E7BBDE9820DE23413774029AB19694D5FECE0081CB67D9D` | [zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills) | `npx skills add https://github.com/zenstory-ai/drama-skills --skill short-drama-produce -g` |
| `short-drama-edit` | 未声明版本；SKILL.md SHA-256 `B992639D66076ACBE9860296B278CEFA005619D039B5586352615DB254BA775A` | [zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills) | `npx skills add https://github.com/zenstory-ai/drama-skills --skill short-drama-edit -g` |
| `h3-storyboard` | 未声明版本；SKILL.md SHA-256 `BC0182884FEE126253D4CC7E5B1C4B56169617A5B0791244D6B68420F2F451E3` | [phileiny/h3-storyboard-skill](https://github.com/phileiny/h3-storyboard-skill) | `npx skills add https://github.com/phileiny/h3-storyboard-skill --skill h3-storyboard -g` |
| `h3-prompt-writing` | 未声明版本；SKILL.md SHA-256 `95D74FEE00E78641FB9E774AB17488516CEECE441231519287F0D3128EAA8C54` | [MiniMax-AI/MiniMax-H3](https://github.com/MiniMax-AI/MiniMax-H3) | `npx skills add https://github.com/MiniMax-AI/MiniMax-H3 --skill h3-prompt-writing -g` |

`npx skills add` 从仓库默认分支安装当前版本；如果需要可重复的精确版本，应先检查上游提交并将依赖仓库固定到经审核的 commit。公司电脑只需更新 Pipeline Skill 时运行 `scripts\syncToonflowScriptPipeline.ps1`；脚本会检查上述 14 个目录是否已有 `SKILL.md`，不会替换或升级这些依赖 Skill。

官方 Codex 用户级 Skill 目录为 `~/.agents/skills/`。脚本默认写入 `%USERPROFILE%\.agents\skills\toonflow-script-pipeline`，如公司电脑使用不同目录，可在运行前设置 `TOONFLOW_CODEX_SKILLS_DIR`。
