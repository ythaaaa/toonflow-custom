# 剧本文档数据与外部 Codex 导入

剧本项目保存在当前工作区的 .toonflow/drama/。新项目使用独立目录：

    .toonflow/drama/projects/{projectId}/
      project.json
      documents/
        overview.md
        world.md
        characters.md
        characterRelations.md
        scenes.md
        props.md
        seasons/{seasonId}/
          outline.md
          episodeOutlines.md
      scripts/{episodeId}/
        draft.md
        storyboard.md
        imagePrompts.md
        videoPrompts.md
        {versionId}.md

project.json 是项目、季度、分集、人物、场景、镜头和版本的现有索引。项目 ID、季度 ID、分集 ID 用于关联数据；剧本中心界面不显示这些 ID。旧版兼容项目仍使用 .toonflow/drama/project.json，其剧本文件路径以 scriptPath、工作稿路径以 draftPath 为准。

project.json 中常用字段：

- 项目：id、name、genre、style、storyOutline、seasons、episodes、characters、assets、scriptVersions
- 季度：seasons[] 的 id、name、episodes（分集 ID 列表）
- 分集：episodes[] 的 id、seasonId、number、title、outline、scriptPath、draftPath、scriptVersion、scenes、shots
- 版本：scriptVersions[episodeId][]，每条记录包含 id、version、path、createdAt、status

全剧 Markdown 文档位于 documents/，由项目内所有分集共享。故事大纲和视觉风格沿用 project.json 的 storyOutline、style 字段；分季大纲保存在 documents/seasons/{seasonId}/outline.md。分集大纲文档按“EP001 · 集名”标题分段，剧本中心保存时会同步到相应分集的 outline 字段。分镜脚本和提示词文档从已有场景、镜头数据生成初始内容；没有文档时也可以直接新建编辑。

剧本正文优先显示分集工作稿 scripts/{episodeId}/draft.md，没有工作稿时读取 scriptPath 指向的现有版本。使用“保存”更新工作稿；使用“保存为新版本”时会新增 Markdown 版本文件，并保留既有版本记录。

## 外部 Codex 写入

外部 Codex 可直接在工作区按上面的相对路径新建或更新 UTF-8 Markdown 文件，无需导入向导或新增数据库记录。projectId 和 episodeId 可从对应项目的 project.json 读取；新增文档不需要改动 project.json。通过应用现有文件接口写入时，使用 useWorkspaceFiles(directory).write(path, content)，其中 directory 是当前工作区绝对路径，path 是工作区内相对路径。保存后在剧本中心切换文档或重新打开项目即可读取。

直接修改 project.json 时，请保留现有 ID、字段和其他未修改数据，并保持 seasons[].episodes 与 episodes[].seasonId 的关联一致。不要用局部 JSON 覆盖整个项目文件。
