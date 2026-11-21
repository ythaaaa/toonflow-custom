<template>
  <aside class="studioNav">
    <nav aria-label="短剧创作中心">
      <button v-for="item in items" :key="item.id" type="button" :class="{ active: section === item.section }" @click="emit('navigate', item.section)">{{ item.label }}</button>
      <div class="navSubActions" v-if="section === 'script'">
        <button type="button" :class="{ active: scriptView === 'editor' }" @click="emit('scriptView', 'editor')">剧本编辑</button>
        <button type="button" :class="{ active: scriptView === 'review' }" @click="emit('scriptView', 'review')">历史版本与审核</button>
      </div>
      <div class="navSubActions" v-if="section === 'assets'">
        <button v-for="item in assetItems" :key="item.id" type="button" :class="{ active: assetView === item.id }" @click="emit('assetView', item.id)">{{ item.label }}</button>
      </div>
    </nav>
    <div class="episodePicker">
      <label for="dramaSeasonPicker">当前季度</label>
      <el-select id="dramaSeasonPicker" :modelValue="seasonId" placeholder="选择季度" aria-label="选择季度" @update:modelValue="emit('season', $event)">
        <el-option v-for="season in seasons" :key="season.id" :label="season.name" :value="season.id" />
      </el-select>
      <div class="episodeHeading"><span>本季分集</span><span>{{ episodes.length }} 集</span></div>
      <button v-for="episode in episodes" :key="episode.id" type="button" class="episodeLink" :class="{ active: currentEpisodeId === episode.id }" @click="emit('episode', episode.id)">
        <b>EP{{ String(episode.number).padStart(3, '0') }}</b><span>{{ episode.title }}</span>
      </button>
      <el-empty v-if="!episodes.length" description="暂无分集" :imageSize="52" />
      <el-button class="addSeason" @click="emit('addSeason')">新增季度</el-button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { DramaEpisode, DramaSeason } from "@toonflow/drama-workspace";

defineProps<{
  items: { id: string; label: string; section: string }[];
  seasons: DramaSeason[];
  episodes: DramaEpisode[];
  section: string;
  scriptView: string;
  assetView: string;
  seasonId: string;
  currentEpisodeId: string;
}>();
const assetItems = [
  { id: "scenesAssets", label: "场景资产" },
  { id: "props", label: "道具资产" },
  { id: "media", label: "图片素材" },
];
const emit = defineEmits<{
  navigate: [section: string];
  scriptView: [view: string];
  assetView: [view: string];
  season: [seasonId: string];
  episode: [episodeId: string];
  addSeason: [];
}>();
</script>

<style lang="scss" scoped>
.studioNav { display: flex; flex-direction: column; min-height: 0; overflow: auto; border-inline-end: 1px solid var(--el-border-color-lighter); background: var(--el-bg-color); }
nav { display: flex; flex-direction: column; gap: 2px; padding: 12px 10px; }
button { min-height: 34px; border: 0; border-radius: 5px; padding: 7px 10px; color: var(--el-text-color-regular); background: transparent; text-align: left; cursor: pointer; &:hover { background: var(--el-fill-color-light); } &.active { color: var(--el-color-primary); background: var(--el-color-primary-light-9); font-weight: 600; } }
.navSubActions { display: grid; gap: 2px; padding: 2px 0 4px 12px; button { min-height: 30px; font-size: 12px; } }
.episodePicker { display: grid; align-content: start; gap: 7px; min-height: 0; padding: 12px 10px; border-top: 1px solid var(--el-border-color-lighter); label, .episodeHeading { color: var(--el-text-color-secondary); font-size: 12px; } }
.episodeHeading { display: flex; justify-content: space-between; margin-top: 5px; }
.episodeLink { display: flex; align-items: center; gap: 8px; min-height: 32px; overflow: hidden; font-size: 12px; b { flex: 0 0 auto; font-size: 11px; } span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
.addSeason { width: 100%; margin-top: 4px; }
@media (max-width: 1100px) { .studioNav { font-size: 12px; } nav { padding: 8px 6px; } }
</style>
