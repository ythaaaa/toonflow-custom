<template>
  <aside class="studioNav" aria-label="剧本文档目录">
    <div class="projectPicker">
      <span class="pickerLabel">短剧项目</span>
      <el-select :modelValue="projectId" aria-label="切换短剧项目" @update:modelValue="emit('project', $event)">
        <el-option v-for="item in projects" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-button class="projectListButton" text @click="emit('projectList')">所有项目</el-button>
    </div>

    <nav class="documentTree">
      <div class="treeGroup">
        <button class="treeGroupTitle" type="button" :aria-expanded="expandedGroups.has('project')" @click="toggleGroup('project')">
          <icon-chevron-down v-if="expandedGroups.has('project')" :size="15" />
          <icon-chevron-right v-else :size="15" />
          <strong>全剧设定</strong>
        </button>
        <div v-if="expandedGroups.has('project')" class="treeChildren">
          <button v-for="item in projectDocuments" :key="item.id" type="button" class="treeItem" :class="{ selected: selectedDocumentId === item.id }" :aria-current="selectedDocumentId === item.id ? 'page' : undefined" @click="emit('select', item.id)">{{ item.label }}</button>
        </div>
      </div>

      <div class="treeGroup">
        <button class="treeGroupTitle" type="button" :aria-expanded="expandedGroups.has('seasons')" @click="toggleGroup('seasons')">
          <icon-chevron-down v-if="expandedGroups.has('seasons')" :size="15" />
          <icon-chevron-right v-else :size="15" />
          <strong>剧集管理</strong>
        </button>
        <div v-if="expandedGroups.has('seasons')" class="treeChildren seasonChildren">
          <section v-for="season in seasons" :key="season.id" class="seasonGroup">
            <button class="treeGroupTitle seasonTitle" type="button" :aria-expanded="expandedGroups.has(season.id)" @click="toggleGroup(season.id)">
              <icon-chevron-down v-if="expandedGroups.has(season.id)" :size="15" />
              <icon-chevron-right v-else :size="15" />
              <span>{{ season.name }}</span>
            </button>
            <div v-if="expandedGroups.has(season.id)" class="treeChildren episodeChildren">
              <button type="button" class="treeItem" :class="{ selected: selectedDocumentId === `season:${season.id}:outline` }" :aria-current="selectedDocumentId === `season:${season.id}:outline` ? 'page' : undefined" @click="emit('select', `season:${season.id}:outline`)">分季大纲</button>
              <button type="button" class="treeItem" :class="{ selected: selectedDocumentId === `season:${season.id}:episodes` }" :aria-current="selectedDocumentId === `season:${season.id}:episodes` ? 'page' : undefined" @click="emit('select', `season:${season.id}:episodes`)">分集大纲</button>
              <section v-for="episode in episodesFor(season)" :key="episode.id" class="episodeGroup">
                <button class="episodeTitle" type="button" :aria-expanded="expandedGroups.has(episode.id)" @click="toggleGroup(episode.id)">
                  <icon-chevron-down v-if="expandedGroups.has(episode.id)" :size="14" />
                  <icon-chevron-right v-else :size="14" />
                  <span class="episodeNumber">EP{{ String(episode.number).padStart(3, '0') }}</span>
                  <span class="episodeName">{{ episode.title }}</span>
                </button>
                <div v-if="expandedGroups.has(episode.id)" class="treeChildren episodeDocuments">
                  <button v-for="item in episodeDocuments(episode.id)" :key="item.id" type="button" class="treeItem" :class="{ selected: selectedDocumentId === item.id }" :aria-current="selectedDocumentId === item.id ? 'page' : undefined" @click="item.id.endsWith(':canvas') ? emit('canvas', episode.id) : emit('select', item.id)">{{ item.label }}</button>
                </div>
              </section>
              <button class="treeItem addItem" type="button" @click="emit('addEpisode', season.id)">＋ 新增分集</button>
            </div>
          </section>
          <el-empty v-if="!seasons.length" description="还没有季度" :imageSize="48" />
          <button class="treeItem addSeason" type="button" @click="emit('addSeason')">＋ 新增季度</button>
        </div>
      </div>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-vue";
import type { DramaEpisode, DramaProject, DramaSeason } from "@toonflow/drama-workspace";

const props = defineProps<{
  projectId: string;
  projects: Pick<DramaProject, "id" | "name">[];
  seasons: DramaSeason[];
  episodes: DramaEpisode[];
  selectedDocumentId: string;
}>();
const emit = defineEmits<{
  project: [projectId: string];
  projectList: [];
  select: [documentId: string];
  canvas: [episodeId: string];
  addSeason: [];
  addEpisode: [seasonId: string];
}>();

const expandedGroups = ref(new Set(["project", "seasons"]));
watch(() => [props.seasons.map(item => item.id).join("|"), props.episodes.map(item => item.id).join("|"), props.selectedDocumentId], () => {
  const next = new Set(["project", "seasons"]);
  const episodeId = props.selectedDocumentId.match(/^episode:([^:]+):/)?.[1];
  const episode = episodeId ? props.episodes.find(item => item.id === episodeId) : undefined;
  const seasonId = episode?.seasonId ?? props.selectedDocumentId.match(/^season:([^:]+):/)?.[1];
  if (seasonId) next.add(seasonId);
  if (episode) next.add(episode.id);
  expandedGroups.value = next;
}, { immediate: true });
const projectDocuments = [
  { id: "overview", label: "项目概览" },
  { id: "storyOutline", label: "故事大纲" },
  { id: "world", label: "世界观" },
  { id: "characters", label: "人物设定" },
  { id: "characterRelations", label: "人物关系" },
  { id: "scenes", label: "场景设定" },
  { id: "props", label: "道具设定" },
  { id: "visualStyle", label: "视觉风格" },
];

function toggleGroup(id: string) {
  const next = new Set(expandedGroups.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedGroups.value = next;
}
function episodesFor(season: DramaSeason) {
  return season.episodes.map(id => props.episodes.find(item => item.id === id)).filter((item): item is DramaEpisode => !!item);
}
function episodeDocuments(episodeId: string) {
  return [
    { id: `episode:${episodeId}:script`, label: "剧本正文" },
    { id: `episode:${episodeId}:storyboard`, label: "分镜脚本" },
    { id: `episode:${episodeId}:imagePrompts`, label: "生图提示词" },
    { id: `episode:${episodeId}:videoPrompts`, label: "视频提示词" },
    { id: `episode:${episodeId}:canvas`, label: "创作画布" },
  ];
}
</script>

<style lang="scss" scoped>
.studioNav { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; border-inline-end: 1px solid var(--el-border-color-lighter); background: var(--el-bg-color); }
.projectPicker { display: grid; gap: 8px; padding: 18px 14px 14px; border-bottom: 1px solid var(--el-border-color-lighter); font-size: 14px; }
.pickerLabel { color: var(--el-text-color-secondary); font-size: 14px; }
.projectListButton { justify-self: start; min-height: 28px; padding-inline: 0; }
.documentTree { flex: 1; min-height: 0; overflow: auto; padding: 10px 8px 18px; }
.treeGroup { margin-bottom: 6px; }
.treeGroupTitle, .episodeTitle, .treeItem { display: flex; align-items: center; width: 100%; min-height: 34px; gap: 7px; border: 0; border-radius: 6px; padding: 6px 9px; color: var(--el-text-color-regular); background: transparent; font: inherit; text-align: left; cursor: pointer; &:hover { background: var(--el-fill-color-light); } }
.treeGroupTitle { color: var(--el-text-color-primary); font-size: 14px; strong { font-size: 14px; font-weight: 600; } svg { flex: 0 0 auto; color: var(--el-text-color-secondary); } }
.treeChildren { display: grid; gap: 1px; margin-inline-start: 14px; padding-inline-start: 8px; border-inline-start: 1px solid var(--el-border-color-lighter); }
.treeItem { min-height: 31px; padding-inline: 10px; font-size: 14px; &.selected { color: var(--el-color-primary); background: var(--el-color-primary-light-9); font-weight: 600; } }
.seasonChildren { gap: 4px; }
.seasonTitle { min-height: 31px; font-weight: 500; }
.episodeChildren { margin-inline-start: 12px; }
.episodeGroup { min-width: 0; }
.episodeTitle { min-height: 31px; padding-inline: 7px; font-size: 14px; svg { flex: 0 0 auto; color: var(--el-text-color-secondary); } }
.episodeNumber { flex: 0 0 auto; color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; }
.episodeName { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.episodeDocuments { margin-inline-start: 13px; }
.episodeDocuments .treeItem { min-height: 29px; font-size: 14px; }
.addItem, .addSeason { color: var(--el-color-primary); }
.addSeason { margin-top: 4px; }
@media (max-width: 800px) { .projectPicker { padding: 12px 10px; } }
</style>
