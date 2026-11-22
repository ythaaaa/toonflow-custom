<template>
  <el-dropdown ref="dropdown" trigger="click" virtualTriggering :virtualRef="trigger" :disabled="disabled || busy || !src" @command="selectAction">
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item disabled>会员生图接口暂不支持全景输出</el-dropdown-item>
        <el-dropdown-item command="previewSphere" divided>预览720°全景图</el-dropdown-item>
        <el-dropdown-item command="previewCylinder">预览360°环绕图</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
  <el-dialog
    v-model="visible"
    class="panoramaDialog"
    :title="`预览${mode === 'sphere' ? '720°全景图' : '360°环绕图'}`"
    width="80%"
    alignCenter
    appendToBody
    destroyOnClose
    :closeOnClickModal="false"
    :closeOnPressEscape="!busy"
    :showClose="!busy"
    :beforeClose="close"
    :style="{ maxWidth: 'calc(100vw - 32px)' }">
    <template #header>
      <div class="panoramaHeader">
        <icon-panorama-horizontal :size="20" />
        <strong>{{ mode === 'sphere' ? '720°全景图' : '360°环绕图' }}</strong>
        <span>本地投影预览与校正</span>
      </div>
    </template>
    <p class="panoramaNotice">当前仅将原图投影到球面或圆柱进行本地观察。截图是单个方向视图，不是全景图文件或 AI 全景重建结果。</p>
    <div class="panoramaPanel nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @wheel.stop @keydown.stop>
      <imagePanoramaPreview v-if="visible" ref="previewStage" :src="src" :mode="mode" :disabled="disabled || saving" @capture="saveCapture" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu } from "element-plus";
import { IconPanoramaHorizontal } from "@tabler/icons-vue";
import type { PanoramaMode } from "../imagePanorama";
import { usePanoramaCapture } from "../usePanoramaCapture";
import imagePanoramaPreview from "./imagePanoramaPreview.vue";

const props = defineProps<{ src: string; disabled?: boolean }>();
const emit = defineEmits<{ open: [] }>();
const dropdown = ref<InstanceType<typeof ElDropdown>>();
const trigger = ref<HTMLElement>();
const visible = ref(false);
const mode = ref<PanoramaMode>("sphere");
const previewStage = ref<InstanceType<typeof imagePanoramaPreview>>();
const { saving, saveCapture } = usePanoramaCapture(() => props.src);
const busy = computed(() => saving.value || !!previewStage.value?.capturing);

defineExpose({ open, busy, visible });

watch(() => props.src, () => { visible.value = false; }, { flush: "sync" });

async function open(event: MouseEvent) {
  if (props.disabled || busy.value || !props.src) return;
  trigger.value = event.currentTarget as HTMLElement;
  await nextTick();
  dropdown.value?.handleOpen();
}

async function selectAction(command: string) {
  if (props.disabled || busy.value || !props.src) return;
  emit("open");
  mode.value = command.endsWith("Sphere") ? "sphere" : "cylinder";
  visible.value = true;
}

function close(done: () => void) {
  if (!busy.value) done();
}
</script>

<style scoped lang="scss">
:global(.panoramaDialog .el-dialog__header) { padding-bottom: 16px; }
.panoramaHeader {
  display: flex; align-items: center; gap: 8px; min-height: 24px; padding-right: 24px; color: var(--el-text-color-primary);
  strong { font-size: 15px; font-weight: 600; }
  span { margin-left: 4px; color: var(--el-text-color-secondary); font-size: 12px; }
}
.panoramaPanel { height: min(70vh, 760px); min-height: 0; }
.panoramaNotice { margin: 0 0 12px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
</style>
