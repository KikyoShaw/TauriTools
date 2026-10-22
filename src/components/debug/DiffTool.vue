<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { compareJson, compareTexts, MAX_DIFF_INPUT_LENGTH } from '../../utils/diff'
import type { DiffResult, JsonDiffResult, JsonDiffRow } from '../../utils/diff'

type Side = 'left' | 'right'
type Result = { mode: 'text'; value: DiffResult } | { mode: 'json'; value: JsonDiffResult }
const left = ref('')
const right = ref('')
const mode = ref<'text' | 'json'>('text')
const ignoreWhitespace = ref(false)
const ignoreKeyOrder = ref(true)
const result = shallowRef<Result | null>(null)
const failure = ref('')
const revision = ref(0)
const processedRevision = ref(-1)
const visibleLimit = ref(1000)
const selectedDifference = ref(-1)
const resultElement = ref<HTMLElement | null>(null)
const leftFileInput = ref<HTMLInputElement | null>(null)
const rightFileInput = ref<HTMLInputElement | null>(null)
const fileInfo = ref<Record<Side, string>>({ left: '', right: '' })
const fileErrors = ref<Record<Side, string>>({ left: '', right: '' })
const loading = ref<Record<Side, boolean>>({ left: false, right: false })
const importVersions: Record<Side, number> = { left: 0, right: 0 }
const stale = computed(() => result.value !== null && revision.value !== processedRevision.value)
const textRows = computed(() => result.value?.mode === 'text' ? result.value.value.rows.slice(0, visibleLimit.value) : [])
const jsonRows = computed(() => result.value?.mode === 'json' ? result.value.value.rows.slice(0, visibleLimit.value) : [])
const rowCount = computed(() => result.value?.value.rows.length ?? 0)
const shownCount = computed(() => Math.min(rowCount.value, visibleLimit.value))
const differences = computed(() => result.value?.mode === 'text' ? result.value.value.groupIndices : result.value?.value.rows.map((_, index) => index) ?? [])
const activeRow = computed(() => differences.value[selectedDifference.value] ?? -1)
const navigationEnabled = computed(() => !stale.value && differences.value.length > 0)
const actionLabels: Record<JsonDiffRow['type'], string> = { added: '新增', removed: '删除', changed: '值变化', type: '类型变化', order: '键顺序变化' }

watch([left, right, mode, ignoreWhitespace, ignoreKeyOrder], () => {
  revision.value += 1
  failure.value = ''
  selectedDifference.value = -1
}, { flush: 'sync' })
for (const side of ['left', 'right'] as const) {
  watch(side === 'left' ? left : right, () => {
    importVersions[side] += 1
    fileInfo.value[side] = ''
    fileErrors.value[side] = ''
    loading.value[side] = false
  }, { flush: 'sync' })
}

function run() {
  failure.value = ''
  selectedDifference.value = -1
  visibleLimit.value = 1000
  try {
    result.value = mode.value === 'text'
      ? { mode: 'text', value: compareTexts(left.value, right.value, ignoreWhitespace.value) }
      : { mode: 'json', value: compareJson(left.value, right.value, { ignoreKeyOrder: ignoreKeyOrder.value }) }
    processedRevision.value = revision.value
  } catch (error) {
    result.value = null
    failure.value = error instanceof Error ? error.message : String(error)
  }
}

async function navigate(direction: -1 | 1) {
  if (!navigationEnabled.value) return
  const count = differences.value.length
  selectedDifference.value = selectedDifference.value < 0
    ? direction === 1 ? 0 : count - 1
    : (selectedDifference.value + direction + count) % count
  const row = activeRow.value
  visibleLimit.value = Math.max(visibleLimit.value, Math.ceil((row + 1) / 1000) * 1000)
  await nextTick()
  const target = resultElement.value?.querySelector<HTMLElement>(`[data-diff-row="${row}"]`)
  target?.focus({ preventScroll: true })
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function fillExample() {
  if (mode.value === 'json') {
    left.value = '{\n  "name": "Kikyo",\n  "id": 9007199254740993,\n  "enabled": true,\n  "tools": ["JSON", "文本"]\n}'
    right.value = '{\n  "id": 9007199254740994,\n  "name": "Kikyo",\n  "enabled": false,\n  "tools": ["JSON", "对比"],\n  "version": 2\n}'
  } else {
    left.value = 'Kikyo 工具箱\n保留这一行\n旧的内容\n最后一行\n'
    right.value = 'Kikyo 工具箱\n保留这一行\n新的内容\n新增的一行\n最后一行\n'
  }
  run()
}
function swap() {
  const oldLeft = left.value
  const oldLeftInfo = fileInfo.value.left
  const oldRightInfo = fileInfo.value.right
  left.value = right.value
  right.value = oldLeft
  fileInfo.value = { left: oldRightInfo, right: oldLeftInfo }
}
function clear() {
  left.value = ''; right.value = ''; result.value = null; failure.value = ''
  fileInfo.value = { left: '', right: '' }; fileErrors.value = { left: '', right: '' }
  importVersions.left += 1; importVersions.right += 1
  loading.value = { left: false, right: false }
  selectedDifference.value = -1; visibleLimit.value = 1000
}
async function importFile(event: Event, side: Side) {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]
  element.value = ''
  if (!file) return
  const ticket = ++importVersions[side]
  fileErrors.value[side] = ''; loading.value[side] = true
  try {
    if (file.size > MAX_DIFF_INPUT_LENGTH) throw new Error('文件超过 2 MiB，请选择更小的文本文件。')
    const buffer = await file.arrayBuffer()
    if (ticket !== importVersions[side]) return
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    if (side === 'left') left.value = text
    else right.value = text
    fileInfo.value[side] = `${file.name} · ${file.size.toLocaleString()} 字节 · UTF-8`
  } catch (error) {
    if (ticket !== importVersions[side]) return
    fileErrors.value[side] = error instanceof TypeError ? '文件不是有效的 UTF-8 文本，请转换编码后重试。' : error instanceof Error ? error.message : String(error)
  } finally {
    if (ticket === importVersions[side]) loading.value[side] = false
  }
}
function shortcut(event: KeyboardEvent) {
  if (!event.isComposing && (event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); run() }
}
</script>

<template>
  <section class="diff-tool" aria-label="文本与 JSON 对比" @keydown="shortcut">
    <div class="diff-toolbar">
      <label class="diff-mode">对比模式
        <select v-model="mode" aria-label="对比模式"><option value="text">文本对比</option><option value="json">JSON 结构对比</option></select>
      </label>
      <label v-if="mode === 'text'" class="diff-option"><input v-model="ignoreWhitespace" type="checkbox">忽略空白差异</label>
      <label v-else class="diff-option"><input v-model="ignoreKeyOrder" type="checkbox">忽略对象键顺序</label>
      <div class="diff-secondary-actions">
        <button type="button" class="text-button" @click="fillExample">填入示例</button>
        <button type="button" class="text-button" @click="swap">交换左右</button>
        <button type="button" class="text-button" @click="clear">清空对比</button>
      </div>
    </div>
    <p v-if="mode === 'text'" class="diff-hint">逐行对比，CRLF / LF / CR 换行视为相同。忽略空白时，去除每行首尾空白，并将行内连续空白视为一个空格；保留空行和末尾换行差异。</p>
    <p v-else class="diff-hint">按路径比较结构，数组始终按顺序比较。数字按精确十进制数值比较（1 = 1.0 = 1e0，-0 = 0），保留大整数精度；字符串按解码后的值比较。重复键会报错。</p>
    <div class="diff-editors">
      <section class="diff-editor">
        <div class="diff-editor-heading"><h2>左侧内容</h2><button type="button" class="text-button" :disabled="loading.left" @click="leftFileInput?.click()">{{ loading.left ? '正在读取…' : '导入左侧文件' }}</button></div>
        <input ref="leftFileInput" class="diff-file-input" type="file" accept=".txt,.json,.log,.csv,.md,text/*,application/json" aria-label="导入左侧文件" @change="importFile($event, 'left')">
        <textarea v-model="left" aria-label="对比左侧内容" wrap="soft" spellcheck="false" autocomplete="off" placeholder="粘贴左侧文本或 JSON"></textarea>
        <div class="diff-input-info"><span>{{ left.length.toLocaleString() }} 字符</span><span>{{ fileInfo.left }}</span></div>
        <p v-if="fileErrors.left" class="tool-error" role="alert">左侧：{{ fileErrors.left }}</p>
      </section>
      <section class="diff-editor">
        <div class="diff-editor-heading"><h2>右侧内容</h2><button type="button" class="text-button" :disabled="loading.right" @click="rightFileInput?.click()">{{ loading.right ? '正在读取…' : '导入右侧文件' }}</button></div>
        <input ref="rightFileInput" class="diff-file-input" type="file" accept=".txt,.json,.log,.csv,.md,text/*,application/json" aria-label="导入右侧文件" @change="importFile($event, 'right')">
        <textarea v-model="right" aria-label="对比右侧内容" wrap="soft" spellcheck="false" autocomplete="off" placeholder="粘贴右侧文本或 JSON"></textarea>
        <div class="diff-input-info"><span>{{ right.length.toLocaleString() }} 字符</span><span>{{ fileInfo.right }}</span></div>
        <p v-if="fileErrors.right" class="tool-error" role="alert">右侧：{{ fileErrors.right }}</p>
      </section>
    </div>
    <div class="diff-actions"><button type="button" class="utility-button primary" @click="run">开始对比</button><span class="diff-hint">Ctrl + Enter · 每侧最多 2 Mi 个字符 · 文件最多 2 MiB（UTF-8）<template v-if="mode === 'text'"> · 两侧合计最多 10000 行</template></span></div>
    <p v-if="failure" class="tool-error" role="alert">{{ failure }}</p>
    <section ref="resultElement" class="diff-results" aria-label="对比结果">
      <div class="diff-result-heading">
        <h2>对比结果</h2>
        <div class="diff-navigation"><button type="button" class="utility-button" :disabled="!navigationEnabled" @click="navigate(-1)">上一处差异</button><span>{{ selectedDifference < 0 ? 0 : selectedDifference + 1 }} / {{ differences.length }}</span><button type="button" class="utility-button" :disabled="!navigationEnabled" @click="navigate(1)">下一处差异</button></div>
      </div>
      <div class="diff-status" role="status" aria-live="polite">
        <template v-if="result">
          <span v-if="stale" class="diff-stale">输入或选项已修改，以下为上次结果，请重新开始对比。</span>
          <template v-if="result.mode === 'text'"><span>新增 {{ result.value.added }} 行 · 删除 {{ result.value.removed }} 行 · 相同 {{ result.value.equal }} 行 · {{ result.value.groupIndices.length }} 处差异</span></template>
          <template v-else><span>新增 {{ result.value.added }} 项 · 删除 {{ result.value.removed }} 项 · 值变化 {{ result.value.changed }} 项 · 类型变化 {{ result.value.typeChanged }} 项 · 键顺序变化 {{ result.value.orderChanged }} 项</span></template>
          <span v-if="differences.length === 0">内容相同（按当前对比规则）</span>
          <span>已显示 {{ shownCount.toLocaleString() }} / {{ rowCount.toLocaleString() }} {{ result.mode === 'text' ? '行' : '项' }}</span>
        </template>
        <span v-else>填入两侧内容后点击「开始对比」。所有处理均在本地完成。</span>
      </div>
      <div v-if="result?.mode === 'text' && rowCount" class="diff-table-wrap">
        <table class="diff-table diff-text-table"><caption class="diff-sr-only">逐行对比结果：左侧为原文，右侧为新内容</caption><colgroup><col class="diff-number-col"><col><col class="diff-number-col"><col></colgroup>
          <thead><tr><th scope="col">旧行</th><th scope="col">左侧内容</th><th scope="col">新行</th><th scope="col">右侧内容</th></tr></thead>
          <tbody><tr v-for="(row, index) in textRows" :key="index" :data-diff-row="index" tabindex="-1" :class="[`diff-row-${row.type}`, { 'diff-row-active': activeRow === index, 'diff-row-group-active': activeRow >= 0 && row.groupIndex !== undefined && row.groupIndex === selectedDifference }]">
            <td class="diff-line-number">{{ row.leftLine ?? '—' }}</td><td><span class="diff-change-marker" :aria-label="row.type === 'remove' ? '删除' : '相同'">{{ row.type === 'remove' ? '−' : ' ' }}</span><span class="diff-line-text">{{ row.left }}</span><span v-if="row.left !== undefined && !row.leftHasNewline" class="diff-eol">无末尾换行</span></td>
            <td class="diff-line-number">{{ row.rightLine ?? '—' }}</td><td><span class="diff-change-marker" :aria-label="row.type === 'add' ? '新增' : '相同'">{{ row.type === 'add' ? '+' : ' ' }}</span><span class="diff-line-text">{{ row.right }}</span><span v-if="row.right !== undefined && !row.rightHasNewline" class="diff-eol">无末尾换行</span></td>
          </tr></tbody>
        </table>
      </div>
      <div v-else-if="result?.mode === 'json' && rowCount" class="diff-table-wrap">
        <table class="diff-table diff-json-table"><caption class="diff-sr-only">JSON 结构差异，路径使用从零开始的数组下标；新增或删除的子树计为一项</caption><colgroup><col class="diff-path-col"><col class="diff-action-col"><col><col></colgroup>
          <thead><tr><th scope="col">JSON 路径</th><th scope="col">变化</th><th scope="col">左侧值 / 旧值</th><th scope="col">右侧值 / 新值</th></tr></thead>
          <tbody><tr v-for="(row, index) in jsonRows" :key="index" :data-diff-row="index" tabindex="-1" :class="[`diff-json-${row.type}`, { 'diff-row-active': activeRow === index }]">
            <td class="diff-path">{{ row.path }}</td><td>{{ actionLabels[row.type] }}</td><td><span v-if="row.leftLine" class="diff-source-line">第 {{ row.leftLine }} 行</span><span class="diff-line-text">{{ row.left ?? '（不存在）' }}</span></td><td><span v-if="row.rightLine" class="diff-source-line">第 {{ row.rightLine }} 行</span><span class="diff-line-text">{{ row.right ?? '（不存在）' }}</span></td>
          </tr></tbody>
        </table>
      </div>
      <div v-if="result && shownCount < rowCount" class="diff-load-more"><button type="button" class="utility-button" @click="visibleLimit += 1000">再显示 {{ Math.min(1000, rowCount - shownCount) }} {{ result.mode === 'text' ? '行' : '项' }}</button><span>结果完整保留；差异导航会自动显示目标所在行。</span></div>
      <p v-if="result?.mode === 'json'" class="diff-hint">路径以 $ 为根，数组下标从 0 开始。新增 / 删除的整个子树计为一项；类型变化和键顺序变化单独计数。结果保留数值原文。</p>
    </section>
  </section>
</template>
