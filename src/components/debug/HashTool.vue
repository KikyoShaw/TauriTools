<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, shallowRef, watch } from 'vue'
import { HASH_ALGORITHMS, MAX_HASH_TEXT_BYTES, MAX_HASH_TEXT_LENGTH, startHash } from '../../utils/hash'
import type { HashAlgorithm, HashInput, HashProgress, HashResult, HashTask } from '../../utils/hash'

const mode = ref<'text' | 'file'>('text')
const text = ref('')
const file = shallowRef<File | null>(null)
const result = shallowRef<HashResult | null>(null)
const resultSource = shallowRef<HashInput | null>(null)
const progress = ref<HashProgress>({ bytesDone: 0, totalBytes: 0 })
const busy = ref(false)
const error = ref('')
const notice = ref('')
const expected = ref('')
const algorithm = ref<HashAlgorithm>('sha256')
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
let task: HashTask | null = null
let version = 0
let active = true
let disposed = false

const textBytes = computed(() => text.value.length <= MAX_HASH_TEXT_LENGTH ? new TextEncoder().encode(text.value).byteLength : null)
const selectedAlgorithm = computed(() => HASH_ALGORITHMS.find(item => item.id === algorithm.value)!)
function isCurrent(source: HashInput) {
  return source.kind === mode.value && (source.kind === 'text' ? source.text === text.value : source.file === file.value)
}
const currentResult = computed(() => resultSource.value && isCurrent(resultSource.value) ? result.value : null)
const expectedValue = computed(() => expected.value.trim())
const expectedError = computed(() => {
  if (!expectedValue.value) return ''
  const width = selectedAlgorithm.value.length
  return expectedValue.value.length === width && /^[\da-f]+$/i.test(expectedValue.value)
    ? '' : `请输入 ${width} 位十六进制 ${selectedAlgorithm.value.label} 校验值。`
})
const comparison = computed(() => {
  if (!currentResult.value || !expectedValue.value || expectedError.value) return ''
  return currentResult.value.hashes[algorithm.value] === expectedValue.value.toLowerCase() ? '校验一致' : '校验不一致'
})

function byteLabel(bytes: number) {
  return `${bytes.toLocaleString('zh-CN')} 字节`
}
function clearToast() {
  clearTimeout(toastTimer)
  toastTimer = undefined
  toast.value = ''
}
function invalidate(message = '') {
  version++
  task?.cancel()
  task = null
  busy.value = false
  result.value = null
  resultSource.value = null
  progress.value = { bytesDone: 0, totalBytes: 0 }
  error.value = ''
  notice.value = message
  clearToast()
}
watch([mode, text, file], () => invalidate(), { flush: 'sync' })

function selectFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
}
function dropFile(event: DragEvent) {
  const dropped = event.dataTransfer?.files[0]
  if (dropped) file.value = dropped
}
async function calculate() {
  invalidate()
  const source: HashInput = mode.value === 'text'
    ? { kind: 'text', text: text.value }
    : { kind: 'file', file: file.value! }
  if (source.kind === 'file' && !source.file) {
    error.value = '请先选择需要校验的文件。'
    return
  }
  if (source.kind === 'text' && (source.text.length > MAX_HASH_TEXT_LENGTH || (textBytes.value ?? 0) > MAX_HASH_TEXT_BYTES)) {
    error.value = '文本过长，最多支持 2 Mi 个 UTF-16 字符且 UTF-8 编码不超过 8 MiB。'
    return
  }
  const requestVersion = version
  progress.value = { bytesDone: 0, totalBytes: source.kind === 'file' ? source.file.size : textBytes.value ?? 0 }
  busy.value = true
  const pending = startHash(source, update => {
    if (requestVersion === version && isCurrent(source)) progress.value = update
  })
  task = pending
  try {
    const completed = await pending.promise
    if (requestVersion !== version || !isCurrent(source)) return
    result.value = completed
    resultSource.value = source
    notice.value = `计算完成 · ${byteLabel(completed.bytes)}`
  } catch (cause) {
    if (requestVersion !== version) return
    result.value = null
    resultSource.value = null
    if (cause instanceof Error && cause.name === 'AbortError') notice.value = '已取消计算。'
    else error.value = cause instanceof Error ? cause.message : '哈希计算失败，请重试。'
  } finally {
    if (requestVersion === version) {
      busy.value = false
      task = null
    }
  }
}
async function copyHash(id: HashAlgorithm) {
  const value = currentResult.value?.hashes[id]
  if (!value) return
  clearToast()
  const copyVersion = version
  try {
    await navigator.clipboard.writeText(value)
    if (disposed || !active || copyVersion !== version) return
    toast.value = `已复制 ${HASH_ALGORITHMS.find(item => item.id === id)!.label}`
  } catch {
    if (disposed || !active || copyVersion !== version) return
    toast.value = '复制失败，请选中摘要手动复制。'
  }
  toastTimer = setTimeout(() => { toast.value = ''; toastTimer = undefined }, 2200)
}
// Keep completed output under KeepAlive; only active work is discarded on leave.
onDeactivated(() => {
  active = false
  if (busy.value) invalidate('已取消计算。')
  clearToast()
})
onActivated(() => { active = true })
onBeforeUnmount(() => {
  disposed = true
  invalidate()
})
</script>

<template>
  <section class="hash-tool" aria-label="哈希工具">
    <div class="hash-heading">
      <h2>哈希 / 校验</h2>
      <span class="hash-hint">MD5 · SHA-1 · SHA-256 · SHA-512 · CRC32</span>
    </div>
    <div class="hash-modes" role="group" aria-label="哈希输入方式">
      <button type="button" class="utility-button" :class="{ primary: mode === 'text' }" :aria-pressed="mode === 'text'" @click="mode = 'text'">文本摘要</button>
      <button type="button" class="utility-button" :class="{ primary: mode === 'file' }" :aria-pressed="mode === 'file'" @click="mode = 'file'">文件校验</button>
    </div>
    <div v-if="mode === 'text'" class="hash-source">
      <label class="hash-label" for="hash-text-content">文本内容</label>
      <textarea id="hash-text-content" v-model="text" aria-label="哈希文本内容" spellcheck="false" placeholder="输入要计算的原始文本；空文本也可以计算" />
      <div class="hash-hint hash-source-hint">
        <span>{{ text.length.toLocaleString('zh-CN') }} 个 UTF-16 字符 · {{ textBytes === null ? '超过字符上限' : byteLabel(textBytes) }}</span>
        <span>按原文 UTF-8 计算，保留首尾空白和换行；上限 2 Mi 字符 / 8 MiB</span>
      </div>
    </div>
    <div v-else class="hash-source hash-file-source" @dragover.prevent @drop.prevent="dropFile">
      <label class="hash-label" for="hash-file-input">选择文件或拖入此处</label>
      <input id="hash-file-input" type="file" aria-label="选择校验文件" @change="selectFile" />
      <p v-if="file" class="hash-file-detail"><strong>{{ file.name }}</strong><span>{{ byteLabel(file.size) }}</span></p>
      <p class="hash-hint">每次校验一个文件，无文件类型限制。按 1 MiB 分块读取，选择后点击“计算哈希”。</p>
    </div>
    <div class="hash-actions">
      <button type="button" class="utility-button primary" :disabled="busy" @click="calculate">计算哈希</button>
      <button v-if="busy" type="button" class="utility-button" @click="invalidate('已取消计算。')">取消计算</button>
      <span class="hash-hint">所有计算均在本地完成</span>
    </div>
    <div v-if="busy" class="hash-progress">
      <progress :value="progress.bytesDone" :max="progress.totalBytes || 1" aria-label="哈希计算进度" />
      <span role="status">已处理 {{ byteLabel(progress.bytesDone) }} / {{ byteLabel(progress.totalBytes) }}</span>
    </div>
    <p v-if="error" class="tool-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="hash-hint" role="status">{{ notice }}</p>
    <div class="hash-results" aria-label="哈希摘要结果" :aria-busy="busy">
      <div v-for="item in HASH_ALGORITHMS" :key="item.id" class="hash-result-row">
        <label :for="`hash-result-${item.id}`">{{ item.label }}</label>
        <input :id="`hash-result-${item.id}`" :value="currentResult?.hashes[item.id] ?? ''" :aria-label="`${item.label} 摘要`" readonly spellcheck="false" placeholder="等待计算" />
        <button type="button" class="utility-button" :aria-label="`复制 ${item.label}`" :disabled="!currentResult" @click="copyHash(item.id)">复制 {{ item.label }}</button>
      </div>
    </div>
    <div class="hash-verify">
      <h3>校验摘要</h3>
      <div class="hash-verify-fields">
        <label>算法<select v-model="algorithm" aria-label="校验算法"><option v-for="item in HASH_ALGORITHMS" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
        <label class="hash-expected">预期校验值<input v-model="expected" aria-label="预期校验值" :aria-invalid="!!expectedError" spellcheck="false" autocomplete="off" :placeholder="`${selectedAlgorithm.length} 位十六进制校验值`" /></label>
      </div>
      <p class="hash-hint">仅忽略校验值的大小写与首尾空白。{{ selectedAlgorithm.label }} 需要 {{ selectedAlgorithm.length }} 位十六进制字符。</p>
      <p v-if="expectedError" class="tool-error" role="status">{{ expectedError }}</p>
      <p v-else-if="comparison" class="hash-comparison" :class="{ 'is-match': comparison === '校验一致', 'is-mismatch': comparison === '校验不一致' }" role="status">{{ comparison }}</p>
      <p v-else-if="expectedValue && !currentResult" class="hash-hint" role="status">请先计算当前内容的哈希，再进行校验。</p>
    </div>
    <p v-if="toast" class="hash-toast" role="status">{{ toast }}</p>
  </section>
</template>
