<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, shallowRef } from 'vue'
import { decodeQrFile, generateQr, MAX_QR_IMAGE_BYTES } from '../utils/qrcode'
import type { DecodedQr, GeneratedQr, QrLevel } from '../utils/qrcode'

type Mode = 'generate' | 'decode'
const mode = ref<Mode>('generate')
const content = ref('')
const size = ref(512)
const level = ref<QrLevel>('M')
const generation = shallowRef<(GeneratedQr & { content: string; size: number; level: QrLevel }) | null>(null)
const generationError = ref('')
const generating = ref(false)
const bytes = computed(() => new TextEncoder().encode(content.value).length)
const stale = computed(() => !!generation.value && (generation.value.content !== content.value || generation.value.size !== size.value || generation.value.level !== level.value))
const fileInput = ref<HTMLInputElement | null>(null)
const imageUrl = ref('')
const imageName = ref('')
const decoded = shallowRef<DecodedQr | null>(null)
const decodingError = ref('')
const decoding = ref(false)
const dragging = ref(false)
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
let generationId = 0
let decodeId = 0

function notify(message: string) {
  clearTimeout(noticeTimer)
  notice.value = message
  noticeTimer = setTimeout(() => { notice.value = '' }, 2200)
}
async function generate() {
  const id = ++generationId
  const source = content.value
  const width = size.value
  const correction = level.value
  generationError.value = ''
  generating.value = true
  try {
    const qr = await generateQr(source, width, correction)
    if (id !== generationId) return
    generation.value = { ...qr, content: source, size: width, level: correction }
  } catch (error) {
    if (id !== generationId) return
    generation.value = null
    generationError.value = (error as Error).message
  } finally { if (id === generationId) generating.value = false }
}
function clearGeneration() {
  generationId++
  generating.value = false
  content.value = ''
  generation.value = null
  generationError.value = ''
}
function releaseImage() {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
}
function clearDecode() {
  decodeId++
  releaseImage()
  imageName.value = ''
  decoded.value = null
  decodingError.value = ''
  decoding.value = false
  dragging.value = false
  if (fileInput.value) fileInput.value.value = ''
}
async function decodeFile(file: File) {
  const id = ++decodeId
  releaseImage()
  decoded.value = null
  decodingError.value = ''
  imageName.value = file.name
  decoding.value = true
  try {
    if (['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/x-ms-bmp', 'image/gif'].includes(file.type.toLowerCase()) && file.size <= MAX_QR_IMAGE_BYTES) imageUrl.value = URL.createObjectURL(file)
    const value = await decodeQrFile(file)
    if (id !== decodeId) return
    decoded.value = value
  } catch (error) {
    if (id === decodeId) decodingError.value = (error as Error).message
  } finally { if (id === decodeId) decoding.value = false }
}
function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void decodeFile(file)
}
function drop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) void decodeFile(file)
}
function paste(event: ClipboardEvent) {
  if (mode.value !== 'decode') return
  const image = Array.from(event.clipboardData?.items ?? []).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
  if (!image) return
  event.preventDefault()
  void decodeFile(image)
}
onActivated(() => document.addEventListener('paste', paste))
onDeactivated(() => document.removeEventListener('paste', paste))
onBeforeUnmount(() => {
  document.removeEventListener('paste', paste)
  clearTimeout(noticeTimer)
  releaseImage()
})
async function copy(value: string) {
  try { await navigator.clipboard.writeText(value); notify('已复制二维码内容') }
  catch { notify('复制失败，请选中内容后按 Ctrl+C') }
}
async function inspectGenerated() {
  if (!generation.value || stale.value) return
  const data = generation.value.png.split(',')[1]!
  const binary = atob(data)
  const file = new File([Uint8Array.from(binary, char => char.charCodeAt(0))], 'kikyo-qrcode.png', { type: 'image/png' })
  mode.value = 'decode'
  await decodeFile(file)
}
function useDecoded() {
  if (!decoded.value) return
  content.value = decoded.value.text
  mode.value = 'generate'
  generationError.value = ''
}
function download(format: 'png' | 'svg') {
  if (!generation.value || stale.value) return
  const qr = generation.value
  const objectUrl = format === 'svg' ? URL.createObjectURL(new Blob([qr.svg], { type: 'image/svg+xml;charset=utf-8' })) : null
  const anchor = document.createElement('a')
  anchor.href = objectUrl ?? qr.png
  anchor.download = `kikyo-qrcode-${qr.size}.${format}`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void generate() }
}
async function navigateMode(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  mode.value = event.key === 'Home' ? 'generate' : event.key === 'End' ? 'decode' : mode.value === 'generate' ? 'decode' : 'generate'
  await nextTick()
  document.getElementById(`qr-tab-${mode.value}`)?.focus()
}
</script>

<template>
  <main class="encoding-page qr-page">
    <header class="encoding-header"><div><h1>二维码</h1><p>文本或网址生成二维码 · 从图片解析原始内容</p></div><span class="encoding-local"><i></i>本地处理 · 不上传内容或图片</span></header>
    <nav class="qr-mode-tabs" role="tablist" aria-label="二维码工具模式" @keydown="navigateMode">
      <button id="qr-tab-generate" type="button" role="tab" :aria-selected="mode === 'generate'" aria-controls="qr-panel-generate" :tabindex="mode === 'generate' ? 0 : -1" :class="{ active: mode === 'generate' }" @click="mode = 'generate'">生成二维码</button>
      <button id="qr-tab-decode" type="button" role="tab" :aria-selected="mode === 'decode'" aria-controls="qr-panel-decode" :tabindex="mode === 'decode' ? 0 : -1" :class="{ active: mode === 'decode' }" @click="mode = 'decode'">解析二维码</button>
    </nav>
    <section v-show="mode === 'generate'" id="qr-panel-generate" class="qr-grid" role="tabpanel" aria-labelledby="qr-tab-generate">
      <section class="qr-card qr-input-card" aria-labelledby="qr-content-title">
        <div class="qr-card-heading"><h2 id="qr-content-title">文本 / 网址</h2><span>{{ content.length.toLocaleString() }} 字符 · {{ bytes.toLocaleString() }} UTF-8 字节</span></div>
        <p class="tool-explanation">输入要写入二维码的内容，支持中文、Emoji 和多行文本。网址建议包含 https://，内容会原样编码。</p>
        <textarea v-model="content" aria-label="二维码生成内容" placeholder="输入文本或网址，例如 https://github.com/KikyoShaw/TauriTools" spellcheck="false" @input="generationError = ''" @keydown="keydown"></textarea>
        <div class="qr-options"><label>图片尺寸<select v-model.number="size" aria-label="二维码图片尺寸"><option v-for="value in [256, 384, 512, 768, 1024]" :key="value" :value="value">{{ value }} × {{ value }} px</option></select></label><label>纠错等级<select v-model="level" aria-label="二维码纠错等级"><option value="L">L · 约 7%</option><option value="M">M · 约 15%（默认）</option><option value="Q">Q · 约 25%</option><option value="H">H · 约 30%</option></select></label></div>
        <p v-if="generationError" class="tool-error" role="alert">{{ generationError }}</p>
        <div class="qr-form-actions"><button type="button" class="utility-button primary" :disabled="generating" @click="generate">{{ generating ? '生成中…' : '生成二维码' }}</button><button type="button" class="utility-button" @click="content = 'https://github.com/KikyoShaw/TauriTools'; generationError = ''">填入网址示例</button><button type="button" class="utility-button subtle" @click="clearGeneration">清空内容</button></div>
        <p class="qr-footnote">Ctrl + Enter 生成 · 纠错等级越高，可容纳内容越少；保留二维码四周的白色边框。</p>
      </section>
      <section class="qr-card qr-preview-card" aria-labelledby="qr-preview-title" :aria-busy="generating">
        <div class="qr-card-heading"><h2 id="qr-preview-title">二维码预览</h2><span v-if="generation">{{ generation.size }} px · {{ generation.level }} 级纠错</span></div>
        <div class="qr-preview-stage"><img v-if="generation" :src="generation.png" alt="生成的二维码" class="qr-generated-image" /><div v-else class="qr-empty"><div class="qr-empty-symbol" aria-hidden="true">▦</div><span>生成的二维码将显示在这里</span><small>黑白高对比 · 标准白色边框</small></div></div>
        <p v-if="stale" class="qr-stale" role="status">内容或设置已修改，请重新生成后再下载。</p>
        <p v-else-if="generation" class="qr-success" role="status">生成成功 · {{ generation.byteLength.toLocaleString() }} 字节 · {{ generation.modules }} × {{ generation.modules }} 模块</p>
        <div class="qr-preview-actions"><button type="button" class="utility-button primary" :disabled="!generation || stale || generating" @click="download('png')">下载 PNG</button><button type="button" class="utility-button" :disabled="!generation || stale || generating" @click="download('svg')">下载 SVG</button><button type="button" class="utility-button" :disabled="!generation || stale || generating" @click="inspectGenerated">解析此二维码</button></div>
      </section>
    </section>
    <section v-show="mode === 'decode'" id="qr-panel-decode" class="qr-grid" role="tabpanel" aria-labelledby="qr-tab-decode">
      <section class="qr-card" aria-labelledby="qr-upload-title">
        <div class="qr-card-heading"><h2 id="qr-upload-title">二维码图片</h2><button type="button" class="text-button" @click="clearDecode">清空图片</button></div>
        <p class="tool-explanation">上传、拖入图片，或在本页按 Ctrl+V 粘贴截图。支持 PNG、JPEG、WebP、BMP 和 GIF 首帧。</p>
        <input ref="fileInput" class="qr-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/gif" aria-label="选择二维码图片" @change="chooseFile" />
        <div class="qr-drop-zone" :class="{ dragging }" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="drop">
          <img v-if="imageUrl" :src="imageUrl" alt="待解析的二维码图片" class="qr-uploaded-image" />
          <div v-else class="qr-empty"><div class="qr-empty-symbol" aria-hidden="true">⊞</div><span>拖入二维码图片，或粘贴截图</span><small>图片不超过 20 MiB</small></div>
          <button type="button" class="utility-button" @click="fileInput?.click()">{{ imageUrl ? '更换图片' : '选择图片' }}</button>
        </div>
        <p v-if="imageName" class="qr-image-name">{{ imageName }}</p>
        <p class="qr-footnote">请使用完整、清晰且留有边框的二维码。一张图识别首个找到的二维码，不支持摄像头扫码。</p>
      </section>
      <section class="qr-card qr-decode-card" aria-labelledby="qr-result-title" :aria-busy="decoding">
        <div class="qr-card-heading"><h2 id="qr-result-title">解析结果</h2><span v-if="decoded">{{ decoded.text.length.toLocaleString() }} 字符</span></div>
        <p v-if="decoding" class="qr-reading" role="status">正在识别图片中的二维码…</p>
        <p v-else-if="decodingError" class="tool-error" role="alert">{{ decodingError }}</p>
        <p v-else-if="decoded" class="qr-success" role="status">识别成功 · {{ decoded.width }} × {{ decoded.height }} px</p>
        <p v-else class="tool-explanation">选择图片后自动解析，文本与网址均原样显示。</p>
        <textarea :value="decoded?.text ?? ''" aria-label="二维码解析结果" placeholder="识别出的内容将显示在这里" spellcheck="false" readonly></textarea>
        <div class="qr-form-actions"><button type="button" class="utility-button primary" :disabled="!decoded || decoding" @click="copy(decoded!.text)">复制解析内容</button><button type="button" class="utility-button" :disabled="!decoded || decoding" @click="useDecoded">内容用于生成</button></div>
        <p class="qr-footnote">识别结果以纯文本呈现，不会自动访问网址或执行图片中的内容。</p>
      </section>
    </section>
    <footer class="encoding-page-footer">KIKYO TOOLS <span>静态二维码 · 本地生成与识别 · 切换页面保留内容</span></footer>
    <Transition name="toast"><div v-if="notice" class="toast-message" role="status">{{ notice }}</div></Transition>
  </main>
</template>
