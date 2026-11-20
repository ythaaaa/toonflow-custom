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
      <el-table v-else :data="projects" rowKey="id" @rowClick="openProject"><el-table-column prop="name" label="项目名称" minWidth="220" /><el-table-column prop="genre" label="题材" minWidth="160" /><el-table-column prop="style" label="画面风格" minWidth="180" /><el-table-column label="集数" width="100"><template #default="scope">{{ scope.row.episodes.length }} / {{ scope.row.targetEpisodes }}</template></el-table-column><el-table-column prop="updatedAt" label="最近修改" minWidth="170"><template #default="scope">{{ formatDate(scope.row.updatedAt) }}</template></el-table-column><el-table-column label="操作" width="110"><template #default="scope"><el-button link type="primary" @click.stop="openProject(scope.row)">打开项目</el-button></template></el-table-column></el-table>
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
      <div class="projectSummary"><strong>{{ project.name }}</strong><span>{{ project.genre || '未设题材' }}</span><span>{{ project.style || '未设画风' }}</span><span>{{ project.episodes.length }} 集</span><el-tag>{{ currentEpisode?.status ?? '未选择分集' }}</el-tag></div>
      <div class="dramaLayout">
        <nav class="dramaNav" aria-label="短剧管理导航">
          <button v-for="item in sections" :key="item.id" :class="{ active: section === item.id }" @click="section = item.id">{{ item.label }}</button>
          <el-divider />
          <el-select v-model="seasonId" placeholder="选择季度" aria-label="选择季度"><el-option v-for="season in project.seasons" :key="season.id" :label="season.name" :value="season.id" /></el-select>
          <button v-for="episode in seasonEpisodes" :key="episode.id" class="episodeNav" :class="{ active: currentEpisodeId === episode.id }" @click="currentEpisodeId = episode.id">EP{{ String(episode.number).padStart(3, '0') }} · {{ episode.title }}</button>
          <el-button class="addSeason" @click="addSeason">新增季度</el-button>
        </nav>
        <section class="dramaContent">
          <div v-if="section === 'overview'" class="contentPanel">
            <h2>项目概览</h2><div class="overviewGrid"><div><span>季度</span><strong>{{ project.seasons.length }}</strong></div><div><span>分集</span><strong>{{ project.episodes.length }} / {{ project.targetEpisodes }}</strong></div><div><span>已完成剧本</span><strong>{{ project.episodes.filter(item => item.scriptVersion > 0).length }}</strong></div><div><span>最近修改</span><strong>{{ formatDate(project.updatedAt) }}</strong></div></div>
            <el-form labelPosition="top"><div class="formRow"><el-form-item label="项目名称"><el-input v-model="project.name" /></el-form-item><el-form-item label="题材"><el-input v-model="project.genre" /></el-form-item><el-form-item label="画面风格"><el-input v-model="project.style" /></el-form-item></div><div class="formRow"><el-form-item label="目标集数"><el-input-number v-model="project.targetEpisodes" :min="1" :max="500" /></el-form-item><el-form-item label="单集目标时长（秒）"><el-input-number v-model="project.targetDuration" :min="30" :max="7200" /></el-form-item></div><el-form-item label="全季故事总纲"><el-input v-model="project.storyOutline" type="textarea" :rows="5" placeholder="记录世界观、整季主线和上下集衔接原则" /></el-form-item></el-form>
          </div>
          <div v-else-if="section === 'episodes'" class="contentPanel">
            <div class="panelHeading"><div><h2>季度与分集</h2><p>{{ currentSeason?.name ?? '请先创建季度' }}</p></div><el-button type="primary" :disabled="!currentSeason" @click="addEpisode">新增一集</el-button></div>
            <el-table :data="seasonEpisodes" rowKey="id" @rowClick="selectEpisode"><el-table-column prop="number" label="序号" width="90"><template #default="scope">EP{{ String(scope.row.number).padStart(3, '0') }}</template></el-table-column><el-table-column label="集名" minWidth="170"><template #default="scope"><el-input v-model="scope.row.title" /></template></el-table-column><el-table-column label="分集大纲" minWidth="250"><template #default="scope"><el-input v-model="scope.row.outline" /></template></el-table-column><el-table-column label="状态" width="120"><template #default="scope"><el-tag>{{ scope.row.status }}</el-tag></template></el-table-column><el-table-column label="剧本版本" width="100"><template #default="scope">{{ scope.row.scriptVersion || '—' }}</template></el-table-column></el-table>
          </div>
          <div v-else-if="section === 'script'" class="contentPanel">
            <div class="panelHeading"><div><h2>剧本编辑</h2><p>{{ episodeLabel }} · Markdown · {{ autosaveStatus }} · 正式版：{{ formalVersionLabel }}</p></div><div><el-button :disabled="!currentEpisode" :loading="busy" @click="saveScriptDraft">保存工作稿</el-button><el-button :disabled="!scriptText.trim()" @click="runCodexTask('scenes')">Codex 拆分场景</el-button><el-button :disabled="!scriptText.trim() || !currentEpisode?.scenes.length" @click="runCodexTask('shots')">Codex 生成分镜</el-button><el-button type="primary" :disabled="!currentEpisode || !scriptText.trim()" :loading="busy" @click="saveScript">保存为新版本</el-button></div></div>
            <div v-if="currentEpisode" class="scriptLayout"><div class="scriptEditor"><el-input v-model="scriptText" type="textarea" :rows="24" resize="vertical" aria-label="Markdown 剧本正文" placeholder="编辑本集完整剧本；内容自动保存为工作稿。" /><p>自动保存只更新独立工作稿，不改写任何版本文件。</p><div class="scriptVersionSummary"><span>最近版本：{{ latestVersionLabel }}</span><span v-if="currentEpisode.formalVersionId">正式版已锁定，工作稿修改不会覆盖正式版本。</span></div></div><aside class="codexDraft"><div class="codexHeading"><strong>Codex 创作</strong><span>回复可导入为草稿；拆场和分镜结果需确认</span></div><localCodexConversation ref="codexConversation" v-model:selectedModel="codexModel" :directory="workspace.project?.directory" @assistantCompleted="receiveCodexReply" /></aside></div>
            <el-empty v-else description="请先选择或创建分集" />
          </div>
          <div v-else-if="section === 'scenes'" class="contentPanel">
            <div class="panelHeading"><div><h2>场景管理</h2><p>{{ episodeLabel }} · {{ activeScenes.length }} 个场景 · 已归档 {{ archivedScenes.length }}</p></div><div><el-checkbox v-model="showArchivedScenes">显示已归档</el-checkbox><el-button type="primary" :disabled="!currentEpisode" @click="addScene">新增场景</el-button><el-button :disabled="!currentEpisode" @click="save">保存场景</el-button></div></div>
            <el-table v-if="currentEpisode" :data="visibleScenes" rowKey="id">
              <el-table-column prop="number" label="场次" width="86"><template #default="scope">S{{ String(scope.row.number).padStart(3, "0") }}</template></el-table-column>
              <el-table-column label="地点 / 标题" minWidth="190"><template #default="scope"><el-input v-model="scope.row.heading" aria-label="场景标题" /><el-input v-model="scope.row.location" aria-label="场景地点" /></template></el-table-column>
              <el-table-column label="内外景 / 时段" width="190"><template #default="scope"><el-select v-model="scope.row.interiorExterior" aria-label="内景或外景"><el-option label="内景" value="内景" /><el-option label="外景" value="外景" /></el-select><el-select v-model="scope.row.dayPart" aria-label="场景时段"><el-option v-for="item in dayParts" :key="item" :label="item" :value="item" /></el-select></template></el-table-column>
              <el-table-column label="时间" width="130"><template #default="scope"><el-input v-model="scope.row.time" aria-label="场景时间" /></template></el-table-column>
              <el-table-column label="出场人物" width="170"><template #default="scope"><el-input v-model="scope.row.charactersText" @change="syncSceneCharacters(scope.row)" /></template></el-table-column>
              <el-table-column label="场景描述" minWidth="260"><template #default="scope"><el-input v-model="scope.row.description" type="textarea" :rows="2" /></template></el-table-column>
              <el-table-column label="排序 / 操作" width="200" fixed="right"><template #default="scope"><el-button link :disabled="scope.$index === 0" @click="moveScene(scope.row, -1)">上移</el-button><el-button link :disabled="scope.$index === visibleScenes.length - 1" @click="moveScene(scope.row, 1)">下移</el-button><el-button link @click="copyScene(scope.row)">复制</el-button><el-button link type="warning" @click="toggleSceneArchive(scope.row)">{{ scope.row.archived ? "恢复" : "归档" }}</el-button></template></el-table-column>
            </el-table>
            <el-empty v-else description="请先选择分集" />
          </div>
          <div v-else-if="section === 'storyboard'" class="contentPanel">
            <div class="panelHeading"><div><h2>分镜管理</h2><p>{{ episodeLabel }} · {{ filteredShots.length }} 个镜头 · 镜号与稳定 ID 独立于排序</p></div><div><el-select v-model="shotSceneFilter" aria-label="按场景筛选"><el-option label="所有场景" value="all" /><el-option v-for="scene in activeScenes" :key="scene.id" :label="scene.heading || `场景 ${scene.number}`" :value="scene.id" /></el-select><el-button :disabled="!currentEpisode" @click="viewMode = viewMode === 'table' ? 'cards' : 'table'">{{ viewMode === 'table' ? '卡片视图' : '表格视图' }}</el-button><el-button type="primary" :disabled="!currentEpisode" @click="addShot">新增镜头</el-button><el-button :disabled="!currentEpisode" @click="save">保存分镜</el-button></div></div>
            <div class="batchBar"><el-select v-model="batchProductionStatus" aria-label="批量制作状态"><el-option v-for="item in productionStatuses" :key="item" :label="item" :value="item" /></el-select><el-button :disabled="!selectedShots.length" @click="applyBatchProductionStatus">更新所选制作状态</el-button><el-select v-model="batchReviewStatus" aria-label="批量审核状态"><el-option v-for="item in reviewStatuses" :key="item" :label="item" :value="item" /></el-select><el-button :disabled="!selectedShots.length" @click="applyBatchReviewStatus">更新所选审核状态</el-button></div>
            <el-table v-if="currentEpisode && viewMode === 'table'" :data="filteredShots" rowKey="id" @selectionChange="selectedShots = $event">
              <el-table-column type="selection" width="48" /><el-table-column prop="number" label="镜号" width="95" />
              <el-table-column label="场景" width="160"><template #default="scope"><el-select v-model="scope.row.sceneId" aria-label="镜头场景"><el-option v-for="scene in activeScenes" :key="scene.id" :label="scene.heading || `场景 ${scene.number}`" :value="scene.id" /></el-select></template></el-table-column>
              <el-table-column label="景别 / 机位" width="175"><template #default="scope"><el-input v-model="scope.row.size" aria-label="景别" /><el-input v-model="scope.row.angle" aria-label="机位" /></template></el-table-column>
              <el-table-column label="画面" minWidth="220"><template #default="scope"><el-input v-model="scope.row.description" aria-label="画面描述" type="textarea" :rows="2" /></template></el-table-column>
              <el-table-column label="动作 / 对白" minWidth="230"><template #default="scope"><el-input v-model="scope.row.action" aria-label="人物动作" /><el-input v-model="scope.row.dialogue" aria-label="人物台词" /></template></el-table-column>
              <el-table-column label="时长" width="105"><template #default="scope"><el-input-number v-model="scope.row.duration" :min="1" :max="600" aria-label="镜头时长" /></template></el-table-column>
              <el-table-column label="制作 / 审核" width="190"><template #default="scope"><el-select v-model="scope.row.productionStatus" aria-label="制作状态"><el-option v-for="item in productionStatuses" :key="item" :label="item" :value="item" /></el-select><el-select v-model="scope.row.reviewStatus" aria-label="镜头审核状态"><el-option v-for="item in reviewStatuses" :key="item" :label="item" :value="item" /></el-select></template></el-table-column>
              <el-table-column label="操作" width="150" fixed="right"><template #default="scope"><el-button link type="primary" @click="openShotDetail(scope.row)">详情</el-button><el-button link @click="copyShot(scope.row)">复制</el-button><el-button link :disabled="scope.$index === 0" @click="moveShot(scope.row, -1)">上移</el-button><el-button link :disabled="scope.$index === filteredShots.length - 1" @click="moveShot(scope.row, 1)">下移</el-button></template></el-table-column>
            </el-table>
            <div v-else-if="currentEpisode" class="shotCards"><article v-for="shot in filteredShots" :key="shot.id" @click="openShotDetail(shot)"><strong>{{ shot.number }} · {{ sceneTitle(shot.sceneId) }}</strong><span>{{ shot.description }}</span><small>{{ shot.size }} · {{ shot.duration }} 秒 · {{ shot.productionStatus }} · {{ shot.reviewStatus }}</small></article></div>
            <el-empty v-else description="请先选择分集" />
          </div>
          <div v-else-if="section === 'characters'" class="contentPanel">
            <div class="panelHeading"><div><h2>人物资产</h2><p>项目内跨集复用；图片以工作区相对路径关联</p></div><el-button type="primary" @click="addCharacter">新增人物</el-button></div>
            <el-table :data="project.characters" rowKey="id"><el-table-column prop="name" label="人物" width="160"><template #default="scope"><el-input v-model="scope.row.name" /></template></el-table-column><el-table-column prop="description" label="背景与性格" minWidth="220"><template #default="scope"><el-input v-model="scope.row.description" type="textarea" :rows="2" /></template></el-table-column><el-table-column prop="appearance" label="造型设定" minWidth="220"><template #default="scope"><el-input v-model="scope.row.appearance" type="textarea" :rows="2" /></template></el-table-column><el-table-column prop="referencePath" label="定妆图路径" minWidth="200"><template #default="scope"><el-input v-model="scope.row.referencePath" /></template></el-table-column><el-table-column prop="version" label="版本" width="80" /></el-table>
            <el-button class="saveInline" @click="save">保存人物更改</el-button>
          </div>
          <div v-else-if="['scenesAssets', 'props', 'media'].includes(section)" class="contentPanel">
            <div class="panelHeading"><div><h2>{{ sectionLabel }}</h2><p>以稳定 ID 关联项目；文件路径使用 Toonflow 工作区相对路径</p></div><el-button type="primary" @click="addAsset(section === 'scenesAssets' ? 'scene' : section === 'props' ? 'prop' : 'image')">{{ section === 'scenesAssets' ? '新增场景资产' : section === 'props' ? '新增道具' : '登记图片' }}</el-button></div>
            <el-table :data="project.assets.filter(item => item.kind === (section === 'scenesAssets' ? 'scene' : section === 'props' ? 'prop' : 'image'))" rowKey="id"><el-table-column prop="name" label="名称" width="180"><template #default="scope"><el-input v-model="scope.row.name" /></template></el-table-column><el-table-column prop="description" label="描述" minWidth="260"><template #default="scope"><el-input v-model="scope.row.description" type="textarea" :rows="2" /></template></el-table-column><el-table-column prop="referencePath" :label="section === 'media' ? '图片路径' : '参考图片路径'" minWidth="240"><template #default="scope"><el-input v-model="scope.row.referencePath" /></template></el-table-column><el-table-column prop="version" label="版本" width="80" /></el-table>
            <el-button class="saveInline" @click="save">保存更改</el-button>
          </div>
          <div v-else-if="section === 'review'" class="contentPanel">
            <h2>版本与审核</h2><p>正式版引用不可变的 Markdown 版本文件；工作稿自动保存到单独文件。</p>
            <div v-if="currentEpisode" class="versionCompareControls"><el-select v-model="compareLeftId" aria-label="对比版本一"><el-option v-for="item in currentVersionRows" :key="item.id" :label="versionLabel(item)" :value="item.id" /></el-select><el-select v-model="compareRightId" aria-label="对比版本二"><el-option v-for="item in currentVersionRows" :key="item.id" :label="versionLabel(item)" :value="item.id" /></el-select><el-button :disabled="!compareLeftId || !compareRightId || compareLeftId === compareRightId" @click="compareVersions">对比所选版本</el-button></div>
            <el-table :data="scriptVersionRows" rowKey="id"><el-table-column prop="episodeLabel" label="分集" minWidth="180" /><el-table-column prop="version" label="版本" width="90"><template #default="scope">V{{ String(scope.row.version).padStart(3, "0") }}</template></el-table-column><el-table-column prop="createdAt" label="保存时间" width="190"><template #default="scope">{{ formatDate(scope.row.createdAt) }}</template></el-table-column><el-table-column prop="status" label="审核状态" width="130" /><el-table-column label="正式版" width="90"><template #default="scope">{{ isFormalVersion(scope.row.episodeId, scope.row.id) ? "正式版" : "—" }}</template></el-table-column><el-table-column label="操作" width="310" fixed="right"><template #default="scope"><el-button link @click="loadVersion(scope.row)">读取</el-button><el-button link @click="restoreVersion(scope.row)">恢复为新版本</el-button><el-button link :disabled="scope.row.status === '已确认' || scope.row.status === '已归档'" @click="setVersionReview(scope.row, '待审核')">提交审核</el-button><el-button link type="primary" :disabled="scope.row.status !== '待审核' && scope.row.status !== '已确认'" @click="confirmFormalVersion(scope.row)">确认正式</el-button></template></el-table-column></el-table>
          </div>
        </section>
      </div>
    </template>
    <el-dialog v-model="compareVisible" title="剧本版本对比" width="min(1200px, 92vw)" destroyOnClose>
      <div class="compareColumns"><section><h3>{{ compareLeftLabel }}</h3><pre>{{ compareLeftText }}</pre></section><section><h3>{{ compareRightLabel }}</h3><pre>{{ compareRightText }}</pre></section></div>
    </el-dialog>
    <el-dialog v-model="shotDetailVisible" title="镜头详情" width="min(900px, 92vw)" destroyOnClose>
      <el-form v-if="shotDraft" labelPosition="top" class="shotDetailForm"><el-form-item label="镜头编号"><el-input v-model="shotDraft.number" disabled /></el-form-item><el-form-item label="所属场景"><el-select v-model="shotDraft.sceneId"><el-option v-for="scene in currentEpisode?.scenes.filter(item => !item.archived)" :key="scene.id" :label="scene.heading || `场景 ${scene.number}`" :value="scene.id" /></el-select></el-form-item><el-form-item label="景别"><el-input v-model="shotDraft.size" /></el-form-item><el-form-item label="机位"><el-input v-model="shotDraft.angle" /></el-form-item><el-form-item label="构图"><el-input v-model="shotDraft.composition" /></el-form-item><el-form-item label="画面描述"><el-input v-model="shotDraft.description" type="textarea" :rows="3" /></el-form-item><el-form-item label="人物动作"><el-input v-model="shotDraft.action" type="textarea" :rows="2" /></el-form-item><el-form-item label="人物表情"><el-input v-model="shotDraft.expression" /></el-form-item><el-form-item label="台词"><el-input v-model="shotDraft.dialogue" type="textarea" :rows="2" /></el-form-item><el-form-item label="时长（秒）"><el-input-number v-model="shotDraft.duration" :min="1" :max="600" /></el-form-item><el-form-item label="运镜"><el-input v-model="shotDraft.movement" /></el-form-item><el-form-item label="音效 / 声音设计"><el-input v-model="shotDraft.sound" type="textarea" :rows="2" /></el-form-item><el-form-item label="图片提示词"><el-input v-model="shotDraft.imagePrompt" type="textarea" :rows="3" /></el-form-item><el-form-item label="视频提示词"><el-input v-model="shotDraft.videoPrompt" type="textarea" :rows="3" /></el-form-item><el-form-item label="参考图路径"><el-input v-model="shotDraft.referencePath" /></el-form-item><el-form-item label="制作状态"><el-select v-model="shotDraft.productionStatus"><el-option v-for="item in productionStatuses" :key="item" :label="item" :value="item" /></el-select></el-form-item><el-form-item label="审核状态"><el-select v-model="shotDraft.reviewStatus"><el-option v-for="item in reviewStatuses" :key="item" :label="item" :value="item" /></el-select></el-form-item></el-form>
      <template #footer><el-button @click="shotDetailVisible = false">取消</el-button><el-button type="primary" :loading="busy" @click="saveShotDetail">保存镜头</el-button></template>
    </el-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import localCodexConversation from "@/components/agent/localCodexConversation.vue";
import { createDramaProject, createSeason, listDramaProjects, readEpisodeScript, saveDramaProject, saveEpisodeDraft, saveEpisodeScriptVersion, updateScriptReview, type DramaAsset, type DramaCharacter, type DramaEpisode, type DramaProject, type DramaProductionStatus, type DramaScene, type DramaShot, type DramaStatus, type DramaScriptVersion } from "@/lib/dramaWorkspace";

const router = useRouter();
const emit = defineEmits<{ returnWorkspace: [] }>();
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
const currentEpisodeId = ref("");
const seasonId = ref("");
const scriptText = ref("");
const scriptDirty = ref(false);
const viewMode = ref<"table" | "cards">("table");
const codexModel = ref(JSON.stringify(["localCodex", "codex"]));
const codexConversation = ref<InstanceType<typeof localCodexConversation>>();
const pendingCodexTask = ref<"scenes" | "shots" | "">("");
const autosaveStatus = ref("等待编辑");
const activeScriptEpisodeId = ref("");
const loadingScript = ref(false);
const showArchivedScenes = ref(false);
const shotSceneFilter = ref("all");
const selectedShots = ref<DramaShot[]>([]);
const batchProductionStatus = ref<DramaProductionStatus>("制作中");
const batchReviewStatus = ref<DramaStatus>("待审核");
const shotDraft = ref<DramaShot | null>(null);
const shotDetailVisible = ref(false);
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
  { id: "overview", label: "项目概览" }, { id: "episodes", label: "分集管理" }, { id: "script", label: "剧本编辑" },
  { id: "scenes", label: "场景管理" }, { id: "storyboard", label: "分镜管理" }, { id: "characters", label: "人物资产" },
  { id: "scenesAssets", label: "场景资产" }, { id: "props", label: "道具资产" }, { id: "media", label: "图片素材" }, { id: "review", label: "版本与审核" },
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
const sectionLabel = computed(() => sections.find(item => item.id === section.value)?.label ?? "管理");
const scriptVersionRows = computed(() => Object.entries(project.value?.scriptVersions ?? {}).flatMap(([episodeId, versions]) => {
  const episode = project.value?.episodes.find(item => item.id === episodeId);
  const episodeLabel = episode ? `EP${String(episode.number).padStart(3, "0")} · ${episode.title}` : `未知分集 · ${episodeId}`;
  return versions.map(version => ({ ...version, episodeId, episodeLabel }));
}).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
const dayParts = ["清晨", "白天", "黄昏", "夜晚"] as const;
const productionStatuses: DramaProductionStatus[] = ["待制作", "制作中", "已完成"];
const reviewStatuses: DramaStatus[] = ["草稿", "待审核", "已确认", "已归档"];

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
onScopeDispose(() => clearTimeout(autosaveTimer));

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
function openShotDetail(shot: DramaShot) { shotDraft.value = { ...shot }; shotDetailVisible.value = true; }
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
.projectSummary { display: flex; align-items: center; gap: 18px; min-height: 48px; padding: 0 28px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-bg-color); color: var(--el-text-color-secondary); font-size: 13px; strong { color: var(--el-text-color-primary); font-size: 15px; } }
.dramaLayout { display: grid; grid-template-columns: 240px minmax(0, 1fr); flex: 1; min-height: 0; }
.dramaNav { display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 16px 12px; overflow: auto; border-inline-end: 1px solid var(--el-border-color-lighter); background: var(--el-bg-color); button { border: 0; border-radius: 5px; padding: 9px 12px; color: var(--el-text-color-regular); background: transparent; text-align: left; cursor: pointer; &:hover { background: var(--el-fill-color-light); } &.active { color: var(--el-color-primary); background: var(--el-color-primary-light-9); } } .episodeNav { padding-inline-start: 22px; font-size: 12px; } .addSeason { margin-top: 10px; } }
.dramaContent { min-width: 0; overflow: auto; padding: 24px; }
.contentPanel { min-width: 760px; padding: 22px; border: 1px solid var(--el-border-color-lighter); border-radius: 7px; background: var(--el-bg-color); h2 { margin: 0; font-size: 18px; } > p { color: var(--el-text-color-secondary); } }
.panelHeading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; p { margin: 5px 0 0; color: var(--el-text-color-secondary); font-size: 13px; } > div:last-child { display: flex; gap: 8px; } }
.overviewGrid { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 10px; margin: 20px 0; > div { display: grid; gap: 6px; padding: 14px; border: 1px solid var(--el-border-color-lighter); border-radius: 5px; span { color: var(--el-text-color-secondary); font-size: 12px; } strong { font-size: 18px; font-weight: 600; } } }
.shotCards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; article { display: grid; gap: 10px; padding: 15px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; cursor: pointer; strong { color: var(--el-color-primary); } small { color: var(--el-text-color-secondary); } } }
.saveInline { margin-top: 14px; }
.scriptLayout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 0.55fr); gap: 16px; align-items: stretch; }
.scriptEditor { min-width: 0; > p { margin: 8px 0; color: var(--el-text-color-secondary); font-size: 12px; } }
.scriptVersionSummary { display: flex; flex-wrap: wrap; gap: 16px; color: var(--el-text-color-secondary); font-size: 12px; }
.batchBar, .versionCompareControls { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.compareColumns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; max-height: 70vh; overflow: auto; section { min-width: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 5px; padding: 12px; } h3 { margin: 0 0 10px; font-size: 14px; } pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.6; } }
.shotDetailForm { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; .el-form-item:has(textarea) { grid-column: 1 / -1; } }
.codexDraft { display: flex; flex-direction: column; min-height: 520px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; overflow: hidden; }
.codexHeading { display: flex; flex-direction: column; gap: 5px; padding: 12px 14px; border-bottom: 1px solid var(--el-border-color-lighter); span { color: var(--el-text-color-secondary); font-size: 12px; } }
.codexDraft :deep(.localCodexConversation) { flex: 1; }
@media (max-width: 1050px) { .scriptLayout { grid-template-columns: minmax(0, 1fr); } .codexDraft { min-height: 360px; } }
@media (max-width: 800px) { .dramaLayout { grid-template-columns: 180px minmax(0, 1fr); } .dramaContent { padding: 12px; } .projectSummary { flex-wrap: wrap; padding-block: 10px; } }
@media (max-width: 700px) { .compareColumns, .shotDetailForm { grid-template-columns: minmax(0, 1fr); } .panelHeading { align-items: flex-start; flex-direction: column; } }
</style>
