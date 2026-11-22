<template>
  <main class="dramaCenter">
    <header class="dramaHeader">
      <div><h1>短剧创作中心</h1><p>{{ workspace.project?.name }} · 项目工作区</p></div>
      <div class="headerActions"><el-button @click="emit('returnWorkspace')">返回工作区</el-button><el-button v-if="project" @click="returnToProjects">项目列表</el-button><el-button v-if="project" type="primary" @click="save">保存更改</el-button><el-button v-if="!project && !showCreateForm && !loading" type="primary" @click="showCreateForm = true">新建短剧</el-button></div>
    </header>
    <section v-if="loading" class="loadingState"><el-skeleton :rows="5" animated /></section>
    <section v-else-if="loadError" class="loadingState"><el-alert type="error" :title="loadError" showIcon /><el-button @click="loadProjects">重试读取</el-button></section>
    <section v-else-if="!project && !showCreateForm" class="projectList">
      <div class="panelHeading"><div><h2>短剧项目</h2><p>{{ workspace.project?.name }} 工作区</p></div><el-button type="primary" @click="showCreateForm = true">新建短剧</el-button></div>
      <el-empty v-if="!projects.length" description="当前工作区还没有短剧项目" />
      <div v-else class="projectCards">
        <button v-for="entry in projectEntries" :key="entry.project.id" type="button" class="projectCard" @click="openProject(entry.project)">
          <span class="projectCardHeading"><strong>{{ entry.project.name }}</strong><small>最近编辑 {{ formatDate(entry.project.updatedAt) }}</small></span>
          <span class="projectCardMeta">{{ entry.project.seasons.length }} 季 · {{ entry.project.episodes.length }} 集</span>
          <span class="projectCardAction">打开项目</span>
        </button>
      </div>
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
        <dramaStudioNav :items="sections" :seasons="project.seasons" :episodes="seasonEpisodes" :section="section" :scriptView="scriptView" :assetView="assetView" :seasonId="seasonId" :currentEpisodeId="currentEpisodeId" @navigate="navigateSection" @scriptView="scriptView = $event" @assetView="assetView = $event" @season="seasonId = $event" @enterEpisode="enterCanvasById" @addSeason="addSeason" />
        <section class="dramaContent">
          <div v-if="section === 'overview'" class="contentPanel">
            <div class="panelHeading"><div><h2>项目总览</h2><p>项目资料、创作进度与快速入口</p></div><el-button type="primary" @click="navigateSection('story')">故事策划</el-button></div>
            <div class="overviewGrid"><div><span>季度</span><strong>{{ project.seasons.length }}</strong><el-button link @click="navigateSection('episodes')">进入全季规划</el-button></div><div><span>分集</span><strong>{{ project.episodes.length }} / {{ project.targetEpisodes }}</strong><el-button link @click="navigateSection('episodes')">查看分集</el-button></div><div><span>有版本的剧集</span><strong>{{ project.episodes.filter(item => item.scriptVersion > 0).length }}</strong><el-button link @click="navigateSection('script')">进入分集剧本</el-button></div><div><span>场景 / 镜头</span><strong>{{ project.episodes.reduce((sum, item) => sum + item.scenes.length, 0) }} / {{ project.episodes.reduce((sum, item) => sum + item.shots.length, 0) }}</strong><el-button link @click="navigateSection('scenes')">场景管理</el-button></div><div><span>最近修改</span><strong>{{ formatDate(project.updatedAt) }}</strong><el-button link @click="navigateSection('storyboard')">分镜镜头</el-button></div></div>
            <div class="overviewQuickLinks"><el-button @click="navigateSection('characters')">人物资产</el-button><el-button @click="navigateSection('assets')">场景道具资产</el-button></div>
          </div>
          <div v-else-if="section === 'story'" class="contentPanel">
            <h2>故事策划</h2><div class="overviewGrid"><div><span>题材</span><strong>{{ project.genre || '未填写' }}</strong></div><div><span>风格</span><strong>{{ project.style || '未填写' }}</strong></div><div><span>目标集数</span><strong>{{ project.targetEpisodes }}</strong></div><div><span>单集时长</span><strong>{{ project.targetDuration }} 秒</strong></div></div>
            <el-alert class="capabilityNote" type="info" :closable="false" title="当前可编辑项目基础资料和全季故事总纲。世界观结构、人物关系图和全季自动规划尚未实现，页面不会生成虚构内容。" />
            <div class="overviewQuickLinks"><el-button disabled>世界观资料（暂未实现）</el-button><el-button disabled>人物关系（暂未实现）</el-button></div>
            <el-form labelPosition="top"><div class="formRow"><el-form-item label="项目名称"><el-input v-model="project.name" /></el-form-item><el-form-item label="题材"><el-input v-model="project.genre" /></el-form-item><el-form-item label="画面风格"><el-input v-model="project.style" /></el-form-item></div><div class="formRow"><el-form-item label="目标集数"><el-input-number v-model="project.targetEpisodes" :min="1" :max="500" /></el-form-item><el-form-item label="单集目标时长（秒）"><el-input-number v-model="project.targetDuration" :min="30" :max="7200" /></el-form-item></div><el-form-item label="全季故事总纲"><el-input v-model="project.storyOutline" type="textarea" :rows="5" placeholder="记录世界观、整季主线和上下集衔接原则" /></el-form-item></el-form>
          </div>
          <div v-else-if="section === 'episodes'" class="contentPanel">
            <div class="panelHeading"><div><h2>{{ currentSeason?.name ?? '选择季度' }}</h2><p>选择一集，直接进入原生创作画布</p></div><el-button type="primary" :disabled="!currentSeason" @click="addEpisode">新增一集</el-button></div>
            <div v-if="seasonEpisodes.length" class="episodeGrid">
              <button v-for="episode in seasonEpisodes" :key="episode.id" type="button" class="episodeCard" @click="enterCanvas(episode)">
                <span class="episodeNumber">EP{{ String(episode.number).padStart(3, '0') }}</span>
                <span class="episodeInfo"><strong>{{ episode.title }}</strong><small>{{ episode.scriptVersion ? `剧本 V${String(episode.scriptVersion).padStart(3, '0')}` : '尚无剧本版本' }}</small></span>
                <el-tag class="episodeStatus" size="small">{{ episode.status }}</el-tag>
                <span class="episodeAction">进入画布</span>
              </button>
            </div>
            <el-empty v-else description="当前季度还没有分集" />
          </div>
          <div v-else-if="section === 'seasonPlan'" class="contentPanel">
            <div class="panelHeading"><div><h2>全季规划</h2><p>{{ currentSeason?.name ?? '请先创建季度' }} · 可编辑集名和分集大纲</p></div><el-button type="primary" :disabled="!currentSeason" @click="addEpisode">新增一集</el-button></div>
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
              <el-table-column label="场景" minWidth="210"><template #default="scope"><strong>{{ scope.row.heading || "未命名场景" }}</strong><small class="tableSubtext">{{ scope.row.location || "地点待填写" }}</small></template></el-table-column>
              <el-table-column label="环境描述" minWidth="300"><template #default="scope"><span class="tableDescription">{{ scope.row.description || "尚无环境描述" }}</span></template></el-table-column>
              <el-table-column label="参考图" minWidth="160"><template #default="scope">{{ sceneImageLabel(scope.row as DramaScene) }}</template></el-table-column>
              <el-table-column label="操作" width="300" fixed="right"><template #default="scope"><el-button link type="primary" @click.stop="openSceneDetail(scope.row as DramaScene)">详情 / 生图</el-button><el-button link :disabled="scope.$index === 0" @click="moveScene(scope.row as DramaScene, -1)">上移</el-button><el-button link :disabled="scope.$index === visibleScenes.length - 1" @click="moveScene(scope.row as DramaScene, 1)">下移</el-button><el-button link @click="copyScene(scope.row as DramaScene)">复制</el-button><el-button link type="warning" @click="toggleSceneArchive(scope.row as DramaScene)">{{ scope.row.archived ? "恢复" : "归档" }}</el-button></template></el-table-column>
            </el-table>
            <el-empty v-else description="请先选择分集" />
          </div>
          <div v-else-if="section === 'storyboard'" class="contentPanel">
            <div class="timelineToolbar">
              <div class="timelineIdentity"><span>STORYBOARD · TIMELINE</span><h2>{{ project.name }}</h2><p>{{ currentSeason?.name || "未选择季度" }} · {{ episodeLabel }} · {{ shotSceneFilter === "all" ? "所有场景" : sceneTitle(shotSceneFilter) }}</p></div>
              <div class="timelineToolbarControls">
                <el-select v-model="shotSceneFilter" aria-label="当前场景" class="timelineSceneSelect"><el-option label="所有场景" value="all" /><el-option v-for="scene in activeScenes" :key="scene.id" :label="scene.heading || `场景 ${scene.number}`" :value="scene.id" /></el-select>
                <label class="timelineZoom">缩放<input v-model.number="timelineZoom" type="range" min="70" max="140" step="10" aria-label="画布缩放" /><span>{{ timelineZoom }}%</span></label>
                <span class="timelineSaveState" :class="{ saving: busy, failed: timelineSaveState === '保存失败' }">{{ busy ? "保存中…" : timelineSaveState }}</span>
                <el-button-group><el-button :type="viewMode === 'timeline' ? 'primary' : 'default'" @click="viewMode = 'timeline'">时间线视图</el-button><el-button :type="viewMode === 'table' ? 'primary' : 'default'" @click="viewMode = 'table'">表格视图</el-button></el-button-group>
                <el-button disabled>自由节点视图（后续）</el-button>
                <el-button type="primary" :disabled="!currentEpisode || busy" @click="addShot()">新增镜头</el-button>
                <el-button :disabled="!currentEpisode || busy" @click="save">保存分镜</el-button>
              </div>
            </div>
            <div v-if="viewMode === 'table'" class="batchBar"><el-select v-model="batchProductionStatus" aria-label="批量制作状态"><el-option v-for="item in productionStatuses" :key="item" :label="item" :value="item" /></el-select><el-button :disabled="!selectedShots.length" @click="applyBatchProductionStatus">更新所选制作状态</el-button><el-select v-model="batchReviewStatus" aria-label="批量审核状态"><el-option v-for="item in reviewStatuses" :key="item" :label="item" :value="item" /></el-select><el-button :disabled="!selectedShots.length" @click="applyBatchReviewStatus">更新所选审核状态</el-button></div>
            <dramaTimeline v-if="currentEpisode && viewMode === 'timeline'" :scenes="activeScenes" :shots="currentEpisode.shots.filter(item => !item.archived)" :assets="imageAssets" :directory="workspaceDirectory || ''" :sceneFilter="shotSceneFilter" :selectedShotId="selectedShotId" :zoom="timelineZoom" @openShot="openShotDetail" @generateShot="openShotDetail" @copyShot="copyShot" @deleteShot="deleteTimelineShot" @addShot="addShot" @moveShot="moveTimelineShot" />
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
            <el-empty v-if="!currentEpisode" description="请先选择分集" />
          </div>
          <div v-else-if="section === 'characters'" class="contentPanel">
            <div class="panelHeading"><div><h2>人物资产</h2><p>项目内跨集复用；图片以工作区相对路径关联</p></div><el-button type="primary" @click="addCharacter">新增人物</el-button></div>
            <el-table :data="project.characters" rowKey="id"><el-table-column prop="name" label="人物" minWidth="150"><template #default="scope">{{ scope.row.name || "未命名人物" }}</template></el-table-column><el-table-column prop="description" label="身份及性格" minWidth="240"><template #default="scope"><span class="tableDescription">{{ scope.row.description || "尚未填写" }}</span></template></el-table-column><el-table-column prop="appearance" label="外貌描述" minWidth="260"><template #default="scope"><span class="tableDescription">{{ scope.row.appearance || "尚未填写" }}</span></template></el-table-column><el-table-column label="参考图" minWidth="190"><template #default="scope">{{ scope.row.referencePath ? "已关联人物图片" : "未设置" }}</template></el-table-column><el-table-column prop="version" label="版本" width="80" /><el-table-column label="操作" width="130" fixed="right"><template #default="scope"><el-button link type="primary" @click="openCharacterDetail(scope.row as DramaCharacter)">详情 / 生图</el-button></template></el-table-column></el-table>
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
        </section>
        <codexAssistantPane ref="codexConversation" v-model:selectedModel="codexModel" v-model:collapsed="assistantCollapsed" :directory="workspace.project?.directory" :context="codexContext" @assistantCompleted="receiveCodexReply" />
      </div>
    </template>
    <el-dialog v-model="compareVisible" title="剧本版本对比" width="min(1200px, 92vw)" destroyOnClose>
      <div class="compareColumns"><section><h3>{{ compareLeftLabel }}</h3><pre>{{ compareLeftText }}</pre></section><section><h3>{{ compareRightLabel }}</h3><pre>{{ compareRightText }}</pre></section></div>
    </el-dialog>
    <el-dialog v-model="characterDetailVisible" :title="characterDraft?.name || '人物详情'" width="min(900px, 92vw)" destroyOnClose>
      <el-form v-if="characterDraft" labelPosition="top" class="entityDetailForm">
        <el-form-item label="人物名称"><el-input v-model="characterDraft.name" /></el-form-item>
        <el-form-item label="人物身份及性格" class="wideFormItem"><el-input v-model="characterDraft.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="人物外貌描述" class="wideFormItem"><el-input v-model="characterDraft.appearance" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="人物参考图与 GPT 会员生图" class="wideFormItem"><gptImageGenerator v-model:prompt="characterImagePrompt" v-model:aspectRatio="characterImageRatio" :projectId="project.id" :directory="workspaceDirectory || ''" :referenceOptions="gptReferenceOptions" :initialImagePath="characterDraft.referencePath" initialImageLabel="当前人物参考图" :generatedPersisted="generatedImagePersisted" :saving="imageAssetSaving" @generated="persistCharacterImage" @referencesUploaded="saveCharacterReferences" @useImage="useCharacterImage" /></el-form-item>
        <el-collapse><el-collapse-item title="高级信息" name="advanced"><el-form-item label="版本"><el-input-number v-model="characterDraft.version" :min="1" /></el-form-item><el-form-item label="人物 ID"><el-input :modelValue="characterDraft.id" disabled /></el-form-item></el-collapse-item></el-collapse>
      </el-form>
      <template #footer><el-button @click="characterDetailVisible = false">取消</el-button><el-button type="primary" :loading="busy" @click="saveCharacterDetail">保存人物</el-button></template>
    </el-dialog>
    <el-dialog v-model="sceneDetailVisible" :title="sceneDraft?.heading || '场景详情'" width="min(900px, 92vw)" destroyOnClose>
      <el-form v-if="sceneDraft" labelPosition="top" class="entityDetailForm">
        <el-form-item label="场景名称"><el-input v-model="sceneDraft.heading" /></el-form-item>
        <el-form-item label="场景地点"><el-input v-model="sceneDraft.location" /></el-form-item>
        <el-form-item label="场景环境描述" class="wideFormItem"><el-input v-model="sceneDraft.description" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="场景参考图与 GPT 会员生图" class="wideFormItem"><gptImageGenerator v-model:prompt="sceneImagePrompt" v-model:aspectRatio="sceneImageRatio" :projectId="project.id" :directory="workspaceDirectory || ''" :referenceOptions="gptReferenceOptions" :initialImagePath="sceneImageAsset?.referencePath" :initialImageLabel="sceneImageAsset?.name || '当前场景参考图'" :generatedPersisted="generatedImagePersisted" :saving="imageAssetSaving" @generated="persistSceneImage" @referencesUploaded="saveSceneReferences" @useImage="useSceneImage" /></el-form-item>
        <el-collapse><el-collapse-item title="高级信息" name="advanced"><div class="formRow"><el-form-item label="时间"><el-input v-model="sceneDraft.time" /></el-form-item><el-form-item label="内景 / 外景"><el-select v-model="sceneDraft.interiorExterior"><el-option label="内景" value="内景" /><el-option label="外景" value="外景" /></el-select></el-form-item><el-form-item label="时段"><el-select v-model="sceneDraft.dayPart"><el-option v-for="item in dayParts" :key="item" :label="item" :value="item" /></el-select></el-form-item></div><el-form-item label="出场人物"><el-input v-model="sceneDraft.charactersText" @change="syncSceneCharacters(sceneDraft)" /></el-form-item><el-form-item label="场景 ID"><el-input :modelValue="sceneDraft.id" disabled /></el-form-item></el-collapse-item></el-collapse>
      </el-form>
      <template #footer><el-button @click="sceneDetailVisible = false">取消</el-button><el-button type="primary" :loading="busy" @click="saveSceneDetail">保存场景</el-button></template>
    </el-dialog>
    <el-dialog v-model="shotDetailVisible" title="镜头详情" width="min(900px, 92vw)" destroyOnClose>
      <el-form v-if="shotDraft" labelPosition="top" class="shotDetailForm">
        <el-form-item label="镜头编号"><el-input v-model="shotDraft.number" disabled /></el-form-item>
        <el-form-item label="所属场景"><el-select v-model="shotDraft.sceneId"><el-option v-for="scene in currentEpisode?.scenes.filter(item => !item.archived)" :key="scene.id" :label="scene.heading || `场景 ${scene.number}`" :value="scene.id" /></el-select></el-form-item>
        <el-form-item label="景别"><el-input v-model="shotDraft.size" /></el-form-item><el-form-item label="机位"><el-input v-model="shotDraft.angle" /></el-form-item>
        <el-form-item label="画面描述"><el-input v-model="shotDraft.description" type="textarea" :rows="3" /></el-form-item><el-form-item label="人物动作和表情"><el-input v-model="shotDraft.action" type="textarea" :rows="2" /><el-input v-model="shotDraft.expression" /></el-form-item>
        <el-form-item label="台词"><el-input v-model="shotDraft.dialogue" type="textarea" :rows="2" /></el-form-item><el-form-item label="时长（秒）"><el-input-number v-model="shotDraft.duration" :min="1" :max="600" /></el-form-item>
        <el-form-item label="图片提示词与 GPT 会员生图" class="wideFormItem"><gptImageGenerator v-model:prompt="shotImagePrompt" v-model:aspectRatio="shotImageRatio" :projectId="project.id" :directory="workspaceDirectory || ''" :referenceOptions="gptReferenceOptions" :initialImagePath="shotInitialImagePath" :initialImageLabel="shotInitialImageLabel" :generatedPersisted="generatedImagePersisted" :saving="imageAssetSaving" @generated="persistShotImage" @referencesUploaded="saveShotReferences" @useImage="useShotImage" /></el-form-item>
        <el-form-item label="视频提示词" class="wideFormItem"><el-input v-model="shotDraft.videoPrompt" type="textarea" :rows="3" /></el-form-item>
        <el-collapse class="wideFormItem"><el-collapse-item title="高级设置" name="advanced"><el-form-item label="构图"><el-input v-model="shotDraft.composition" /></el-form-item><el-form-item label="运镜"><el-input v-model="shotDraft.movement" /></el-form-item><el-form-item label="音效 / 声音设计"><el-input v-model="shotDraft.sound" type="textarea" :rows="2" /></el-form-item><el-form-item label="首帧素材"><el-select v-model="shotDraft.firstFrameAssetId" clearable><el-option v-for="asset in imageAssets" :key="asset.id" :label="asset.name || asset.id" :value="asset.id" /></el-select></el-form-item><el-form-item label="尾帧素材"><el-select v-model="shotDraft.lastFrameAssetId" clearable><el-option v-for="asset in imageAssets" :key="asset.id" :label="asset.name || asset.id" :value="asset.id" /></el-select></el-form-item><el-form-item label="参考素材"><el-select v-model="shotDraft.referenceAssetIds" multiple clearable><el-option v-for="asset in project?.assets ?? []" :key="asset.id" :label="asset.name || asset.id" :value="asset.id" /></el-select></el-form-item><el-form-item label="旧版参考图路径"><el-input v-model="shotDraft.referencePath" /></el-form-item><div class="formRow"><el-form-item label="制作状态"><el-select v-model="shotDraft.productionStatus"><el-option v-for="item in productionStatuses" :key="item" :label="item" :value="item" /></el-select></el-form-item><el-form-item label="审核状态"><el-select v-model="shotDraft.reviewStatus"><el-option v-for="item in reviewStatuses" :key="item" :label="item" :value="item" /></el-select></el-form-item></div></el-collapse-item></el-collapse>
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
import dramaTimeline from "@/components/drama/dramaTimeline.vue";
import gptImageGenerator from "@/components/drama/gptImageGenerator.vue";
import { dramaCharacterDisplayName } from "@/lib/dramaCanvas";
import dramaStudioNav from "./dramaStudioNav.vue";
import codexAssistantPane from "./codexAssistantPane.vue";
import { createDramaProject, createSeason, listDramaProjects, readEpisodeScript, saveDramaProject, saveEpisodeDraft, saveEpisodeScriptVersion, updateScriptReview, type DramaAsset, type DramaCharacter, type DramaEpisode, type DramaProject, type DramaProductionStatus, type DramaScene, type DramaShot, type DramaStatus, type DramaScriptVersion } from "@/lib/dramaWorkspace";

const router = useRouter();
const props = defineProps<{ initialProjectId?: string; initialEpisodeId?: string; initialSection?: string }>();
const emit = defineEmits<{
  returnWorkspace: [];
  openCanvas: [target: {
    projectId: string;
    projectName: string;
    seasonId: string;
    seasonName: string;
    episodeId: string;
    episodeNumber: number;
    episodeTitle: string;
    episodes: { id: string; number: number; title: string }[];
  }];
}>();
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
const section = ref("episodes");
const scriptView = ref("editor");
const assetView = ref("scenesAssets");
const currentEpisodeId = ref("");
const seasonId = ref("");
const scriptText = ref("");
const scriptDirty = ref(false);
const viewMode = ref<"timeline" | "table">("timeline");
const timelineZoom = ref(100);
const timelineSaveState = ref("已保存");
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
const characterDraft = ref<DramaCharacter | null>(null);
const characterDetailVisible = ref(false);
const characterImagePrompt = ref("");
const characterImageRatio = ref("1:1");
const sceneDraft = ref<DramaScene | null>(null);
const sceneDetailVisible = ref(false);
const sceneImagePrompt = ref("");
const sceneImageRatio = ref("16:9");
const shotImagePrompt = ref("");
const shotImageRatio = ref("9:16");
const generatedImageId = ref("");
const generatedImagePersisted = ref(false);
const imageAssetSaving = ref(false);
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
  { id: "seasons", label: "全季规划", section: "seasonPlan" },
  { id: "scripts", label: "分集剧本", section: "script" },
  { id: "scenes", label: "场景管理", section: "scenes" },
  { id: "storyboard", label: "分镜镜头", section: "storyboard" },
  { id: "characters", label: "人物资产", section: "characters" },
  { id: "assets", label: "场景道具资产", section: "assets" },
];
const currentSeason = computed(() => project.value?.seasons.find(item => item.id === seasonId.value));
const seasonEpisodes = computed(() => currentSeason.value?.episodes.map(id => project.value?.episodes.find(item => item.id === id)).filter((item): item is DramaEpisode => !!item) ?? []);
const currentEpisode = computed(() => seasonEpisodes.value.find(item => item.id === currentEpisodeId.value));
const episodeLabel = computed(() => currentEpisode.value ? `EP${String(currentEpisode.value.number).padStart(3, "0")} · ${currentEpisode.value.title}` : "未选择分集");
const currentVersionRows = computed(() => (project.value?.scriptVersions[currentEpisode.value?.id ?? ""] ?? []).slice().sort((a, b) => a.version - b.version));
const activeScenes = computed(() => currentEpisode.value?.scenes.filter(item => !item.archived).slice().sort((a, b) => (a.order ?? a.number) - (b.order ?? b.number)) ?? []);
const archivedScenes = computed(() => currentEpisode.value?.scenes.filter(item => item.archived) ?? []);
const visibleScenes = computed(() => showArchivedScenes.value ? currentEpisode.value?.scenes.slice().sort((a, b) => (a.order ?? a.number) - (b.order ?? b.number)) ?? [] : activeScenes.value);
const filteredShots = computed(() => currentEpisode.value?.shots.filter(item => !item.archived && (shotSceneFilter.value === "all" || item.sceneId === shotSceneFilter.value)).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) ?? []);
const currentVersion = computed(() => currentVersionRows.value.at(-1));
const formalVersion = computed(() => currentVersionRows.value.find(item => item.id === currentEpisode.value?.formalVersionId));
const latestVersionLabel = computed(() => currentVersion.value ? `V${String(currentVersion.value.version).padStart(3, "0")} · ${currentVersion.value.status}` : "尚无正式版本");
const formalVersionLabel = computed(() => formalVersion.value ? `V${String(formalVersion.value.version).padStart(3, "0")}` : "未确认");
const assetSectionLabel = computed(() => assetView.value === "scenesAssets" ? "场景资产" : assetView.value === "props" ? "道具资产" : "图片素材");
const imageAssets = computed(() => project.value?.assets.filter(item => item.kind === "image") ?? []);
const gptReferenceOptions = computed(() => [
  ...(project.value?.characters.filter(item => item.referencePath).map(item => ({ id: item.id, label: `人物 · ${dramaCharacterDisplayName(item)}`, referencePath: item.referencePath })) ?? []),
  ...(project.value?.assets.filter(item => item.referencePath && item.kind === "image").map(item => {
    const character = item.characterId ? project.value?.characters.find(candidate => candidate.id === item.characterId) : undefined;
    const label = item.characterId
      ? `人物 · ${dramaCharacterDisplayName(character)}${item.name ? ` · ${item.name}` : ""}`
      : `${item.sceneId ? "场景" : "素材"} · ${item.name || item.id}`;
    return { id: item.id, label, referencePath: item.referencePath };
  }) ?? []),
]);
const sceneImageAsset = computed(() => {
  if (!sceneDraft.value) return undefined;
  const linked = imageAssets.value.filter(item => item.sceneId === sceneDraft.value?.id);
  return linked.find(item => item.id === sceneDraft.value?.referenceAssetId) ?? linked.at(-1);
});
const shotInitialImage = computed(() => imageAssets.value.find(item => item.id === shotDraft.value?.firstFrameAssetId));
const shotInitialImagePath = computed(() => shotInitialImage.value?.referencePath ?? "");
const shotInitialImageLabel = computed(() => shotInitialImage.value?.name ?? "当前首帧素材");
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
watch(() => currentEpisode.value?.id, () => { selectedSceneId.value = ""; selectedShotId.value = ""; selectedShots.value = []; shotSceneFilter.value = "all"; timelineSaveState.value = "已保存"; });
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
onScopeDispose(() => { clearTimeout(autosaveTimer); });

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
    const initialProject = entries.find(item => item.project.id === props.initialProjectId);
    if (initialProject) {
      openProject(initialProject.project);
      const initialEpisode = initialProject.project.episodes.find(item => item.id === props.initialEpisodeId);
      if (initialEpisode) {
        seasonId.value = initialEpisode.seasonId;
        currentEpisodeId.value = initialEpisode.id;
      }
      section.value = props.initialSection ?? "episodes";
    }
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
  section.value = "episodes";
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
  if (section.value === "storyboard" && viewMode.value === "timeline") timelineSaveState.value = "正在保存";
  busy.value = true;
  try { await saveDramaProject(files, targetProject, targetPath); if (generatedImageId.value && targetProject.assets.some(item => item.id === generatedImageId.value)) generatedImagePersisted.value = true; if (directory === workspaceDirectory.value) ElMessage.success("项目已保存"); if (section.value === "storyboard" && viewMode.value === "timeline") timelineSaveState.value = "已保存"; return true; }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "保存失败"); if (section.value === "storyboard" && viewMode.value === "timeline") timelineSaveState.value = "保存失败"; return false; }
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
function enterCanvasById(episodeId: string) {
  const episode = project.value?.episodes.find(item => item.id === episodeId);
  if (episode) enterCanvas(episode);
}
function enterCanvas(episode: DramaEpisode) {
  if (!project.value) return;
  const season = project.value.seasons.find(item => item.id === episode.seasonId);
  if (!season) return;
  seasonId.value = season.id;
  currentEpisodeId.value = episode.id;
  section.value = "episodes";
  emit("openCanvas", {
    projectId: project.value.id,
    projectName: project.value.name,
    seasonId: season.id,
    seasonName: season.name,
    episodeId: episode.id,
    episodeNumber: episode.number,
    episodeTitle: episode.title,
    episodes: season.episodes.flatMap(id => {
      const item = project.value?.episodes.find(candidate => candidate.id === id);
      return item ? [{ id: item.id, number: item.number, title: item.title }] : [];
    }),
  });
}
function addScene() {
  if (!currentEpisode.value) return;
  const scenes = currentEpisode.value.scenes;
  const scene: DramaScene = { id: crypto.randomUUID(), number: Math.max(0, ...scenes.map(item => item.number)) + 1, order: Math.max(0, ...scenes.map(item => item.order ?? item.number)) + 1, sourceScriptVersionId: currentVersion.value?.id, archived: false, heading: "", time: "", location: "", interiorExterior: "内景", dayPart: "白天", characters: [], charactersText: "", description: "" };
  currentEpisode.value.scenes.push(scene); openSceneDetail(scene); void save();
}
function openSceneDetail(scene: DramaScene) {
  selectScene(scene);
  sceneDraft.value = { ...scene, characters: scene.characters.slice() };
  sceneImagePrompt.value = makeScenePrompt(scene);
  sceneImageRatio.value = "16:9";
  generatedImageId.value = "";
  generatedImagePersisted.value = false;
  sceneDetailVisible.value = true;
}
function makeScenePrompt(scene: DramaScene) {
  return ["短剧场景设定图，突出空间布局、环境氛围与可拍摄细节。", scene.heading && `场景：${scene.heading}`, scene.location && `地点：${scene.location}`, scene.description && `环境描述：${scene.description}`, scene.interiorExterior && scene.dayPart && `${scene.interiorExterior}，${scene.dayPart}`, scene.time && `时间：${scene.time}`, project.value?.style && `画面风格：${project.value.style}`].filter(Boolean).join("\n");
}
async function saveSceneDetail() {
  const target = currentEpisode.value?.scenes.find(item => item.id === sceneDraft.value?.id);
  if (!target || !sceneDraft.value) return;
  Object.assign(target, sceneDraft.value, { characters: sceneDraft.value.characters.slice() });
  if (await save()) sceneDetailVisible.value = false;
}
function addShot(sceneId?: string) {
  if (!currentEpisode.value) return;
  const shots = currentEpisode.value.shots;
  const selectedScene = sceneId ? currentEpisode.value.scenes.find(item => item.id === sceneId && !item.archived) : undefined;
  if (sceneId && !selectedScene) { ElMessage.warning("只能在当前分集的未归档场景中新增镜头"); return; }
  const shot: DramaShot = { id: crypto.randomUUID(), number: nextShotNumber(shots), order: Math.max(0, ...shots.map(item => item.order ?? 0)) + 1, sceneId: selectedScene?.id ?? activeScenes.value[0]?.id ?? "", description: "", action: "", expression: "", size: "", angle: "", composition: "", movement: "", dialogue: "", sound: "", duration: 3, imagePrompt: "", videoPrompt: "", referencePath: "", productionStatus: "待制作", reviewStatus: "草稿", status: "草稿" };
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
  scenes.push({ ...scene, id: crypto.randomUUID(), number: Math.max(0, ...scenes.map(item => item.number)) + 1, order: Math.max(0, ...scenes.map(item => item.order ?? item.number)) + 1, heading: `${scene.heading}（副本）`, archived: false, referenceAssetId: undefined });
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
type TimelineShotMove = { shotId: string; sceneId: string; targetShotId?: string; position: "before" | "after" | "end" };
async function moveTimelineShot(move: TimelineShotMove) {
  const episode = currentEpisode.value;
  if (!episode || busy.value) return;
  const shot = episode.shots.find(item => item.id === move.shotId);
  if (!shot) return;
  const targetSceneId = move.sceneId === "__unassigned__" ? "" : move.sceneId;
  const destinationScene = episode.scenes.find(item => item.id === targetSceneId);
  if (targetSceneId && !destinationScene) { ElMessage.warning("目标场景不属于当前分集"); return; }
  if (destinationScene?.archived && shot.sceneId !== destinationScene.id) { ElMessage.warning("镜头不能移动到已归档场景"); return; }
  if (shot.id === move.targetShotId && shot.sceneId === targetSceneId) return;
  const originalOrder = episode.shots.map(item => ({ shot: item, sceneId: item.sceneId, order: item.order }));
  const destinationShots = episode.shots.filter(item => item.sceneId === targetSceneId && item.id !== shot.id).sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  let insertAt = destinationShots.length;
  if (move.position !== "end") {
    const targetIndex = destinationShots.findIndex(item => item.id === move.targetShotId);
    if (targetIndex < 0) return;
    insertAt = targetIndex + (move.position === "after" ? 1 : 0);
  }
  destinationShots.splice(insertAt, 0, shot);
  shot.sceneId = targetSceneId;
  const sceneIds = episode.scenes.slice().sort((left, right) => (left.order ?? left.number) - (right.order ?? right.number)).map(item => item.id);
  const orderedSceneIds = [...sceneIds, ...new Set(episode.shots.map(item => item.sceneId).filter(id => !sceneIds.includes(id)))];
  const orderedShots = orderedSceneIds.flatMap(id => id === targetSceneId
    ? destinationShots
    : episode.shots.filter(item => item.sceneId === id).sort((left, right) => (left.order ?? 0) - (right.order ?? 0)));
  orderedShots.forEach((item, index) => { item.order = index + 1; });
  if (await save()) {
    timelineSaveState.value = `${shot.number} 已移动至 ${destinationScene?.heading || "未关联场景"} · 已保存`;
  } else {
    originalOrder.forEach(item => { item.shot.sceneId = item.sceneId; item.shot.order = item.order; });
    timelineSaveState.value = "保存失败";
  }
}
async function deleteTimelineShot(shot: DramaShot) {
  const episode = currentEpisode.value;
  if (!episode || busy.value) return;
  const confirmed = await ElMessageBox.confirm(`从 ${episodeLabel.value} 删除镜头 ${shot.number}？关联图片会保留在素材库。`, "删除镜头", { confirmButtonText: "删除镜头", cancelButtonText: "取消", type: "warning" }).then(() => true, () => false);
  if (!confirmed || episode !== currentEpisode.value) return;
  const shotIndex = episode.shots.findIndex(item => item.id === shot.id);
  if (shotIndex < 0) return;
  const originalOrder = episode.shots.map(item => ({ shot: item, order: item.order }));
  const linkedAssets = project.value?.assets.filter(item => item.shotId === shot.id) ?? [];
  const linkedAssetIds = linkedAssets.map(item => item.id);
  episode.shots.splice(shotIndex, 1);
  linkedAssets.forEach(item => { item.shotId = undefined; });
  episode.shots.slice().sort((left, right) => (left.order ?? 0) - (right.order ?? 0)).forEach((item, index) => { item.order = index + 1; });
  if (!await save()) {
    episode.shots.splice(shotIndex, 0, shot);
    originalOrder.forEach(item => { item.shot.order = item.order; });
    project.value?.assets.filter(item => linkedAssetIds.includes(item.id)).forEach(item => { item.shotId = shot.id; });
    timelineSaveState.value = "保存失败";
    return;
  }
  if (selectedShotId.value === shot.id) { selectedShotId.value = ""; selectedSceneId.value = ""; }
  timelineSaveState.value = `${shot.number} 已删除 · 图片保留在素材库`;
}
function copyShot(shot: DramaShot) {
  if (!currentEpisode.value) return;
  const shots = currentEpisode.value.shots;
  shots.push({ ...shot, id: crypto.randomUUID(), number: nextShotNumber(shots), order: Math.max(0, ...shots.map(item => item.order ?? 0)) + 1, productionStatus: "待制作", reviewStatus: "草稿", status: "草稿" });
  void save();
}
function openShotDetail(shot: DramaShot) {
  selectShot(shot);
  shotDraft.value = { ...shot, imagePrompt: shot.imagePrompt || makeShotPrompt(shot) };
  shotImagePrompt.value = shotDraft.value.imagePrompt ?? "";
  shotImageRatio.value = ["1:1", "16:9", "9:16"].includes(shot.aspectRatio ?? "") ? shot.aspectRatio! : "9:16";
  generatedImageId.value = "";
  generatedImagePersisted.value = false;
  shotDetailVisible.value = true;
}
function makeShotPrompt(shot: DramaShot) {
  return ["短剧分镜画面，单帧构图清晰，适合后续动画制作。", sceneTitle(shot.sceneId) && `场景：${sceneTitle(shot.sceneId)}`, shot.size && `景别：${shot.size}`, shot.angle && `机位：${shot.angle}`, shot.description && `画面：${shot.description}`, shot.action && `动作：${shot.action}`, shot.expression && `表情：${shot.expression}`, project.value?.style && `画面风格：${project.value.style}`].filter(Boolean).join("\n");
}
type GeneratedImageResult = { path: string; mimeType: string; prompt: string; aspectRatio: string; modelId: string; referenceAssetIds: string[]; width?: number; height?: number };
type ImageAssociation = { characterId?: string; episodeId?: string; sceneId?: string; shotId?: string };
async function persistGeneratedImage(image: GeneratedImageResult, association: ImageAssociation, label: string) {
  const targetProject = project.value;
  if (!targetProject || imageAssetSaving.value) return;
  imageAssetSaving.value = true;
  generatedImagePersisted.value = false;
  try {
    const previousGeneratedImageId = generatedImageId.value;
    const targetShot = association.shotId && shotDraft.value?.id === association.shotId ? shotDraft.value : undefined;
    const previousShotAspectRatio = targetShot?.aspectRatio;
    const asset: DramaAsset = { id: crypto.randomUUID(), kind: "image", name: `${label} GPT 生图 ${new Date().toLocaleString()}`, description: image.prompt, referencePath: image.path, version: 1,
      generatedBy: "gptImageSubscription", modelId: image.modelId, generatedAt: new Date().toISOString(), requestedAspectRatio: image.aspectRatio,
      width: image.width, height: image.height, referenceAssetIds: image.referenceAssetIds, projectId: targetProject.id, ...association };
    targetProject.assets.push(asset);
    generatedImageId.value = asset.id;
    if (targetShot) targetShot.aspectRatio = image.aspectRatio;
    generatedImagePersisted.value = await save();
    if (!generatedImagePersisted.value) {
      const assetIndex = targetProject.assets.findIndex(item => item.id === asset.id);
      if (assetIndex >= 0) targetProject.assets.splice(assetIndex, 1);
      generatedImageId.value = previousGeneratedImageId;
      if (targetShot) targetShot.aspectRatio = previousShotAspectRatio;
    }
  } finally { imageAssetSaving.value = false; }
}
async function persistCharacterImage(image: GeneratedImageResult) {
  const character = characterDraft.value;
  if (!character || !characterDetailVisible.value) return;
  await persistGeneratedImage(image, { characterId: character.id }, character.name || "人物");
}
async function persistSceneImage(image: GeneratedImageResult) {
  const scene = sceneDraft.value;
  if (!scene || !sceneDetailVisible.value || !currentEpisode.value) return;
  await persistGeneratedImage(image, { episodeId: currentEpisode.value.id, sceneId: scene.id }, scene.heading || "场景");
}
async function persistShotImage(image: GeneratedImageResult) {
  const shot = shotDraft.value;
  if (!shot || !shotDetailVisible.value || !currentEpisode.value) return;
  await persistGeneratedImage(image, { episodeId: currentEpisode.value.id, sceneId: shot.sceneId, shotId: shot.id }, shot.number);
}
async function saveImageReferences(assets: DramaAsset[], association: ImageAssociation) {
  const targetProject = project.value;
  if (!targetProject || imageAssetSaving.value) return;
  imageAssetSaving.value = true;
  try {
    const references = assets.map(asset => ({ ...asset, projectId: targetProject.id, ...association }));
    targetProject.assets.push(...references);
    const last = references.at(-1);
    if (last?.characterId) {
      const character = targetProject.characters.find(item => item.id === last.characterId);
      if (character) { character.referencePath = last.referencePath; if (characterDraft.value?.id === character.id) characterDraft.value.referencePath = last.referencePath; }
    }
    if (last?.sceneId) {
      const scene = currentEpisode.value?.scenes.find(item => item.id === last.sceneId);
      if (scene) scene.referenceAssetId = last.id;
      if (sceneDraft.value?.id === last.sceneId) sceneDraft.value.referenceAssetId = last.id;
    }
    if (last?.shotId) {
      const shot = currentEpisode.value?.shots.find(item => item.id === last.shotId);
      if (shot) shot.referenceAssetIds = [...new Set([...(shot.referenceAssetIds ?? []), ...references.map(item => item.id)])];
      if (shotDraft.value?.id === last.shotId) shotDraft.value.referenceAssetIds = [...new Set([...(shotDraft.value.referenceAssetIds ?? []), ...references.map(item => item.id)])];
    }
    await save();
  } finally { imageAssetSaving.value = false; }
}
function saveCharacterReferences(assets: DramaAsset[]) { return characterDraft.value ? saveImageReferences(assets, { characterId: characterDraft.value.id }) : undefined; }
function saveSceneReferences(assets: DramaAsset[]) { return sceneDraft.value && currentEpisode.value ? saveImageReferences(assets, { episodeId: currentEpisode.value.id, sceneId: sceneDraft.value.id }) : undefined; }
function saveShotReferences(assets: DramaAsset[]) { return shotDraft.value && currentEpisode.value ? saveImageReferences(assets, { episodeId: currentEpisode.value.id, sceneId: shotDraft.value.sceneId, shotId: shotDraft.value.id }) : undefined; }
async function useCharacterImage(path: string) {
  const character = characterDraft.value;
  const target = project.value?.characters.find(item => item.id === character?.id);
  if (!character || !target || !project.value?.assets.some(item => item.characterId === character.id && item.referencePath === path)) return;
  target.referencePath = path;
  character.referencePath = path;
  await save();
}
async function useSceneImage(path: string) {
  const scene = sceneDraft.value;
  const target = currentEpisode.value?.scenes.find(item => item.id === scene?.id);
  const asset = project.value?.assets.find(item => item.sceneId === scene?.id && item.referencePath === path);
  if (!scene || !target || !asset) return;
  target.referenceAssetId = asset.id;
  scene.referenceAssetId = asset.id;
  await save();
}
async function useShotImage(path: string) {
  const shot = shotDraft.value;
  const asset = project.value?.assets.find(item => item.shotId === shot?.id && item.referencePath === path);
  if (!shot || !asset) return;
  shot.firstFrameAssetId = asset.id;
  shot.referenceAssetIds = [...new Set([...(shot.referenceAssetIds ?? []), ...(asset.referenceAssetIds ?? [])])];
  shot.aspectRatio = asset.requestedAspectRatio ?? shot.aspectRatio;
  await saveShotDetail();
}
async function saveShotDetail() {
  const target = currentEpisode.value?.shots.find(item => item.id === shotDraft.value?.id);
  if (!target || !shotDraft.value) return;
  shotDraft.value.imagePrompt = shotImagePrompt.value;
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
function sceneImageLabel(scene: DramaScene) {
  const linked = imageAssets.value.filter(item => item.sceneId === scene.id);
  return (linked.find(item => item.id === scene.referenceAssetId) ?? linked.at(-1))?.name || "未设置";
}
function openCharacterDetail(character: DramaCharacter) {
  characterDraft.value = { ...character };
  characterImagePrompt.value = makeCharacterPrompt(character);
  characterImageRatio.value = "1:1";
  generatedImageId.value = "";
  generatedImagePersisted.value = false;
  characterDetailVisible.value = true;
}
function makeCharacterPrompt(character: DramaCharacter) {
  return ["短剧人物设定图，单人全身或半身角色设计，清晰表现人物辨识特征。", character.name && `人物：${character.name}`, character.description && `身份及性格：${character.description}`, character.appearance && `外貌描述：${character.appearance}`, project.value?.style && `画面风格：${project.value.style}`].filter(Boolean).join("\n");
}
async function saveCharacterDetail() {
  const target = project.value?.characters.find(item => item.id === characterDraft.value?.id);
  if (!target || !characterDraft.value) return;
  Object.assign(target, characterDraft.value);
  if (await save()) characterDetailVisible.value = false;
}
function addCharacter() {
  if (!project.value) return;
  const character: DramaCharacter = { id: crypto.randomUUID(), name: "", description: "", appearance: "", referencePath: "", version: 1 };
  project.value.characters.push(character);
  openCharacterDetail(character);
  void save();
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
    if (directory === workspaceDirectory.value && row.episodeId === currentEpisode.value?.id) { loadingScript.value = true; activeScriptEpisodeId.value = row.episodeId; scriptText.value = content; loadingScript.value = false; autosaveStatus.value = `${versionLabel(row)} 已载入工作区编辑器`; scriptView.value = "editor"; section.value = "script"; }
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
.projectList { width: min(900px, calc(100% - 48px)); margin: 32px auto; padding: 24px; border: 1px solid var(--el-border-color-lighter); border-radius: 7px; background: var(--el-bg-color); }
.projectCards { display: grid; gap: 10px; }
.projectCard { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 16px; width: 100%; padding: 16px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; color: var(--el-text-color-primary); background: var(--el-bg-color); text-align: left; cursor: pointer; &:hover { border-color: var(--el-color-primary-light-5); background: var(--el-fill-color-light); } }
.projectCardHeading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 16px; strong { font-size: 15px; } small, .projectCardMeta { color: var(--el-text-color-secondary); font-size: 12px; } }
.projectCardMeta { color: var(--el-text-color-secondary); font-size: 12px; }
.projectCardAction { grid-column: 2; grid-row: 1 / span 2; align-self: center; color: var(--el-color-primary); font-size: 13px; }
.loadingState { width: min(900px, calc(100% - 48px)); margin: 48px auto; display: grid; gap: 18px; }
.formRow { display: flex; gap: 16px; > * { flex: 1; } }
.workspaceTopbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 46px; padding: 6px 16px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-bg-color); > div:first-child { display: flex; align-items: baseline; gap: 12px; min-width: 0; strong { color: var(--el-text-color-primary); font-size: 14px; } span { overflow: hidden; color: var(--el-text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; } } }
.topbarMeta { display: flex; align-items: center; gap: 12px; color: var(--el-text-color-secondary); font-size: 12px; }
.dramaLayout { display: grid; grid-template-columns: 205px minmax(0, 1fr) 315px; flex: 1; min-height: 0; transition: grid-template-columns .18s ease; }
.dramaLayout.assistantCollapsed { grid-template-columns: 205px minmax(0, 1fr) 44px; }
.dramaContent { min-width: 0; overflow: auto; padding: 18px; }
.contentPanel { min-width: 0; padding: 18px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: var(--el-bg-color); h2 { margin: 0; font-size: 17px; } > p { color: var(--el-text-color-secondary); } }
.panelHeading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; p { margin: 5px 0 0; color: var(--el-text-color-secondary); font-size: 13px; } > div:last-child { display: flex; gap: 8px; } }
.timelineToolbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: -18px -18px 16px; padding: 16px 18px; color: #e6edf6; background: #141b24; border-bottom: 1px solid #303b4a; }
.timelineIdentity { min-width: 180px; > span { color: #7e9ab8; font-size: 10px; letter-spacing: .1em; } h2 { margin: 3px 0 !important; color: #eef5fc; font-size: 17px !important; } p { margin: 0; color: #94a4b7; font-size: 12px; } }
.timelineToolbarControls { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 9px; }
.timelineSceneSelect { width: 170px; }
.timelineZoom { display: flex; align-items: center; gap: 7px; color: #b2bfce; font-size: 11px; white-space: nowrap; input { width: 90px; accent-color: #69aaff; } span { min-width: 34px; color: #dce9f7; text-align: right; } }
.timelineSaveState { min-width: 86px; color: #83d4a0; font-size: 11px; white-space: nowrap; &.saving { color: #edc275; } &.failed { color: #ff8989; } }
.overviewGrid { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 10px; margin: 20px 0; > div { display: grid; gap: 6px; padding: 14px; border: 1px solid var(--el-border-color-lighter); border-radius: 5px; span { color: var(--el-text-color-secondary); font-size: 12px; } strong { font-size: 18px; font-weight: 600; } } }
.episodeGrid { display: grid; gap: 8px; }
.episodeCard { display: grid; grid-template-columns: 84px minmax(0, 1fr) auto 88px; align-items: center; gap: 14px; width: 100%; min-height: 68px; padding: 12px 16px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; color: var(--el-text-color-primary); background: var(--el-bg-color); text-align: left; cursor: pointer; &:hover { border-color: var(--el-color-primary-light-5); background: var(--el-fill-color-light); } }
.episodeNumber { color: var(--el-text-color-secondary); font-size: 12px; font-weight: 600; }
.episodeInfo { display: grid; gap: 4px; min-width: 0; strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } small { color: var(--el-text-color-secondary); font-size: 11px; } }
.episodeStatus { justify-self: start; }
.episodeAction { justify-self: end; color: var(--el-color-primary); font-size: 12px; }
.saveInline { margin-top: 14px; }
.scriptLayout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: stretch; }
.scriptEditor { min-width: 0; > p { margin: 8px 0; color: var(--el-text-color-secondary); font-size: 12px; } }
.scriptVersionSummary { display: flex; flex-wrap: wrap; gap: 16px; color: var(--el-text-color-secondary); font-size: 12px; }
.batchBar, .versionCompareControls { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.compareColumns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; max-height: 70vh; overflow: auto; section { min-width: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 5px; padding: 12px; } h3 { margin: 0 0 10px; font-size: 14px; } pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.6; } }
.shotDetailForm { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; .el-form-item:has(textarea) { grid-column: 1 / -1; } }
.entityDetailForm { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; .wideFormItem, .el-collapse { grid-column: 1 / -1; } }
.shotDetailForm .wideFormItem { grid-column: 1 / -1; }
.tableSubtext { display: block; margin-top: 4px; color: var(--el-text-color-secondary); font-size: 12px; }
.tableDescription { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; white-space: normal; }
.capabilityNote { margin-block: 12px 18px; }
.assetTabs { margin-block: 8px 12px; }
@media (max-width: 1200px) { .dramaLayout { grid-template-columns: 180px minmax(0, 1fr) 280px; } .dramaLayout.assistantCollapsed { grid-template-columns: 180px minmax(0, 1fr) 44px; } .dramaContent { padding: 12px; } }
@media (max-width: 900px) { .dramaLayout { grid-template-columns: 160px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 340px; } .dramaLayout.assistantCollapsed { grid-template-rows: minmax(0, 1fr) 48px; } .assistantPane { grid-column: 1 / -1; grid-row: 2; border-inline-start: 0; border-top: 1px solid var(--el-border-color-lighter); } .assistantPane.collapsed { width: auto; } .collapsed .assistantHeader { flex-direction: row; padding: 4px 10px; } .topbarMeta { display: none; } }
@media (max-width: 1100px) { .timelineToolbar { align-items: flex-start; flex-direction: column; } .timelineToolbarControls { justify-content: flex-start; } }
@media (max-width: 700px) { .dramaHeader { align-items: flex-start; flex-direction: column; padding: 12px 16px; } .headerActions { flex-wrap: wrap; } .workspaceTopbar > div:first-child { flex-direction: column; gap: 2px; } .dramaLayout { grid-template-columns: 135px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 320px; } .dramaLayout.assistantCollapsed { grid-template-rows: minmax(0, 1fr) 46px; } .dramaContent { padding: 8px; } .contentPanel { padding: 12px; } .overviewGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .episodeCard { grid-template-columns: 58px minmax(0, 1fr) auto; gap: 8px; padding: 10px; } .episodeAction { grid-column: 2 / -1; justify-self: start; } .compareColumns, .shotDetailForm, .entityDetailForm { grid-template-columns: minmax(0, 1fr); } .panelHeading { align-items: flex-start; flex-direction: column; } .timelineToolbar { margin: -12px -12px 12px; padding: 12px; } .timelineToolbarControls { align-items: flex-start; } .timelineSceneSelect { width: 100%; } }
</style>
