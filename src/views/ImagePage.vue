<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, shallowRef } from 'vue'
import { convertImage, formatImageBytes, imageDownloadName, loadImage, MAX_IMAGE_BYTES, MAX_IMAGE_EDGE, MAX_IMAGE_PIXELS } from '../utils/image'
import type { ConvertedImage, ImageFormat, ImageOptions, LoadedImage } from '../utils/image'

type Source = LoadedImage & { name: string; url: string; file: File }
type Output = ConvertedImage & { name: string; url: string; source: Source; settings: string }
const source = shallowRef<Source | null>(null)
const output = shallowRef<Output | null>(null)
const format = ref<ImageFormat>('webp')
const quality = ref(85)
const background = ref('#FFFFFF')
const resizeMode = ref<'dimensions' | 'percentage'>('dimensions')
const width = ref('')
const height = ref('')
const percentage = ref('100')
const lockAspect = ref(true)
const fileInput = ref<HTMLInputElement | null>(null)
const loading = ref(false)
const converting = ref(false)
const dragging = ref(false)
const error = ref('')
let loadId = 0
let convertId = 0
let loadController: AbortController | undefined
let convertController: AbortController | undefined

const formatNames = { png: 'PNG', jpeg: 'JPEG', webp: 'WebP' }
const settingsKey = computed(() => JSON.stringify({ format: format.value, quality: format.value === 'png' ? null : quality.value, background: format.value === 'jpeg' ? background.value : null, width: width.value, height: height.value, resizeMode: resizeMode.value, percentage: resizeMode.value === 'percentage' ? percentage.value : null }))
const stale = computed(() => !!output.value && (output.value.source !== source.value || output.value.settings !== settingsKey.value))
const canDownload = computed(() => !!output.value && !stale.value && !loading.value && !converting.value)
const sizeChange = computed(() => {
  if (!output.value || !source.value) return ''
  const amount = (1 - output.value.blob.size / source.value.size) * 100
  return amount >= 0 ? `体积减少 ${amount.toFixed(1)}%` : `体积增加 ${Math.abs(amount).toFixed(1)}%`
})
const targetPreview = computed(() => {
  if (!source.value) return '—'
  if (resizeMode.value === 'percentage') {
    const value = Number(percentage.value)
    if (!Number.isFinite(value) || value <= 0) return '请输入有效比例'
    return `${Math.max(1, Math.round(source.value.width * value / 100))} × ${Math.max(1, Math.round(source.value.height * value / 100))} px`
  }
  return `${width.value || '—'} × ${height.value || '—'} px`
})

function releaseOutput() {
  if (output.value) URL.revokeObjectURL(output.value.url)
  output.value = null
}
function releaseSource() {
  if (source.value) {
    source.value.bitmap.close()
    URL.revokeObjectURL(source.value.url)
  }
  source.value = null
}
function cancelWork() {
  loadId++
  convertId++
  loadController?.abort()
  convertController?.abort()
  loading.value = false
  converting.value = false
}
function clear() {
  cancelWork()
  releaseOutput()
  releaseSource()
  width.value = ''
  height.value = ''
  error.value = ''
  dragging.value = false
  if (fileInput.value) fileInput.value.value = ''
}
async function importFile(file: File) {
  cancelWork()
  const id = loadId
  const controller = new AbortController()
  loadController = controller
  loading.value = true
  error.value = ''
  releaseOutput()
  releaseSource()
  try {
    const image = await loadImage(file, controller.signal)
    if (id !== loadId) { image.bitmap.close(); return }
    source.value = { ...image, name: file.name || 'clipboard.png', file, url: URL.createObjectURL(file) }
    width.value = String(image.width)
    height.value = String(image.height)
    percentage.value = '100'
    resizeMode.value = 'dimensions'
    lockAspect.value = true
  } catch (failure) {
    if (id !== loadId || (failure instanceof Error && failure.name === 'AbortError')) return
    error.value = failure instanceof Error ? failure.message : String(failure)
  } finally { if (id === loadId) loading.value = false }
}
function choose(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void importFile(file)
}
function drop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) void importFile(file)
}
function paste(event: ClipboardEvent) {
  const file = Array.from(event.clipboardData?.items ?? []).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
  if (!file) return
  event.preventDefault()
  void importFile(file)
}
onActivated(() => document.addEventListener('paste', paste))
onDeactivated(() => { document.removeEventListener('paste', paste); dragging.value = false })
onBeforeUnmount(() => { document.removeEventListener('paste', paste); clear() })

function updateWidth() {
  error.value = ''
  if (lockAspect.value && source.value && /^\d+$/.test(width.value) && Number(width.value) > 0 && Number(width.value) <= MAX_IMAGE_EDGE) {
    height.value = String(Math.max(1, Math.round(Number(width.value) * source.value.height / source.value.width)))
  }
}
function updateHeight() {
  error.value = ''
  if (lockAspect.value && source.value && /^\d+$/.test(height.value) && Number(height.value) > 0 && Number(height.value) <= MAX_IMAGE_EDGE) {
    width.value = String(Math.max(1, Math.round(Number(height.value) * source.value.width / source.value.height)))
  }
}
function toggleLock() { if (lockAspect.value) updateWidth() }
function resetSize() {
  if (!source.value) return
  width.value = String(source.value.width)
  height.value = String(source.value.height)
  percentage.value = '100'
  error.value = ''
}
function options(): ImageOptions {
  if (!source.value) throw new Error('请先导入图片')
  let targetWidth: number
  let targetHeight: number
  if (resizeMode.value === 'percentage') {
    if (!/^\d+(?:\.\d{1,2})?$/.test(percentage.value.trim())) throw new Error('缩放比例应为大于 0 的数字，最多保留两位小数')
    const ratio = Number(percentage.value) / 100
    if (!(ratio > 0 && ratio <= 10)) throw new Error('缩放比例范围为大于 0 到 1000%')
    targetWidth = Math.max(1, Math.round(source.value.width * ratio))
    targetHeight = Math.max(1, Math.round(source.value.height * ratio))
  } else {
    if (!/^\d+$/.test(width.value.trim()) || !/^\d+$/.test(height.value.trim())) throw new Error('宽度和高度必须是正整数')
    targetWidth = Number(width.value)
    targetHeight = Number(height.value)
  }
  return { format: format.value, width: targetWidth, height: targetHeight, quality: quality.value, background: background.value }
}
async function process() {
  if (!source.value || loading.value) return
  const id = ++convertId
  convertController?.abort()
  const controller = new AbortController()
  convertController = controller
  const image = source.value
  const key = settingsKey.value
  converting.value = true
  error.value = ''
  try {
    const value = await convertImage(image, options(), controller.signal)
    if (id !== convertId || source.value !== image) return
    releaseOutput()
    output.value = { ...value, source: image, settings: key, name: imageDownloadName(image.name, value.format, value.width, value.height), url: URL.createObjectURL(value.blob) }
  } catch (failure) {
    if (id !== convertId || (failure instanceof Error && failure.name === 'AbortError')) return
    releaseOutput()
    error.value = failure instanceof Error ? failure.message : String(failure)
  } finally { if (id === convertId) converting.value = false }
}
function download() {
  if (!output.value || !canDownload.value) return
  const anchor = document.createElement('a')
  anchor.href = output.value.url
  anchor.download = output.value.name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
</script>

<template>
  <main class="encoding-page image-page">
    <header class="encoding-header"><div><h1>图片工具</h1><p>本地格式转换、压缩与尺寸调整 · 透明图片预览</p></div><span class="encoding-local"><i></i>本地处理 · 不上传图片</span></header>
    <section class="image-import" :class="{ dragging }" aria-label="图片导入区域" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="drop">
      <div><h2>{{ loading ? '正在读取图片…' : source ? source.name : '拖入图片，或按 Ctrl+V 粘贴截图' }}</h2><p v-if="source">{{ source.width }} × {{ source.height }} px <span>·</span> {{ formatImageBytes(source.size) }} <span>·</span> {{ source.mime }} <span>·</span> {{ source.hasTransparency ? '包含透明像素' : '无透明像素' }}</p><p v-else>支持 PNG、JPEG、WebP、BMP、GIF 首帧 · 最大 {{ MAX_IMAGE_BYTES / 1024 / 1024 }} MiB</p></div>
      <div class="image-import-actions"><input ref="fileInput" type="file" class="image-file-input" accept="image/png,image/jpeg,image/webp,image/bmp,image/x-ms-bmp,image/gif" aria-label="导入处理图片" @change="choose" /><button type="button" class="utility-button primary" @click="fileInput?.click()">{{ source ? '更换图片' : '选择图片' }}</button><button type="button" class="utility-button" :disabled="!source && !loading" @click="clear">清空图片</button></div>
    </section>
    <div class="image-workspace">
      <form class="image-settings" novalidate @submit.prevent="process">
        <h2>导出设置</h2>
        <label class="image-setting-field">输出格式<select v-model="format" aria-label="图片输出格式"><option value="png">PNG · 无损，支持透明</option><option value="jpeg">JPEG · 有损，不支持透明</option><option value="webp">WebP · 有损，支持透明</option></select></label>
        <label class="image-setting-field">压缩质量 <span class="image-quality-number">{{ quality }}%</span><input v-model.number="quality" type="range" min="1" max="100" step="1" aria-label="图片压缩质量" :disabled="format === 'png'" /></label>
        <p class="image-setting-hint">{{ format === 'png' ? 'PNG 为无损导出，不使用质量参数。' : '质量越低，文件通常越小；实际大小取决于图片内容。' }}</p>
        <label v-if="format === 'jpeg'" class="image-setting-field">JPEG 背景色 <div class="image-background-inputs"><input v-model="background" type="color" aria-label="JPEG 背景取色" /><input v-model="background" type="text" aria-label="JPEG 背景颜色" spellcheck="false" placeholder="#FFFFFF" /></div></label>
        <p v-if="format === 'jpeg'" class="image-setting-hint">透明区域会合成到所选背景色，默认白色。</p>
        <div class="image-resize-heading"><h3>调整尺寸</h3><button type="button" class="text-button" :disabled="!source" @click="resetSize">恢复原尺寸</button></div>
        <label class="image-setting-field">缩放方式<select v-model="resizeMode" aria-label="图片缩放方式"><option value="dimensions">指定宽高</option><option value="percentage">百分比缩放</option></select></label>
        <template v-if="resizeMode === 'dimensions'"><div class="image-dimension-fields"><label class="image-setting-field">宽度<input v-model="width" type="text" inputmode="numeric" aria-label="图片目标宽度" placeholder="宽度 px" @input="updateWidth" /></label><span>×</span><label class="image-setting-field">高度<input v-model="height" type="text" inputmode="numeric" aria-label="图片目标高度" placeholder="高度 px" @input="updateHeight" /></label></div><label class="image-lock-ratio"><input v-model="lockAspect" type="checkbox" aria-label="锁定图片比例" @change="toggleLock" />锁定原始比例</label></template>
        <label v-else class="image-setting-field">缩放比例（%）<input v-model="percentage" type="text" inputmode="decimal" aria-label="图片缩放百分比" placeholder="例如 50" @input="error = ''" /></label>
        <p class="image-setting-hint">目标：{{ targetPreview }}<br />单边最多 {{ MAX_IMAGE_EDGE }} px，总像素最多 {{ MAX_IMAGE_PIXELS / 10000 }} 万。</p>
        <button type="submit" class="utility-button primary image-process-button" :disabled="!source || loading || converting">{{ converting ? '正在处理…' : '处理并预览' }}</button>
      </form>
      <section class="image-preview-area" aria-label="图片处理预览">
        <div class="image-preview-grid">
          <section class="image-preview-card"><div class="image-card-heading"><h2>原始图片</h2><span v-if="source">{{ source.width }} × {{ source.height }}</span></div><div class="image-checkerboard"><img v-if="source" :src="source.url" alt="原始处理图片" /><div v-else class="image-empty"><span aria-hidden="true">⊞</span><p>导入图片后显示原图</p></div></div><div class="image-preview-info"><template v-if="source"><span>{{ formatImageBytes(source.size) }}</span><span>{{ source.hasTransparency ? '包含透明像素' : '无透明像素' }}</span></template><span v-else>支持拖拽、选图和粘贴</span></div></section>
          <section class="image-preview-card" :aria-busy="converting"><div class="image-card-heading"><h2>处理结果</h2><span v-if="output">{{ output.width }} × {{ output.height }}</span></div><div class="image-checkerboard"><img v-if="output" :src="output.url" alt="处理后的图片" /><div v-else class="image-empty"><span aria-hidden="true">▧</span><p>{{ converting ? '正在处理图片…' : '选择设置后点击处理' }}</p></div></div><div class="image-preview-info"><template v-if="output"><span>{{ formatNames[output.format] }} · {{ formatImageBytes(output.blob.size) }}</span><span>{{ output.hasTransparency ? '包含透明像素' : '无透明像素' }}</span></template><span v-else>PNG / JPEG / WebP</span></div></section>
        </div>
        <p v-if="error" class="image-error" role="alert">{{ error }}</p>
        <div class="image-result-bar"><div><p v-if="stale" class="image-stale" role="status">设置已修改，请重新处理后再下载。</p><p v-else-if="output" class="image-success" role="status">处理完成 · {{ sizeChange }}</p><p v-else class="image-setting-hint">棋盘格表示透明区域。原文件不会被覆盖。</p><span v-if="output" class="image-output-name">{{ output.name }}</span></div><button type="button" class="utility-button primary" :disabled="!canDownload" @click="download">下载处理图片</button></div>
        <p class="image-footnote">单张图片本地处理；动画图片只处理首帧。导出会重新编码像素，不保留 EXIF 等元数据；转换后的文件可能比原图更大。</p>
      </section>
    </div>
    <footer class="encoding-page-footer">KIKYO TOOLS <span>格式转换 · 压缩缩放 · PNG / WebP 保留透明度</span></footer>
  </main>
</template>
