<template>
  <main class="dramaCenter">
    <header class="dramaHeader">
      <div><h1>短剧创作中心</h1><p>{{ workspace.project?.name }} · 项目工作区</p></div>
      <div class="headerActions"><el-button @click="emit('returnWorkspace')">返回工作区</el-button><el-button v-if="project" @click="returnToProjects">项目列表</el-button><el-button v-if="project" type="primary" @click="save">保存更改</el-button><el-button v-if="!project && !showCreateForm && !loading" type="primary" @click="showCreateForm = true">新建短剧</el-button></div>
    </header>
    <section v-if="loading" class="loadingState"><el-skeleton :rows="5" animated /></section>
    <section v-else-if="loadError" class="loadingState"><el-alert type="error" :title="loadError" showIcon /><el-button @click="loadProjects">重试读取</el-button></section>
    <section v-else-if="!project && !showCreateForm" class="projectList">
      <div class="panelHeading"><div><h2>短剧项目</h2><p>{{ workspace.project?.name }} 工作区 · {{ projects.length }} 个项目</p></div><el-button type="primary" @click="showCreateForm = true">新建短剧</el-button></div>
      <el-empty v-if="!projects.length" description="当前工作区还没有短剧项目" />
      <el-table v-else :data="projects" rowKey="id" @rowClick="openProject($event as DramaProject)"><el-table-column prop="name" label="项目名称" minWidth="220" /><el-table-column prop="genre" label="题材" minWidth="160" /><el-table-column prop="style" label="画面风格" minWidth="180" /><el-table-column label="集数" width="100"><template #default="scope">{{ scope.row.episodes.length }} / {{ scope.row.targetEpisodes }}</template></el-table-column><el-table-column prop="updatedAt" label="最近修改" minWidth="170"><template #default="scope">{{ formatDate(scope.row.updatedAt) }}</template></el-table-column><el-table-column label="操作" width="110"><template #default="scope"><el-button link type="primary" @click.stop="openProject(scope.row as DramaProject)">打开项目</el-button></template></el-table-column></el-table>
    </section>
    <section v-else-if="!project" class="projectSetup">
      <el-button text @click="showCreateForm = false">返回项目列表</el-button>
      <h2>创建短剧项目</h2>
      <el-form labelPosition="top" @submit.prevent="createProject">
        <el-form-item label="项目名称"><el-input v-model="form.name" maxlength="120" /></el-form-item>
        <div class="formRow"><el-form-item label="类型 / 题材"><el-input v-model="form.genre" /></el-form-item><el-form-item label="画面风格"><el-input v-model="form.style" /></el-form-item></div>
        <div class="formRow"><el-form-item label="目标集数"><el-input-number v-model="form.targetEpisodes" :min="1" :max="500" /></el-form-item><el-form-item label="单集目标时长（秒）"><el-input-number v-model="form.targetDuration" :min="30" :max="7200" /></el-form-item></div>
        <el-button type="primary" :loading="busy" @click="createProject">创建项目</el-button>
      </el-form>
    </section>
    <template v-else>
      <div class="workspaceTopbar"><div><strong>{{ project.name }}</strong><span>{{ currentSeason?.name ?? '未选择季度' }}<template v-if="currentEpisode"> / EP{{ String(currentEpisode.number).padStart(3, '0') }} · {{ currentEpisode.title }}</template></span></div><div class="topbarMeta"><span>{{ project.genre || '未设题材' }}</span><span>{{ project.episodes.length }} 集</span><el-tag>{{ currentEpisode?.status ?? '未选择分集' }}</el-tag></div></div>
      <div class="dramaLayout" :class="{ assistantCollapsed }">
        <dramaStudioNav :items="sections" :seasons="project.seasons" :episodes="seasonEpisodes" :section="section" :scriptView="scriptView" :assetView="assetView" :seasonId="seasonId" :currentEpisodeId="currentEpisodeId" @navigate="navigateSection" @scriptView="scriptView = $event" @assetView="assetView = $event" @season="seasonId = $event" @episode="currentEpisodeId = $event" @addSeason="addSeason" />
        <section class="dramaContent">
          <div v-if="section === 'overview'" class="contentPanel">
            <div class="panelHeading"><div><h2>项目总览</h2><p>项目资料、创作进度与快速入口</p></div><el-button type="primary" @click="navigateSection('story')">故事策划</el-button></div>
            <div class="overviewGrid"><div><span>季度</span><strong>{{ project.seasons.length }}</strong><el-button link @click="navigateSection('episodes')">进入全季规划</el-button></div><div><span>分集</span><strong>{{ project.episodes.length }} / {{ project.targetEpisodes }}</strong><el-button link @click="navigateSection('episodes')">查看分集</el-button></div><div><span>有版本的剧集</span><strong>{{ project.episodes.filter(item => item.scriptVersion > 0).length }}</strong><el-button link @click="navigateSection('script')">进入分集剧本</el-button></div><div><span>场景 / 镜头</span><strong>{{ project.episodes.reduce((sum, item) => sum + item.scenes.length, 0) }} / {{ project.episodes.reduce((sum, item) => sum + item.shots.length, 0) }}</strong><el-button link @click="navigateSection('scenes')">场景管理</el-button></div><div><span>最近修改</span><strong>{{ formatDate(project.updatedAt) }}</strong><el-button link @click="navigateSection('storyboard')">分镜镜头</el-button></div></div>
            <div class="overviewQuickLinks"><el-button @click="navigateSection('characters')">人物资产</el-button><el-button @click="navigateSection('assets')">场景道具资产</el-button><el-button @click="navigateSection('canvas')">制作画布</el-button></div>
          </div>
          <div v-else-if="section === 'story'" class="contentPanel">
            <h2>故事策划</h2><div class="overviewGrid"><div><span>题材</span><strong>{{ project.genre || '未填写' }}</strong></div><div><span>风格</span><strong>{{ project.style || '未填写' }}</strong></div><div><span>目标集数</span><strong>{{ project.targetEpisodes }}</strong></div><div><span>单集时长</span><strong>{{ project.targetDuration }} 秒</strong></div></div>
            <el-alert class="capabilityNote" type="info" :closable="false" title="当前可编辑项目基础资料和全季故事总纲。世界观结构、人物关系图和全季自动规划尚未实现，页面不会生成虚构内容。" />
            <div class="overviewQuickLinks"><el-button disabled>世界观资料（暂未实现）</el-button><el-button disabled>人物关系（暂未实现）</el-button></div>
            <el-form labelPosition="top"><div class="formRow"><el-form-item label="项目名称"><el-input v-model="project.name" /></el-form-item><el-form-item label="题材"><el-input v-model="project.genre" /></el-form-item><el-form-item label="画面风格"><el-input v-model="project.style" /></el-form-item></div><div class="formRow"><el-form-item label="目标集数"><el-input-number v-model="project.targetEpisodes" :min="1" :max="500" /></el-form-item><el-form-item label="单集目标时长（秒）"><el-input-number v-model="project.targetDuration" :min="30" :max="7200" /></el-form-item></div><el-form-item label="全季故事总纲"><el-input v-model="project.storyOutline" type="textarea" :rows="5" placeholder="记录世界观、整季主线和上下集衔接原则" /></el-form-item></el-form>
          </div>
          <div v-else-if="section === 'episodes'" class="contentPanel">
            <div class="panelHeading"><div><h2>季度与分集</h2><p>{{ currentSeason?.name ?? '请先创建季度' }}</p></div><el-button type="primary" :disabled="!currentSeason" @click="addEpisode">新增一集</el-button></div>
            <el-table :data="seasonEpisodes" rowKey="id" @rowClick="selectEpisode"><el-table-column prop="number" label="序号" width="90"><template #default="scope">EP{{ String(scope.row.number).padStart(3, '0') }}</template></el-table-column><el-table-column label="集名" minWidth="170"><template #default="scope"><el-input v-model="scope.row.title" /></template></el-table-column><el-table-column label="分集大纲" minWidth="250"><template #default="scope"><el-input v-model="scope.row.outline" /></template></el-table-column><el-table-column label="状态" width="120"><template #default="scope"><el-tag>{{ scope.row.status }}</el-tag></template></el-table-column><el-table-column label="剧本版本" width="100"><template #default="scope">{{ scope.row.scriptVersion || '—' }}</template></el-table-column></el-table>
          </div>
          <div v-else-if="section === 'script' && scriptView === 'editor'" class="contentPanel">
            <div class="panelHeading"><div><h2>剧本编辑</h2><p>{{ episodeLabel }} · Markdown · {{ autosaveStatus }} · 正式版：{{ formalVersionLabel }}</p></div><div><el-button :disabled="!currentEpisode" :loading="busy" @click="saveScriptDraft">保存工作稿</el-button><el-button :disabled="!scriptText.trim()" @click="runCodexTask('scenes')">Codex 拆分场景</el-button><el-button :disabled="!scriptText.trim() || !currentEpisode?.scenes.length" @click="runCodexTask('shots')">Codex 生成分镜</el-button><el-button type="primary" :disabled="!currentEpisode || !scriptText.trim()" :loading="busy" @click="saveScript">保存为新版本</el-button></div></div>
            <div v-if="currentEpisode" class="scriptLayout"><div class="scriptEditor"><el-input v-model="scriptText" type="textarea" :rows="24" resize="vertical" aria-label="Markdown 剧本正文" placeholder="编辑本集完整剧本；内容自动保存为工作稿。" /><p>自动保存只更新独立工作稿，不改写任何版本文件。</p><div class="scriptVersionSummary"><span>最近版本：{{ latestVersionLabel }}</span><span v-if="currentEpisode.formalVersionId">正式版已锁定，工作稿修改不会覆盖正式版本。</span></div></div></div>
            <el-empty v-else description="请先选择或创建分集" />
          </div>
          <div v-else-if="section === 'scenes'" class="contentPanel">
            <div class="panelHeading"><div><h2>场景管理</h2><p>{{ episodeLabel }} · {{ activeScenes.length }} 个场景 · 已归档 {{ archivedScenes.length }}</p></div><div><el-checkbox v-model="showArchivedScenes">显示已归档</el-checkbox><el-button type="primary" :disabled="!currentEpisode" @click="addScene">新增场景</el-button><el-button :disabled="!currentEpisode" @click="save">保存场景</el-button></div></div>
            <el-table v-if="currentEpisode" :data="visibleScenes" rowKey="id" @rowClick="selectScene($event as DramaScene)">
              <el-table-column prop="number" label="场次" width="86"><template #default="scope">S{{ String(scope.row.number).padStart(3, "0") }}</template></el-table-column>
              <el-table-column label="地点 / 标题" minWidth="190"><template #default="scope"><el-input v-model="scope.row.heading" aria-label="场景标题" /><el-input v-model="scope.row.location" aria-label="场景地点" /></template></el-table-column>
              <el-table-column label="内外景 / 时段" width="190"><template #default="scope"><el-select v-model="scope.row.interiorExterior" aria-label="内景或外景"><el-option label="内景" value="内景" /><el-option label="外景" value="外景" /></el-select><el-select v-model="scope.row.dayPart" aria-label="场景时段"><el-option v-for="item in dayParts" :key="item" :label="item" :value="item" /></el-select></template></el-table-column>
              <el-table-column label="时间" width="130"><template #default="scope"><el-input v-model="scope.row.time" aria-label="场景时间" /></template></el-table-column>
              <el-table-column label="出场人物" width="170"><template #default="scope"><el-input v-model="scope.row.charactersText" @change="syncSceneCharacters(scope.row as DramaScene)" /></template></el-table-column>
              <el-table-column label="场景描述" minWidth="260"><template #default="scope"><el-input v-model="scope.row.description" type="textarea" :rows="2" /></template></el-table-column>
              <el-table-column label="排序 / 操作" width="200" fixed="right"><template #default="scope"><el-button link :disabled="scope.$index === 0" @click="moveScene(scope.row as DramaScene, -1)">上移</el-button><el-button link :disabled="scope.$index === visibleScenes.length - 1" @click="moveScene(scope.row as DramaScene, 1)">下移</el-button><el-button link @click="copyScene(scope.row as DramaScene)">复制</el-button><el-button link type="warning" @click="toggleSceneArchive(scope.row as DramaScene)">{{ scope.row.archived ? "恢复" : "归档" }}</el-button></template></el-table-column>
            </el-table>
            <el-empty v-else description="请先选择分集" />
          </div>
          <div v-else-if="section === 'storyboard'" class="contentPanel">
            <div class="panelHeading"><div><h2>分镜管理</h2><p>{{ episodeLabel }} · {{ filteredShots.length }} 个镜头 · 镜号与稳定 ID 独立于排序</p></div><div><el-select v-model="shotSceneFilter" aria-label="按场景筛选"><el-option label="所有场景" value="all" /><el-option v-for="scene in activeScenes" :key="scene.id" :label="scene.heading || `场景 ${scene.number}`" :value="scene.id" /></el-select><el-button :disabled="!currentEpisode" @click="viewMode = viewMode === 'table' ? 'cards' : 'table'">{{ viewMode === 'table' ? '卡片视图' : '表格视图' }}</el-button><el-button type="primary" :disabled="!currentEpisode" @click="addShot">新增镜头</el-button><el-button :disabled="!currentEpisode" @click="save">保存分镜</el-button></div></div>
            <div class="batchBar"><el-select v-model="batchProductionStatus" aria-label="批量制作状态"><el-option v-for="item in productionStatuses" :key="item" :label="item" :value="item" /></el-select><el-button :disabled="!selectedShots.length" @click="applyBatchProductionStatus">更新所选制作状态</el-button><el-select v-model="batchReviewStatus" aria-label="批量审核状态"><el-option v-for="item in reviewStatuses" :key="item" :label="item" :value="item" /></el-select><el-button :disabled="!selectedShots.length" @click="applyBatchReviewStatus">更新所选审核状态</el-button></div>
            <el-table v-if="currentEpisode && viewMode === 'table'" :data="filteredShots" rowKey="id" @selectionChange="selectedShots = $event as DramaShot[]" @rowClick="selectShot($event as DramaShot)">
              <el-table-column type="selection" width="48" /><el-table-column prop="number" label="镜号" width="95" />
              <el-table-column label="场景" width="160"><template #default="scope"><el-select v-model="scope.row.sceneId" aria-label="镜头场景"><el-option v-for="scene in activeScenes" :key="scene.id" :label="scene.heading || `场景 ${scene.number}`" :value="scene.id" /></el-select></template></el-table-column>
              <el-table-column label="景别 / 机位" width="175"><template #default="scope"><el-input v-model="scope.row.size" aria-label="景别" /><el-input v-model="scope.row.angle" aria-label="机位" /></template></el-table-column>
              <el-table-column label="画面" minWidth="220"><template #default="scope"><el-input v-model="scope.row.description" aria-label="画面描述" type="textarea" :rows="2" /></template></el-table-column>
              <el-table-column label="动作 / 对白" minWidth="230"><template #default="scope"><el-input v-model="scope.row.action" aria-label="人物动作" /><el-input v-model="scope.row.dialogue" aria-label="人物台词" /></template></el-table-column>
              <el-table-column label="时长" width="105"><template #default="scope"><el-input-number v-model="scope.row.duration" :min="1" :max="600" aria-label="镜头时长" /></template></el-table-column>
              <el-table-column label="制作 / 审核" width="190"><template #default="scope"><el-select v-model="scope.row.productionStatus" aria-label="制作状态"><el-option v-for="item in productionStatuses" :key="item" :label="item" :value="item" /></el-select><el-select v-model="scope.row.reviewStatus" aria-label="镜头审核状态"><el-option v-for="item in reviewStatuses" :key="item" :label="item" :value="item" /></el-select></template></el-table-column>
              <el-table-column label="操作" width="150" fixed="right"><template #default="scope"><el-button link type="primary" @click="openShotDetail(scope.row as DramaShot)">详情</el-button><el-button link @click="copyShot(scope.row as DramaShot)">复制</el-button><el-button link :disabled="scope.$index === 0" @click="moveShot(scope.row as DramaShot, -1)">上移</el-button><el-button link :disabled="scope.$index === filteredShots.length - 1" @click="moveShot(scope.row as DramaShot, 1)">下移</el-button></template></el-table-column>
            </el-table>
            <div v-else-if="currentEpisode" class="shotCards"><article v-for="shot in filteredShots" :key="shot.id" @click="selectShot(shot)"><strong>{{ shot.number }} · {{ sceneTitle(shot.sceneId) }}</strong><span>{{ shot.description }}</span><small>{{ shot.size }} · {{ shot.duration }} 秒 · {{ shot.productionStatus }} · {{ shot.reviewStatus }}</small><el-button link @click.stop="openShotDetail(shot)">编辑详情</el-button></article></div>
            <el-empty v-else description="请先选择分集" />
          </div>
          <div v-else-if="section === 'characters'" class="contentPanel">
            <div class="panelHeading"><div><h2>人物资产</h2><p>项目内跨集复用；图片以工作区相对路径关联</p></div><el-button type="primary" @click="addCharacter">新增人物</el-button></div>
            <el-table :data="project.characters" rowKey="id"><el-table-column prop="name" label="人物" width="160"><template #default="scope"><el-input v-model="scope.row.name" /></template></el-table-column><el-table-column prop="description" label="背景与性格" minWidth="220"><template #default="scope"><el-input v-model="scope.row.description" type="textarea" :rows="2" /></template></el-table-column><el-table-column prop="appearance" label="造型设定" minWidth="220"><template #default="scope"><el-input v-model="scope.row.appearance" type="textarea" :rows="2" /></template></el-table-column><el-table-column prop="referencePath" label="定妆图路径" minWidth="200"><template #default="scope"><el-input v-model="scope.row.referencePath" /></template></el-table-column><el-table-column prop="version" label="版本" width="80" /></el-table>
            <el-button class="saveInline" @click="save">保存人物更改</el-button>
          </div>
          <div v-else-if="section === 'assets'" class="contentPanel">
            <div class="panelHeading"><div><h2>{{ assetSectionLabel }}</h2><p>以稳定 ID 关联项目；文件路径使用 Toonflow 工作区相对路径</p></div><el-button type="primary" @click="addAsset(assetView === 'scenesAssets' ? 'scene' : assetView === 'props' ? 'prop' : 'image')">{{ assetView === 'scenesAssets' ? '新增场景资产' : assetView === 'props' ? '新增道具' : '登记图片' }}</el-button></div>
            <el-tabs v-model="assetView" class="assetTabs"><el-tab-pane label="场景资产" name="scenesAssets" /><el-tab-pane label="道具资产" name="props" /><el-tab-pane label="图片素材" name="media" /></el-tabs>
            <el-alert type="info" :closable="false" title="当前资产数据没有镜头引用反查能力；素材路径与版本可维护，引用关系查看将在后续阶段补齐。" />
            <el-table :data="project.assets.filter(item => item.kind === (assetView === 'scenesAssets' ? 'scene' : assetView === 'props' ? 'prop' : 'image'))" rowKey="id"><el-table-column prop="name" label="名称" width="180"><template #default="scope"><el-input v-model="scope.row.name" /></template></el-table-column><el-table-column prop="description" label="描述" minWidth="260"><template #default="scope"><el-input v-model="scope.row.description" type="textarea" :rows="2" /></template></el-table-column><el-table-column prop="referencePath" :label="assetView === 'media' ? '图片路径' : '参考图片路径'" minWidth="240"><template #default="scope"><el-input v-model="scope.row.referencePath" /></template></el-table-column><el-table-column prop="version" label="版本" width="80" /></el-table>
            <el-button class="saveInline" @click="save">保存更改</el-button>
          </div>
          <div v-else-if="section === 'script' && scriptView === 'review'" class="contentPanel">
            <h2>版本与审核</h2><p>正式版引用不可变的 Markdown 版本文件；工作稿自动保存到单独文件。</p>
            <div v-if="currentEpisode" class="versionCompareControls"><el-select v-model="compareLeftId" aria-label="对比版本一"><el-option v-for="item in currentVersionRows" :key="item.id" :label="versionLabel(item)" :value="item.id" /></el-select><el-select v-model="compareRightId" aria-label="对比版本二"><el-option v-for="item in currentVersionRows" :key="item.id" :label="versionLabel(item)" :value="item.id" /></el-select><el-button :disabled="!compareLeftId || !compareRightId || compareLeftId === compareRightId" @click="compareVersions">对比所选版本</el-button></div>
            <el-table :data="scriptVersionRows" rowKey="id"><el-table-column prop="episodeLabel" label="分集" minWidth="180" /><el-table-column prop="version" label="版本" width="90"><template #default="scope">V{{ String(scope.row.version).padStart(3, "0") }}</template></el-table-column><el-table-column prop="createdAt" label="保存时间" width="190"><template #default="scope">{{ formatDate(scope.row.createdAt) }}</template></el-table-column><el-table-column prop="status" label="审核状态" width="130" /><el-table-column label="正式版" width="90"><template #default="scope">{{ isFormalVersion(scope.row.episodeId, scope.row.id) ? "正式版" : "—" }}</template></el-table-column><el-table-column label="操作" width="310" fixed="right"><template #default="scope"><el-button link @click="loadVersion(scope.row as DramaScriptVersion & { episodeId: string })">读取</el-button><el-button link @click="restoreVersion(scope.row as DramaScriptVersion & { episodeId: string })">恢复为新版本</el-button><el-button link :disabled="scope.row.status === '已确认' || scope.row.status === '已归档'" @click="setVersionReview(scope.row as DramaScriptVersion & { episodeId: string }, '待审核')">提交审核</el-button><el-button link type="primary" :disabled="scope.row.status !== '待审核' && scope.row.status !== '已确认'" @click="confirmFormalVersion(scope.row as DramaScriptVersion & { episodeId: string })">确认正式</el-button></template></el-table-column></el-table>
          </div>
          <div v-else-if="section === 'canvas'" class="contentPanel canvasEntry"><div><h2>制作画布</h2><p>使用 Toonflow 原有画布、节点和工作流。正式剧本、场景与镜头继续保存在短剧项目数据中。</p></div><el-button type="primary" @click="emit('openCanvas')">打开制作画布</el-button></div>
        </section>
        <codexAssistantPane ref="codexConversation" v-model:selectedModel="codexModel" v-model:collapsed="assistantCollapsed" :directory="workspace.project?.directory" :context="codexContext" @assistantCompleted="receiveCodexReply" />
      </div>
    </template>
    <el-dialog v-model="compareVisible" title="剧本版本对比" width="min(1200px, 92vw)" destroyOnClose>
      <div class="compareColumns"><section><h3>{{ compareLeftLabel }}</h3><pre>{{ compareLeftText }}</pre></section><section><h3>{{ compareRightLabel }}</h3><pre>{{ compareRightText }}</pre></section></div>
    </el-dialog>
    <el-dialog v-model="shotDetailVisible" title="镜头详情" width="min(900px, 92vw)" destroyOnClose>
      <el-form v-if="shotDraft" labelPosition="top" class="shotDetailForm">
        <el-form-item label="镜头编号"><el-input v-model="shotDraft.number" disabled /></el-form-item>
        <el-form-item label="所属场景"><el-select v-model="shotDraft.sceneId"><el-option v-for="scene in currentEpisode?.scenes.filter(item => !item.archived)" :key="scene.id" :label="scene.heading || `场景 ${scene.number}`" :value="scene.id" /></el-select></el-form-item>
        <el-form-item label="景别"><el-input v-model="shotDraft.size" /></el-form-item><el-form-item label="机位"><el-input v-model="shotDraft.angle" /></el-form-item><el-form-item label="构图"><el-input v-model="shotDraft.composition" /></el-form-item>
        <el-form-item label="画面描述"><el-input v-model="shotDraft.description" type="textarea" :rows="3" /></el-form-item><el-form-item label="人物动作"><el-input v-model="shotDraft.action" type="textarea" :rows="2" /></el-form-item><el-form-item label="人物表情"><el-input v-model="shotDraft.expression" /></el-form-item>
        <el-form-item label="台词"><el-input v-model="shotDraft.dialogue" type="textarea" :rows="2" /></el-form-item><el-form-item label="时长（秒）"><el-input-number v-model="shotDraft.duration" :min="1" :max="600" /></el-form-item><el-form-item label="画幅"><el-input v-model="shotDraft.aspectRatio" placeholder="例如 9:16" /></el-form-item>
        <el-form-item label="运镜"><el-input v-model="shotDraft.movement" /></el-form-item><el-form-item label="音效 / 声音设计"><el-input v-model="shotDraft.sound" type="textarea" :rows="2" /></el-form-item><el-form-item label="图片提示词"><el-input v-model="shotDraft.imagePrompt" type="textarea" :rows="3" /></el-form-item><el-form-item label="视频提示词"><el-input v-model="shotDraft.videoPrompt" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="GPT 会员生图">
          <div class="gptImagePanel">
            <div class="gptImageAuth"><span>授权状态：{{ gptImageStatus.authenticated ? `已连接${gptImageStatus.email ? ` · ${gptImageStatus.email}` : ""}` : "未授权" }}</span><el-button v-if="!gptImageStatus.authenticated" size="small" :loading="gptAuthBusy" @click="authorizeGptImage">独立 ChatGPT 授权</el-button><el-button v-else size="small" @click="logoutGptImage">退出授权</el-button></div>
            <p class="gptImageNote">固定模型 gpt-image-2.6-flare；质量请求固定为 auto，实际画质由上游决定。比例通过请求画布尺寸与提示词尽力控制，实际像素不保证。</p>
            <el-select v-model="gptImageRatio" aria-label="生图画幅" style="width: 180px"><el-option label="1:1 方形" value="1:1" /><el-option label="16:9 横屏" value="16:9" /><el-option label="9:16 竖屏" value="9:16" /></el-select>
            <el-select v-model="gptReferenceAssetIds" multiple clearable filterable placeholder="选择人物或场景参考图" style="width: 100%; margin-top: 8px"><el-option v-for="item in gptReferenceOptions" :key="item.id" :label="item.label" :value="item.id" /></el-select>
            <div class="gptImageUpload"><el-select v-model="gptReferenceCategory" style="width: 150px"><el-option label="人物定妆图" value="人物定妆图" /><el-option label="场景参考图" value="场景参考图" /></el-select><input type="file" accept="image/png,image/jpeg,image/webp" multiple :disabled="gptReferenceUploading" @change="uploadGptReferences" /><span>上传 PNG / JPEG / WebP（单张不超过 12 MB）</span></div>
            <div class="gptImageActions"><el-button type="primary" :disabled="!gptImageStatus.authenticated || !shotDraft.imagePrompt?.trim()" :loading="gptImageGenerating" @click="generateShotImage">{{ gptImageGenerating ? "正在生成并保存…" : gptReferenceAssetIds.length ? "参考图编辑" : "文生图" }}</el-button><span v-if="gptImageGenerating">请求已提交，等待上游返回图片。</span></div>
            <div v-if="gptPreviewUrl" class="gptImagePreview"><img :src="gptPreviewUrl" alt="当前镜头图片素材预览" /><div><span>{{ gptPreviewLabel }}</span><el-button v-if="gptGeneratedAsset" size="small" type="primary" @click="confirmGeneratedImage">确认用作首帧</el-button></div></div>
          </div>
        </el-form-item>
        <el-form-item label="首帧素材"><el-select v-model="shotDraft.firstFrameAssetId" clearable @change="loadSelectedShotPreview"><el-option v-for="asset in imageAssets" :key="asset.id" :label="asset.name || asset.id" :value="asset.id" /></el-select></el-form-item>
        <el-form-item label="尾帧素材"><el-select v-model="shotDraft.lastFrameAssetId" clearable><el-option v-for="asset in imageAssets" :key="asset.id" :label="asset.name || asset.id" :value="asset.id" /></el-select></el-form-item>
        <el-form-item label="参考素材"><el-select v-model="shotDraft.referenceAssetIds" multiple clearable><el-option v-for="asset in project?.assets ?? []" :key="asset.id" :label="asset.name || asset.id" :value="asset.id" /></el-select></el-form-item>
        <el-form-item label="旧版参考图路径"><el-input v-model="shotDraft.referencePath" /></el-form-item><el-form-item label="制作状态"><el-select v-model="shotDraft.productionStatus"><el-option v-for="item in productionStatuses" :key="item" :label="item" :value="item" /></el-select></el-form-item><el-form-item label="审核状态"><el-select v-model="shotDraft.reviewStatus"><el-option v-for="item in reviewStatuses" :key="item" :label="item" :value="item" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="shotDetailVisible = false">取消</el-button><el-button type="primary" :loading="busy" @click="saveShotDetail">保存镜头</el-button></template>
    </el-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import http from "@/lib/http";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import dramaStudioNav from "./dramaStudioNav.vue";
import codexAssistantPane from "./codexAssistantPane.vue";
import { createDramaProject, createSeason, listDramaProjects, readEpisodeScript, saveDramaProject, saveEpisodeDraft, saveEpisodeScriptVersion, updateScriptReview, type DramaAsset, type DramaCharacter, type DramaEpisode, type DramaProject, type DramaProductionStatus, type DramaScene, type DramaShot, type DramaStatus, type DramaScriptVersion } from "@/lib/dramaWorkspace";

const router = useRouter();
const emit = defineEmits<{ returnWorkspace: []; openCanvas: [] }>();
const workspace = useWorkspaceStore();
const workspaceDirectory = ref(workspace.project?.directory);
const project = ref<DramaProject>();
const projectEntries = ref<{ project: DramaProject; path: string }[]>([]);
const projects = computed(() => projectEntries.value.map(item => item.project));
const manifestPath = ref("");
const loading = ref(true);
const loadError = ref("");
const showCreateForm = ref(false);
const busy = ref(false);
const section = ref("overview");
const scriptView = ref("editor");
const assetView = ref("scenesAssets");
const currentEpisodeId = ref("");
const seasonId = ref("");
const scriptText = ref("");
const scriptDirty = ref(false);
const viewMode = ref<"table" | "cards">("table");
const codexModel = ref(JSON.stringify(["localCodex", "codex"]));
const codexConversation = ref<InstanceType<typeof codexAssistantPane>>();
const assistantCollapsed = ref(false);
const pendingCodexTask = ref<"scenes" | "shots" | "">("");
const autosaveStatus = ref("等待编辑");
const activeScriptEpisodeId = ref("");
const loadingScript = ref(false);
const showArchivedScenes = ref(false);
const shotSceneFilter = ref("all");
const selectedShots = ref<DramaShot[]>([]);
const selectedSceneId = ref("");
const selectedShotId = ref("");
const batchProductionStatus = ref<DramaProductionStatus>("制作中");
const batchReviewStatus = ref<DramaStatus>("待审核");
const shotDraft = ref<DramaShot | null>(null);
const shotDetailVisible = ref(false);
const gptImageStatus = ref({ authenticated: false, email: "", expiresAt: null as number | null, model: "gpt-image-2.6-flare", aspectRatios: ["1:1", "16:9", "9:16"], quality: "auto" });
const gptAuthBusy = ref(false);
const gptImageGenerating = ref(false);
const gptReferenceUploading = ref(false);
const gptReferenceCategory = ref("人物定妆图");
const gptReferenceAssetIds = ref<string[]>([]);
const gptImageRatio = ref("9:16");
const gptGeneratedAsset = ref<DramaAsset>();
const gptPreviewUrl = ref("");
const gptPreviewLabel = ref("");
let releaseGptPreview: (() => void) | undefined;
let gptPreviewRequest = 0;
const compareVisible = ref(false);
const compareLeftId = ref("");
const compareRightId = ref("");
const compareLeftText = ref("");
const compareRightText = ref("");
const compareLeftLabel = ref("");
const compareRightLabel = ref("");
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let autosavePromise: Promise<boolean> | undefined;
const unsavedDrafts = new Map<string, string>();
const form = reactive({ name: "", genre: "", style: "", targetEpisodes: 12, targetDuration: 180 });
const sections = [
  { id: "overview", label: "项目总览", section: "overview" },
  { id: "story", label: "故事策划", section: "story" },
  { id: "seasons", label: "全季规划", section: "episodes" },
  { id: "scripts", label: "分集剧本", section: "script" },
  { id: "scenes", label: "场景管理", section: "scenes" },
  { id: "storyboard", label: "分镜镜头", section: "storyboard" },
  { id: "characters", label: "人物资产", section: "characters" },
  { id: "assets", label: "场景道具资产", section: "assets" },
  { id: "canvas", label: "制作画布", section: "canvas" },
];
const currentSeason = computed(() => project.value?.seasons.find(item => item.id === seasonId.value));
const seasonEpisodes = computed(() => currentSeason.value?.episodes.map(id => project.value?.episodes.find(item => item.id === id)).filter((item): item is DramaEpisode => !!item) ?? []);
const currentEpisode = computed(() => seasonEpisodes.value.find(item => item.id === currentEpisodeId.value));
const episodeLabel = computed(() => currentEpisode.value ? `EP${String(currentEpisode.value.number).padStart(3, "0")} · ${currentEpisode.value.title}` : "未选择分集");
const currentVersionRows = computed(() => (project.value?.scriptVersions[currentEpisode.value?.id ?? ""] ?? []).slice().sort((a, b) => a.version - b.version));
const activeScenes = computed(() => currentEpisode.value?.scenes.filter(item => !item.archived).slice().sort((a, b) => (a.order ?? a.number) - (b.order ?? b.number)) ?? []);
const archivedScenes = computed(() => currentEpisode.value?.scenes.filter(item => item.archived) ?? []);
const visibleScenes = computed(() => showArchivedScenes.value ? currentEpisode.value?.scenes.slice().sort((a, b) => (a.order ?? a.number) - (b.order ?? b.number)) ?? [] : activeScenes.value);
const filteredShots = computed(() => currentEpisode.value?.shots.filter(item => shotSceneFilter.value === "all" || item.sceneId === shotSceneFilter.value).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) ?? []);
const currentVersion = computed(() => currentVersionRows.value.at(-1));
const formalVersion = computed(() => currentVersionRows.value.find(item => item.id === currentEpisode.value?.formalVersionId));
const latestVersionLabel = computed(() => currentVersion.value ? `V${String(currentVersion.value.version).padStart(3, "0")} · ${currentVersion.value.status}` : "尚无正式版本");
const formalVersionLabel = computed(() => formalVersion.value ? `V${String(formalVersion.value.version).padStart(3, "0")}` : "未确认");
const assetSectionLabel = computed(() => assetView.value === "scenesAssets" ? "场景资产" : assetView.value === "props" ? "道具资产" : "图片素材");
const imageAssets = computed(() => project.value?.assets.filter(item => item.kind === "image") ?? []);
const gptReferenceOptions = computed(() => [
  ...(project.value?.characters.filter(item => item.referencePath).map(item => ({ id: item.id, label: `人物 · ${item.name || item.id}`, referencePath: item.referencePath })) ?? []),
  ...(project.value?.assets.filter(item => item.referencePath && item.kind === "image").map(item => ({ id: item.id, label: `${item.description?.includes("场景") ? "场景" : "素材"} · ${item.name || item.id}`, referencePath: item.referencePath })) ?? []),
]);
const selectedScene = computed(() => currentEpisode.value?.scenes.find(item => item.id === selectedSceneId.value));
const selectedShot = computed(() => currentEpisode.value?.shots.find(item => item.id === selectedShotId.value));
const codexContext = computed(() => [
  `项目：${project.value?.name ?? "未选择"}（projectId=${project.value?.id ?? "未知"}）`,
  `季度：${currentSeason.value?.name ?? "未选择"}（seasonId=${currentSeason.value?.id ?? "未知"}）`,
  `剧集：${currentEpisode.value ? `EP${String(currentEpisode.value.number).padStart(3, "0")} ${currentEpisode.value.title}` : "未选择"}（episodeId=${currentEpisode.value?.id ?? "未知"}）`,
  selectedShot.value ? `当前镜头：${selectedShot.value.number}（shotId=${selectedShot.value.id}，sceneId=${selectedShot.value.sceneId}）` : selectedScene.value ? `当前场景：S${String(selectedScene.value.number).padStart(3, "0")} ${selectedScene.value.heading}（sceneId=${selectedScene.value.id}）` : "当前对象：未选中场景或镜头",
].join("\n"));
const scriptVersionRows = computed(() => Object.entries(project.value?.scriptVersions ?? {}).flatMap(([episodeId, versions]) => {
  const episode = project.value?.episodes.find(item => item.id === episodeId);
  const episodeLabel = episode ? `EP${String(episode.number).padStart(3, "0")} · ${episode.title}` : `未知分集 · ${episodeId}`;
  return versions.map(version => ({ ...version, episodeId, episodeLabel }));
}).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
const dayParts = ["清晨", "白天", "黄昏", "夜晚"] as const;
const productionStatuses: DramaProductionStatus[] = ["待制作", "制作中", "已完成"];
const reviewStatuses: DramaStatus[] = ["草稿", "待审核", "已确认", "已归档"];

function navigateSection(value: string) {
  section.value = value;
  if (value === "script" && !["editor", "review"].includes(scriptView.value)) scriptView.value = "editor";
}
function selectScene(scene: DramaScene) {
  selectedSceneId.value = scene.id;
  selectedShotId.value = "";
}
function selectShot(shot: DramaShot) {
  selectedShotId.value = shot.id;
  selectedSceneId.value = shot.sceneId;
}

watch(() => workspace.project?.directory, directory => {
  clearTimeout(autosaveTimer);
  workspaceDirectory.value = directory;
  project.value = undefined;
  manifestPath.value = "";
  activeScriptEpisodeId.value = "";
  scriptText.value = "";
  void loadProjects();
}, { immediate: true });
watch(seasonId, value => { currentEpisodeId.value = project.value?.seasons.find(item => item.id === value)?.episodes[0] ?? ""; });
watch(() => currentEpisode.value?.id, () => { selectedSceneId.value = ""; selectedShotId.value = ""; selectedShots.value = []; });
watch(() => currentEpisode.value?.id, async (episodeId, previousId) => {
  if (previousId && previousId === activeScriptEpisodeId.value) await flushDraftAutosave();
  if (episodeId && episodeId === currentEpisode.value?.id) await loadEpisodeScript(episodeId);
}, { flush: "sync" });
watch(scriptText, content => {
  if (loadingScript.value || !activeScriptEpisodeId.value || activeScriptEpisodeId.value !== currentEpisode.value?.id) return;
  scriptDirty.value = true;
  unsavedDrafts.set(activeScriptEpisodeId.value, content);
  autosaveStatus.value = "有未保存修改";
  clearTimeout(autosaveTimer);
  const episodeId = activeScriptEpisodeId.value;
  autosaveTimer = setTimeout(() => { void autosaveDraft(episodeId, content); }, 700);
}, { flush: "sync" });
onScopeDispose(() => { clearTimeout(autosaveTimer); releaseGptPreview?.(); });

async function loadProjects() {
  const directory = workspaceDirectory.value;
  if (!directory) { await router.replace("/home"); return; }
  loading.value = true;
  loadError.value = "";
  project.value = undefined;
  try {
    const entries = await listDramaProjects(useWorkspaceFiles(directory));
    if (directory !== workspaceDirectory.value) return;
    projectEntries.value = entries;
  } catch (error) {
    if (directory === workspaceDirectory.value) loadError.value = error instanceof Error ? `读取短剧项目失败：${error.message}` : "读取短剧项目失败";
  } finally {
    if (directory === workspaceDirectory.value) loading.value = false;
  }
}
function openProject(value: DramaProject) {
  const entry = projectEntries.value.find(item => item.project.id === value.id);
  if (!entry) return;
  project.value = entry.project;
  manifestPath.value = entry.path;
  seasonId.value = entry.project.seasons[0]?.id ?? "";
  currentEpisodeId.value = entry.project.seasons[0]?.episodes[0] ?? "";
  showCreateForm.value = false;
}
function returnToProjects() {
  project.value = undefined;
  manifestPath.value = "";
  scriptText.value = "";
  void loadProjects();
}

async function createProject() {
  if (!form.name.trim() || busy.value) return;
  const directory = workspaceDirectory.value;
  if (!directory) return;
  const files = useWorkspaceFiles(directory);
  busy.value = true;
  try {
    if (projects.value.some(item => item.name.trim().toLocaleLowerCase() === form.name.trim().toLocaleLowerCase())) throw new Error("当前工作区已有同名短剧项目，请修改项目名称");
    const value = await createDramaProject(files, { ...form, name: form.name.trim() });
    createSeason(value, "第一季", value.targetEpisodes);
    const path = `.toonflow/drama/projects/${value.id}/project.json`;
    await saveDramaProject(files, value, path);
    if (directory !== workspaceDirectory.value) return;
    project.value = value;
    manifestPath.value = path;
    projectEntries.value.push({ project: value, path });
    seasonId.value = value.seasons[0]!.id;
    currentEpisodeId.value = value.seasons[0]!.episodes[0]!;
    ElMessage.success("短剧项目已创建并保存");
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "创建短剧项目失败"); }
  finally { busy.value = false; }
}
async function save() {
  if (!project.value || busy.value) return false;
  const directory = workspaceDirectory.value;
  if (!directory) return false;
  const targetProject = project.value;
  const targetPath = manifestPath.value;
  const files = useWorkspaceFiles(directory);
  busy.value = true;
  try { await saveDramaProject(files, targetProject, targetPath); if (directory === workspaceDirectory.value) ElMessage.success("项目已保存"); return true; }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "保存失败"); return false; }
  finally { busy.value = false; }
}
async function loadEpisodeScript(episodeId: string) {
  const directory = workspaceDirectory.value;
  const targetProject = project.value;
  const episode = targetProject?.episodes.find(item => item.id === episodeId);
  if (!directory || !targetProject || !episode) return;
  loadingScript.value = true;
  activeScriptEpisodeId.value = episodeId;
  try {
    const path = episode.draftPath ?? episode.scriptPath;
    const content = unsavedDrafts.get(episodeId) ?? await readEpisodeScript(useWorkspaceFiles(directory), targetProject, episodeId, manifestPath.value);
    if (directory !== workspaceDirectory.value || episodeId !== currentEpisode.value?.id) return;
    scriptText.value = content;
    scriptDirty.value = unsavedDrafts.has(episodeId);
    autosaveStatus.value = scriptDirty.value ? "有未保存修改" : episode.draftPath || path ? "已从工作区读取" : "新工作稿";
  } catch (error) {
    if (directory === workspaceDirectory.value && episodeId === currentEpisode.value?.id) ElMessage.error(error instanceof Error ? `读取 ${episodeTitle(episodeId)} 失败：${error.message}` : "读取剧本失败");
  } finally {
    if (episodeId === activeScriptEpisodeId.value) loadingScript.value = false;
  }
}
async function autosaveDraft(episodeId: string, content: string) {
  const directory = workspaceDirectory.value;
  const targetProject = project.value;
  const targetPath = manifestPath.value;
  if (!directory || !targetProject || !targetPath || !targetProject.episodes.some(item => item.id === episodeId)) return false;
  autosaveStatus.value = "正在保存工作稿";
  autosavePromise = (async () => {
  try {
    await saveEpisodeDraft(useWorkspaceFiles(directory), targetProject, episodeId, content, targetPath);
    unsavedDrafts.delete(episodeId);
    if (episodeId === activeScriptEpisodeId.value && scriptText.value === content) { scriptDirty.value = false; autosaveStatus.value = "工作稿已自动保存"; }
    return true;
  } catch (error) {
    if (directory === workspaceDirectory.value) {
      if (episodeId === activeScriptEpisodeId.value) autosaveStatus.value = "自动保存失败";
      ElMessage.error(error instanceof Error ? `工作稿自动保存失败：${error.message}` : "工作稿自动保存失败");
    }
    return false;
  }
  })();
  return autosavePromise;
}
async function flushDraftAutosave(episodeId = activeScriptEpisodeId.value, content = scriptText.value) {
  clearTimeout(autosaveTimer);
  if (!episodeId || !scriptDirty.value) return true;
  if (autosaveStatus.value === "正在保存工作稿" && autosavePromise) return autosavePromise;
  return autosaveDraft(episodeId, content);
}
async function saveScriptDraft() {
  if (!currentEpisode.value || busy.value) return;
  await flushDraftAutosave();
}
async function saveScript() {
  if (!project.value || !currentEpisode.value || busy.value || !scriptText.value.trim()) return;
  const approved = await ElMessageBox.confirm("保存将创建独立 Markdown 版本，不会覆盖任何历史版本或正式版。", "保存剧本新版本", { confirmButtonText: "保存新版本", cancelButtonText: "取消" }).then(() => true, () => false);
  if (!approved) return;
  await flushDraftAutosave();
  const directory = workspaceDirectory.value;
  if (!directory) return;
  const targetProject = project.value;
  const episodeId = currentEpisode.value.id;
  const targetPath = manifestPath.value;
  const content = scriptText.value;
  const files = useWorkspaceFiles(directory);
  busy.value = true;
  try {
    const version = await saveEpisodeScriptVersion(files, targetProject, episodeId, content, targetPath);
    if (directory === workspaceDirectory.value && episodeId === currentEpisode.value?.id) {
      scriptDirty.value = false;
      unsavedDrafts.delete(episodeId);
      autosaveStatus.value = `V${String(version.version).padStart(3, "0")} 已保存`;
      ElMessage.success(`已保存版本 V${String(version.version).padStart(3, "0")}`);
    }
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "剧本保存失败"); }
  finally { busy.value = false; }
}
async function acceptCodexDraft(text: string) {
  if (!text.trim()) return;
  const approved = await ElMessageBox.confirm("将 Codex 回复复制到当前剧本编辑区；不会保存或覆盖任何已有版本。", "载入 Codex 草稿", { confirmButtonText: "载入到编辑区", cancelButtonText: "取消" }).then(() => true, () => false);
  if (approved) scriptText.value = text;
}
async function runCodexTask(task: "scenes" | "shots") {
  if (!currentEpisode.value || !scriptText.value.trim() || !codexConversation.value) return;
  pendingCodexTask.value = task;
  const prompt = task === "scenes"
    ? "按 v118workflow 的逐集剧本规范分析以下剧本，只拆分已有场次，不新增剧情。仅返回 JSON 数组，每项含 heading、time、location、characters（字符串数组）、description。\n剧本：\n" + scriptText.value
    : "将以下场景拆为可拍摄镜头，不新增剧情。仅返回 JSON 数组，每项含 sceneNumber（场景序号）、description、action、expression、size、angle、movement、dialogue、sound、duration（秒）、referencePath（留空字符串）。\n场景：\n" + JSON.stringify(currentEpisode.value.scenes.map(({ id, number, heading, description }) => ({ id, number, heading, description }))) + "\n剧本：\n" + scriptText.value;
  try { await codexConversation.value.sendPrompt(prompt); }
  catch (error) { pendingCodexTask.value = ""; ElMessage.error(error instanceof Error ? error.message : "无法向 Codex 发送任务"); }
}
async function receiveCodexReply(text: string) {
  const task = pendingCodexTask.value;
  pendingCodexTask.value = "";
  if (!task) { await acceptCodexDraft(text); return; }
  try {
    const firstArray = text.indexOf("[");
    const lastArray = text.lastIndexOf("]");
    const source = firstArray >= 0 && lastArray > firstArray ? text.slice(firstArray, lastArray + 1) : "";
    const result = JSON.parse(source);
    if (!Array.isArray(result) || !result.length || result.length > 100) throw new Error("Codex 没有返回有效的场景或镜头 JSON 列表");
    const approved = await ElMessageBox.confirm("将从 Codex 回复导入 " + result.length + " 条" + (task === "scenes" ? "场景" : "镜头") + "到当前集；不会覆盖已有记录。", "确认导入创作结果", { confirmButtonText: "导入到工作稿", cancelButtonText: "取消" }).then(() => true, () => false);
    if (!approved || !currentEpisode.value) return;
    if (task === "scenes") {
      const scenes = result.map((item, index): DramaScene => ({
        id: crypto.randomUUID(), number: Math.max(0, ...currentEpisode.value!.scenes.map(scene => scene.number)) + index + 1, order: Math.max(0, ...currentEpisode.value!.scenes.map(scene => scene.order ?? scene.number)) + index + 1,
        sourceScriptVersionId: currentVersion.value?.id, archived: false, heading: String(item.heading ?? ""), time: String(item.time ?? ""), interiorExterior: "内景", dayPart: "白天",
        location: String(item.location ?? ""), characters: Array.isArray(item.characters) ? item.characters.map(String) : [],
        charactersText: Array.isArray(item.characters) ? item.characters.map(String).join("、") : "", description: String(item.description ?? ""),
      }));
      currentEpisode.value.scenes.push(...scenes);
    } else {
      const scenes = currentEpisode.value.scenes;
      if (!scenes.length) throw new Error("请先创建场景，再导入分镜");
      const existingShots = currentEpisode.value.shots;
      const shots = result.map((item, index): DramaShot => ({
        id: crypto.randomUUID(), number: "SH" + String(Math.max(0, ...existingShots.map(shot => Number(shot.number.match(/\d+$/)?.[0] ?? 0))) + index + 1).padStart(3, "0"),
        order: Math.max(0, ...existingShots.map(shot => shot.order ?? 0)) + index + 1,
        sceneId: scenes[Math.max(0, Number(item.sceneNumber) - 1)]?.id ?? scenes[0]!.id,
        description: String(item.description ?? ""), action: String(item.action ?? ""), expression: String(item.expression ?? ""),
        size: String(item.size ?? ""), angle: String(item.angle ?? ""), composition: String(item.composition ?? ""), movement: String(item.movement ?? ""), dialogue: String(item.dialogue ?? ""),
        sound: String(item.sound ?? ""), duration: Number.isFinite(Number(item.duration)) ? Math.max(1, Number(item.duration)) : 3,
        imagePrompt: String(item.imagePrompt ?? ""), videoPrompt: String(item.videoPrompt ?? ""), referencePath: String(item.referencePath ?? ""), productionStatus: "待制作", reviewStatus: "草稿", status: "草稿",
      }));
      currentEpisode.value.shots.push(...shots);
    }
    await save();
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "解析 Codex 结果失败"); }
}
async function addSeason() {
  if (!project.value) return;
  const result = await ElMessageBox.prompt("请输入季度名称和本季集数（例如：第二季,12）", "新增季度", { inputValue: `第${project.value.seasons.length + 1}季,12` }).catch(() => null);
  if (!result) return;
  const [name, countText] = result.value.split(",").map(item => item.trim());
  const count = Number(countText);
  if (!name || !Number.isInteger(count) || count < 1 || count > 500) { ElMessage.error("请按“季度名称,集数”填写"); return; }
  createSeason(project.value, name, count); seasonId.value = project.value.seasons.at(-1)!.id; await save();
}
function addEpisode() {
  if (!project.value || !currentSeason.value) return;
  const number = currentSeason.value.episodes.length + 1;
  const episode: DramaEpisode = { id: crypto.randomUUID(), seasonId: currentSeason.value.id, number, title: `第${String(number).padStart(3, "0")}集`, outline: "", scriptVersion: 0, status: "草稿", scenes: [], shots: [] };
  project.value.episodes.push(episode); currentSeason.value.episodes.push(episode.id); currentEpisodeId.value = episode.id; section.value = "episodes"; void save();
}
function selectEpisode(episode: DramaEpisode) { currentEpisodeId.value = episode.id; section.value = "script"; }
function addScene() {
  if (!currentEpisode.value) return;
  const scenes = currentEpisode.value.scenes;
  const scene: DramaScene = { id: crypto.randomUUID(), number: Math.max(0, ...scenes.map(item => item.number)) + 1, order: Math.max(0, ...scenes.map(item => item.order ?? item.number)) + 1, sourceScriptVersionId: currentVersion.value?.id, archived: false, heading: "", time: "", location: "", interiorExterior: "内景", dayPart: "白天", characters: [], charactersText: "", description: "" };
  currentEpisode.value.scenes.push(scene); void save();
}
function addShot() {
  if (!currentEpisode.value) return;
  const shots = currentEpisode.value.shots;
  const shot: DramaShot = { id: crypto.randomUUID(), number: nextShotNumber(shots), order: Math.max(0, ...shots.map(item => item.order ?? 0)) + 1, sceneId: activeScenes.value[0]?.id ?? "", description: "", action: "", expression: "", size: "", angle: "", composition: "", movement: "", dialogue: "", sound: "", duration: 3, imagePrompt: "", videoPrompt: "", referencePath: "", productionStatus: "待制作", reviewStatus: "草稿", status: "草稿" };
  currentEpisode.value.shots.push(shot); void save();
}
function nextShotNumber(shots: DramaShot[]) {
  const maxNumber = Math.max(0, ...shots.map(item => Number(item.number.match(/\d+$/)?.[0] ?? 0)));
  return `SH${String(maxNumber + 1).padStart(3, "0")}`;
}
function syncSceneCharacters(scene: DramaScene) { scene.characters = scene.charactersText.split(/[、,，]/).map(item => item.trim()).filter(Boolean); }
function moveScene(scene: DramaScene, direction: -1 | 1) {
  if (!currentEpisode.value) return;
  const ordered = currentEpisode.value.scenes.slice().sort((a, b) => (a.order ?? a.number) - (b.order ?? b.number));
  const index = ordered.findIndex(item => item.id === scene.id);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
  [ordered[index]!.order, ordered[targetIndex]!.order] = [ordered[targetIndex]!.order ?? targetIndex + 1, ordered[index]!.order ?? index + 1];
  void save();
}
function copyScene(scene: DramaScene) {
  if (!currentEpisode.value) return;
  const scenes = currentEpisode.value.scenes;
  scenes.push({ ...scene, id: crypto.randomUUID(), number: Math.max(0, ...scenes.map(item => item.number)) + 1, order: Math.max(0, ...scenes.map(item => item.order ?? item.number)) + 1, heading: `${scene.heading}（副本）`, archived: false });
  void save();
}
function toggleSceneArchive(scene: DramaScene) { scene.archived = !scene.archived; void save(); }
function moveShot(shot: DramaShot, direction: -1 | 1) {
  if (!currentEpisode.value) return;
  const ordered = currentEpisode.value.shots.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const index = ordered.findIndex(item => item.id === shot.id);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
  const currentOrder = ordered[index]!.order ?? index + 1;
  const targetOrder = ordered[targetIndex]!.order ?? targetIndex + 1;
  ordered[index]!.order = targetOrder;
  ordered[targetIndex]!.order = currentOrder;
  void save();
}
function copyShot(shot: DramaShot) {
  if (!currentEpisode.value) return;
  const shots = currentEpisode.value.shots;
  shots.push({ ...shot, id: crypto.randomUUID(), number: nextShotNumber(shots), order: Math.max(0, ...shots.map(item => item.order ?? 0)) + 1, productionStatus: "待制作", reviewStatus: "草稿", status: "草稿" });
  void save();
}
function openShotDetail(shot: DramaShot) {
  selectShot(shot);
  shotDraft.value = { ...shot };
  gptGeneratedAsset.value = undefined;
  gptReferenceAssetIds.value = [];
  gptImageRatio.value = ["1:1", "16:9", "9:16"].includes(shot.aspectRatio ?? "") ? shot.aspectRatio! : "9:16";
  shotDetailVisible.value = true;
  void refreshGptImageStatus();
  void loadSelectedShotPreview();
}
async function refreshGptImageStatus() {
  try { gptImageStatus.value = await http<typeof gptImageStatus.value>({ method: "GET", url: "/api/gptImage/status", timeout: 10000 }); }
  catch { gptImageStatus.value = { ...gptImageStatus.value, authenticated: false, email: "", expiresAt: null }; }
}
async function authorizeGptImage() {
  const popup = window.open("about:blank", "toonflow_gpt_image_auth");
  if (!popup) { ElMessage.error("浏览器阻止了授权窗口，请允许弹出窗口后重试"); return; }
  gptAuthBusy.value = true;
  try {
    const { url } = await http<{ url: string }>({ method: "POST", url: "/api/gptImage/login", timeout: 10000 });
    popup.location.href = url;
    for (let attempt = 0; attempt < 300; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await refreshGptImageStatus();
      if (gptImageStatus.value.authenticated) { ElMessage.success("GPT 会员生图授权已连接"); return; }
    }
    ElMessage.warning("尚未检测到授权完成，请完成登录后重试状态检查");
  } catch (error) { popup.close(); ElMessage.error(error instanceof Error ? error.message : "启动 ChatGPT 授权失败"); }
  finally { gptAuthBusy.value = false; }
}
async function logoutGptImage() {
  try { await http({ method: "POST", url: "/api/gptImage/logout", timeout: 10000 }); await refreshGptImageStatus(); ElMessage.success("已退出 GPT 会员生图授权"); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "退出授权失败"); }
}
function imageMimeType(path: string) {
  const extension = path.toLowerCase().split(".").at(-1);
  return extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "";
}
async function ensureWorkspaceDirectory(files: ReturnType<typeof useWorkspaceFiles>, path: string) {
  let current = "";
  for (const part of path.split("/").filter(Boolean)) {
    const entries = await files.list(current);
    current = current ? `${current}/${part}` : part;
    if (!entries.entries.some(item => item.name === part && item.type === "directory")) await files.mkdir(current);
  }
}
async function uploadGptReferences(event: Event) {
  const input = event.target as HTMLInputElement;
  const uploads = Array.from(input.files ?? []);
  input.value = "";
  const directory = workspaceDirectory.value;
  const targetProject = project.value;
  if (!uploads.length || !directory || !targetProject || gptReferenceUploading.value) return;
  gptReferenceUploading.value = true;
  try {
    const files = useWorkspaceFiles(directory);
    const folder = `.toonflow/drama/assets/${targetProject.id}/references`;
    await ensureWorkspaceDirectory(files, folder);
    for (const upload of uploads) {
      if (!(upload.type === "image/png" || upload.type === "image/jpeg" || upload.type === "image/webp") || upload.size > 12 * 1024 * 1024) {
        ElMessage.warning(`${upload.name} 不是受支持的图片或超过 12 MB，已跳过`);
        continue;
      }
      const extension = upload.type === "image/png" ? "png" : upload.type === "image/jpeg" ? "jpg" : "webp";
      const id = crypto.randomUUID();
      const path = `${folder}/${id}.${extension}`;
      await files.write(path, await upload.arrayBuffer(), true);
      const asset: DramaAsset = { id, kind: "image", name: upload.name.slice(0, 160), description: gptReferenceCategory.value, referencePath: path, version: 1, projectId: targetProject.id };
      targetProject.assets.push(asset);
      if (!await save()) { targetProject.assets = targetProject.assets.filter(item => item.id !== id); break; }
      gptReferenceAssetIds.value = [...gptReferenceAssetIds.value, id];
    }
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "上传参考图失败"); }
  finally { gptReferenceUploading.value = false; }
}
async function setGptPreview(asset: DramaAsset, directory = workspaceDirectory.value) {
  if (!directory || !asset.referencePath) return;
  const request = ++gptPreviewRequest;
  const acquired = useWorkspaceFiles(directory).acquireUrl(asset.referencePath, imageMimeType(asset.referencePath) || undefined);
  try {
    const url = await acquired.url;
    if (request !== gptPreviewRequest) { acquired.release(); return; }
    releaseGptPreview?.();
    releaseGptPreview = acquired.release;
    gptPreviewUrl.value = url;
    gptPreviewLabel.value = `${asset.name}${asset.width && asset.height ? ` · ${asset.width} × ${asset.height}` : ""}`;
  } catch (error) { acquired.release(); ElMessage.error(error instanceof Error ? error.message : "读取镜头图片失败"); }
}
async function loadSelectedShotPreview() {
  const asset = imageAssets.value.find(item => item.id === shotDraft.value?.firstFrameAssetId);
  if (!asset) { releaseGptPreview?.(); releaseGptPreview = undefined; gptPreviewUrl.value = ""; gptGeneratedAsset.value = undefined; return; }
  gptGeneratedAsset.value = undefined;
  await setGptPreview(asset);
}
async function imageDimensions(url: string) {
  return new Promise<{ width: number; height: number } | undefined>(resolve => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(undefined);
    image.src = url;
  });
}
async function generateShotImage() {
  const directory = workspaceDirectory.value;
  const targetProject = project.value;
  const episode = currentEpisode.value;
  const draft = shotDraft.value;
  if (!directory || !targetProject || !episode || !draft || !draft.imagePrompt?.trim()) return;
  if (!gptImageStatus.value.authenticated) { ElMessage.warning("请先完成独立 ChatGPT 授权"); return; }
  const selectedReferences = gptReferenceOptions.value.filter(item => gptReferenceAssetIds.value.includes(item.id));
  if (selectedReferences.some(item => !imageMimeType(item.referencePath))) { ElMessage.error("参考素材需要使用 PNG、JPEG 或 WebP 文件"); return; }
  gptImageGenerating.value = true;
  try {
    const generated = await http<{ path: string; mimeType: string; mediaType: "image" }[]>({
      method: "POST", url: "/api/ai/media/generate", timeout: 240000,
      data: { directory, mediaType: "image", providerId: "gptImageSubscription", modelId: "gpt-image-2.6-flare", prompt: draft.imagePrompt,
        ratio: gptImageRatio.value, images: selectedReferences.map(item => ({ path: item.referencePath, mimeType: imageMimeType(item.referencePath) })),
        outputDirectory: `.toonflow/drama/assets/${targetProject.id}/generated` },
    });
    const result = generated[0];
    if (!result || result.mediaType !== "image") throw new Error("生图服务没有返回图片文件");
    if (project.value?.id !== targetProject.id || currentEpisode.value?.id !== episode.id || shotDraft.value?.id !== draft.id || workspaceDirectory.value !== directory) {
      ElMessage.warning(`图片已保存到原工作区 ${result.path}，但当前上下文已切换，因此未关联到新项目`);
      return;
    }
    const previewHandle = useWorkspaceFiles(directory).acquireUrl(result.path, result.mimeType);
    const previewUrl = await previewHandle.url;
    const dimensions = await imageDimensions(previewUrl);
    previewHandle.release();
    const scene = episode.scenes.find(item => item.id === draft.sceneId);
    const asset: DramaAsset = { id: crypto.randomUUID(), kind: "image", name: `${draft.number} GPT 生图 ${new Date().toLocaleString()}`,
      description: draft.imagePrompt, referencePath: result.path, version: 1, generatedBy: "gptImageSubscription", modelId: "gpt-image-2.6-flare",
      generatedAt: new Date().toISOString(), requestedAspectRatio: gptImageRatio.value, ...(dimensions ?? {}), referenceAssetIds: [...gptReferenceAssetIds.value],
      projectId: targetProject.id, episodeId: episode.id, sceneId: scene?.id, shotId: draft.id };
    targetProject.assets.push(asset);
    if (!await save()) { targetProject.assets = targetProject.assets.filter(item => item.id !== asset.id); return; }
    draft.aspectRatio = gptImageRatio.value;
    gptGeneratedAsset.value = asset;
    await setGptPreview(asset, directory);
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "GPT 会员生图失败"); }
  finally { gptImageGenerating.value = false; }
}
async function confirmGeneratedImage() {
  if (!gptGeneratedAsset.value || !shotDraft.value) return;
  shotDraft.value.firstFrameAssetId = gptGeneratedAsset.value.id;
  shotDraft.value.referenceAssetIds = [...new Set([...(shotDraft.value.referenceAssetIds ?? []), ...gptReferenceAssetIds.value])];
  await saveShotDetail();
}
async function saveShotDetail() {
  const target = currentEpisode.value?.shots.find(item => item.id === shotDraft.value?.id);
  if (!target || !shotDraft.value) return;
  const original = { ...target };
  Object.assign(target, shotDraft.value, { status: shotDraft.value.reviewStatus ?? "草稿" });
  if (await save()) shotDetailVisible.value = false;
  else Object.assign(target, original);
}
function applyBatchProductionStatus() {
  const ids = new Set(selectedShots.value.map(item => item.id));
  currentEpisode.value?.shots.forEach(item => { if (ids.has(item.id)) item.productionStatus = batchProductionStatus.value; });
  void save();
}
function applyBatchReviewStatus() {
  const ids = new Set(selectedShots.value.map(item => item.id));
  currentEpisode.value?.shots.forEach(item => { if (ids.has(item.id)) { item.reviewStatus = batchReviewStatus.value; item.status = batchReviewStatus.value; } });
  void save();
}
function sceneTitle(sceneId: string) { return currentEpisode.value?.scenes.find(item => item.id === sceneId)?.heading || "未关联场景"; }
function addCharacter() {
  if (!project.value) return;
  const character: DramaCharacter = { id: crypto.randomUUID(), name: "", description: "", appearance: "", referencePath: "", version: 1 };
  project.value.characters.push(character); void save();
}
function addAsset(kind: DramaAsset["kind"]) {
  if (!project.value) return;
  const asset: DramaAsset = { id: crypto.randomUUID(), kind, name: "", description: "", referencePath: "", version: 1 };
  project.value.assets.push(asset); void save();
}
function episodeTitle(episodeId: string) {
  const episode = project.value?.episodes.find(item => item.id === episodeId);
  return episode ? `EP${String(episode.number).padStart(3, "0")} · ${episode.title}` : "未知分集";
}
function versionLabel(version: DramaScriptVersion) { return `V${String(version.version).padStart(3, "0")} · ${version.status}`; }
function isFormalVersion(episodeId: string, versionId: string) { return project.value?.episodes.find(item => item.id === episodeId)?.formalVersionId === versionId; }
async function setVersionReview(row: DramaScriptVersion & { episodeId: string }, status: DramaStatus) {
  const directory = workspaceDirectory.value;
  if (!directory || !project.value) return;
  try {
    await updateScriptReview(useWorkspaceFiles(directory), project.value, row.episodeId, row.id, status, manifestPath.value);
    if (directory === workspaceDirectory.value) ElMessage.success(`V${String(row.version).padStart(3, "0")} 已更新为${status}`);
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "更新审核状态失败"); }
}
async function confirmFormalVersion(row: DramaScriptVersion & { episodeId: string }) {
  const approved = await ElMessageBox.confirm(`确认将 ${episodeTitle(row.episodeId)} V${String(row.version).padStart(3, "0")} 设为正式版本？后续工作稿保存不会覆盖该版本。`, "确认正式版本", { confirmButtonText: "确认正式", cancelButtonText: "取消" }).then(() => true, () => false);
  if (approved) await setVersionReview(row, "已确认");
}
async function loadVersion(row: DramaScriptVersion & { episodeId: string }) {
  const directory = workspaceDirectory.value;
  if (!directory || row.episodeId !== currentEpisode.value?.id) {
    const episode = project.value?.episodes.find(item => item.id === row.episodeId);
    if (episode) { seasonId.value = project.value?.seasons.find(item => item.id === episode.seasonId)?.id ?? ""; currentEpisodeId.value = episode.id; }
  }
  if (!directory) return;
  try {
    const content = await useWorkspaceFiles(directory).readText(row.path);
    if (directory === workspaceDirectory.value && row.episodeId === currentEpisode.value?.id) { loadingScript.value = true; activeScriptEpisodeId.value = row.episodeId; scriptText.value = content; loadingScript.value = false; autosaveStatus.value = `${versionLabel(row)} 已载入工作区编辑器`; section.value = "script"; }
  }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "读取剧本版本失败"); }
}
async function restoreVersion(row: DramaScriptVersion & { episodeId: string }) {
  const approved = await ElMessageBox.confirm(`将读取 V${String(row.version).padStart(3, "0")} 内容并保存为新的工作版本；不会覆盖该历史版本。`, "恢复为新版本", { confirmButtonText: "创建新版本", cancelButtonText: "取消" }).then(() => true, () => false);
  if (!approved || !project.value) return;
  await flushDraftAutosave();
  const directory = workspaceDirectory.value;
  const targetProject = project.value;
  const targetPath = manifestPath.value;
  if (!directory) return;
  try {
    const content = await useWorkspaceFiles(directory).readText(row.path);
    const version = await saveEpisodeScriptVersion(useWorkspaceFiles(directory), targetProject, row.episodeId, content, targetPath);
    const episode = project.value?.episodes.find(item => item.id === row.episodeId);
    if (episode) { seasonId.value = project.value?.seasons.find(item => item.id === episode.seasonId)?.id ?? ""; currentEpisodeId.value = episode.id; }
    if (directory === workspaceDirectory.value && row.episodeId === currentEpisode.value?.id) {
      loadingScript.value = true; activeScriptEpisodeId.value = row.episodeId; scriptText.value = content; loadingScript.value = false;
      autosaveStatus.value = `V${String(version.version).padStart(3, "0")} 已恢复为新版本`; section.value = "script";
    }
    ElMessage.success(`已从 V${String(row.version).padStart(3, "0")} 创建 V${String(version.version).padStart(3, "0")}`);
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "恢复版本失败"); }
}
async function compareVersions() {
  const left = currentVersionRows.value.find(item => item.id === compareLeftId.value);
  const right = currentVersionRows.value.find(item => item.id === compareRightId.value);
  const directory = workspaceDirectory.value;
  if (!left || !right || !directory) return;
  try {
    const files = useWorkspaceFiles(directory);
    const [leftText, rightText] = await Promise.all([files.readText(left.path), files.readText(right.path)]);
    if (directory !== workspaceDirectory.value) return;
    compareLeftText.value = leftText; compareRightText.value = rightText;
    compareLeftLabel.value = versionLabel(left); compareRightLabel.value = versionLabel(right); compareVisible.value = true;
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "读取对比版本失败"); }
}
function formatDate(value: string) { return new Date(value).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" }); }
</script>

<style lang="scss" scoped>
.dramaCenter { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--el-text-color-primary); background: var(--el-bg-color-page); }
.dramaHeader { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 28px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-bg-color); h1 { margin: 0; font-size: 20px; font-weight: 600; } p { margin: 5px 0 0; color: var(--el-text-color-secondary); font-size: 13px; } }
.headerActions { display: flex; gap: 8px; }
.projectSetup { width: min(720px, calc(100% - 40px)); margin: 56px auto; padding: 28px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-bg-color); h2 { margin: 0 0 24px; font-size: 18px; } }
.projectList { width: min(1280px, calc(100% - 48px)); margin: 32px auto; padding: 24px; border: 1px solid var(--el-border-color-lighter); border-radius: 7px; background: var(--el-bg-color); }
.loadingState { width: min(900px, calc(100% - 48px)); margin: 48px auto; display: grid; gap: 18px; }
.formRow { display: flex; gap: 16px; > * { flex: 1; } }
.workspaceTopbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 46px; padding: 6px 16px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-bg-color); > div:first-child { display: flex; align-items: baseline; gap: 12px; min-width: 0; strong { color: var(--el-text-color-primary); font-size: 14px; } span { overflow: hidden; color: var(--el-text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; } } }
.topbarMeta { display: flex; align-items: center; gap: 12px; color: var(--el-text-color-secondary); font-size: 12px; }
.dramaLayout { display: grid; grid-template-columns: 205px minmax(0, 1fr) 315px; flex: 1; min-height: 0; transition: grid-template-columns .18s ease; }
.dramaLayout.assistantCollapsed { grid-template-columns: 205px minmax(0, 1fr) 44px; }
.dramaContent { min-width: 0; overflow: auto; padding: 18px; }
.contentPanel { min-width: 0; padding: 18px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: var(--el-bg-color); h2 { margin: 0; font-size: 17px; } > p { color: var(--el-text-color-secondary); } }
.panelHeading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; p { margin: 5px 0 0; color: var(--el-text-color-secondary); font-size: 13px; } > div:last-child { display: flex; gap: 8px; } }
.overviewGrid { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 10px; margin: 20px 0; > div { display: grid; gap: 6px; padding: 14px; border: 1px solid var(--el-border-color-lighter); border-radius: 5px; span { color: var(--el-text-color-secondary); font-size: 12px; } strong { font-size: 18px; font-weight: 600; } } }
.shotCards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; article { display: grid; gap: 10px; padding: 15px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; cursor: pointer; strong { color: var(--el-color-primary); } small { color: var(--el-text-color-secondary); } } }
.saveInline { margin-top: 14px; }
.scriptLayout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: stretch; }
.scriptEditor { min-width: 0; > p { margin: 8px 0; color: var(--el-text-color-secondary); font-size: 12px; } }
.scriptVersionSummary { display: flex; flex-wrap: wrap; gap: 16px; color: var(--el-text-color-secondary); font-size: 12px; }
.batchBar, .versionCompareControls { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.compareColumns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; max-height: 70vh; overflow: auto; section { min-width: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 5px; padding: 12px; } h3 { margin: 0 0 10px; font-size: 14px; } pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.6; } }
.shotDetailForm { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; .el-form-item:has(textarea) { grid-column: 1 / -1; } }
.gptImagePanel { display: grid; gap: 10px; width: 100%; padding: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.gptImageAuth, .gptImageActions, .gptImageUpload { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.gptImageAuth { justify-content: space-between; font-size: 13px; }
.gptImageNote { margin: 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.55; }
.gptImageActions > span, .gptImageUpload > span { color: var(--el-text-color-secondary); font-size: 12px; }
.gptImagePreview { display: grid; justify-items: start; gap: 8px; img { display: block; max-width: 100%; max-height: 320px; object-fit: contain; border-radius: 4px; } > div { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--el-text-color-secondary); } }
.canvasEntry { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 100px; p { max-width: 680px; margin: 8px 0 0; color: var(--el-text-color-secondary); font-size: 13px; } }
.capabilityNote { margin-block: 12px 18px; }
.assetTabs { margin-block: 8px 12px; }
@media (max-width: 1200px) { .dramaLayout { grid-template-columns: 180px minmax(0, 1fr) 280px; } .dramaLayout.assistantCollapsed { grid-template-columns: 180px minmax(0, 1fr) 44px; } .dramaContent { padding: 12px; } }
@media (max-width: 900px) { .dramaLayout { grid-template-columns: 160px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 340px; } .dramaLayout.assistantCollapsed { grid-template-rows: minmax(0, 1fr) 48px; } .assistantPane { grid-column: 1 / -1; grid-row: 2; border-inline-start: 0; border-top: 1px solid var(--el-border-color-lighter); } .assistantPane.collapsed { width: auto; } .collapsed .assistantHeader { flex-direction: row; padding: 4px 10px; } .topbarMeta { display: none; } }
@media (max-width: 700px) { .dramaHeader { align-items: flex-start; flex-direction: column; padding: 12px 16px; } .headerActions { flex-wrap: wrap; } .workspaceTopbar > div:first-child { flex-direction: column; gap: 2px; } .dramaLayout { grid-template-columns: 135px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 320px; } .dramaLayout.assistantCollapsed { grid-template-rows: minmax(0, 1fr) 46px; } .dramaContent { padding: 8px; } .contentPanel { padding: 12px; } .overviewGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .compareColumns, .shotDetailForm { grid-template-columns: minmax(0, 1fr); } .panelHeading { align-items: flex-start; flex-direction: column; } }
</style>
