<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import JsonTree from '../components/JsonTree.vue'
import { escapeJsonText, JsonToolError, parseJson, serializeJson, unescapeJsonText } from '../utils/json'
import type { ParsedJson } from '../utils/json'

type Action = 'format' | 'compact' | 'escape' | 'unescape' | 'compactEscape'
const actionNames: Record<Action, string> = { format: '解析 / 格式化', compact: '压缩', escape: '转义', unescape: '反转义', compactEscape: '压缩并转义' }
const input = ref('')
const output = ref('')
const hasOutput = ref(false)
const indentation = ref('  ')
const view = ref<'text' | 'tree'>('text')
const parsed = shallowRef<ParsedJson | null>(null)
const failure = shallowRef<{ message: string; line?: number; column?: number; offset?: number } | null>(null)
const processedInput = ref<string | null>(null)
const operation = ref<Action | null>(null)
const editor = ref<HTMLTextAreaElement | null>(null)
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(noticeTimer))
const stale = computed(() => processedInput.value !== null && input.value !== processedInput.value)
const inputLines = computed(() => input.value.split('\n').length)
const rootType = computed(() => parsed.value ? { object: '对象', array: '数组', string: '字符串', number: '数字', boolean: '布尔值', null: 'null' }[parsed.value.root.type] : '')
watch(input, () => { failure.value = null })
watch(indentation, () => {
  if (operation.value === 'format' && parsed.value && !stale.value) output.value = serializeJson(parsed.value.root, indentation.value)
})

function run(action: Action, tree = false) {
  failure.value = null
  try {
    let document: ParsedJson | null = null
    let next: string
    if (action === 'escape') next = escapeJsonText(input.value)
    else if (action === 'unescape') next = unescapeJsonText(input.value)
    else {
      document = parseJson(input.value)
      next = serializeJson(document.root, action === 'format' ? indentation.value : '')
      if (action === 'compactEscape') { next = escapeJsonText(next); document = null }
    }
    output.value = next
    parsed.value = document
    processedInput.value = input.value
    operation.value = action
    hasOutput.value = true
    view.value = document && tree ? 'tree' : 'text'
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error))
    failure.value = error instanceof JsonToolError
      ? { message: cause.message, line: error.line, column: error.column, offset: error.offset }
      : { message: cause.message }
    output.value = ''
    hasOutput.value = false
    parsed.value = null
    processedInput.value = null
    operation.value = null
    view.value = 'text'
  }
}
async function chooseView(next: 'text' | 'tree') {
  if (next === 'tree' && (!parsed.value || stale.value)) run('format', true)
  else view.value = next
  await nextTick()
}
async function navigateResult(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'Home' ? 'text' : event.key === 'End' ? 'tree' : view.value === 'text' ? 'tree' : 'text'
  await chooseView(next)
  document.getElementById(`json-view-${view.value}`)?.focus()
}
function locateError() {
  if (failure.value?.offset === undefined) return
  const offset = Math.max(0, Math.min(failure.value.offset, input.value.length))
  editor.value?.focus()
  editor.value?.setSelectionRange(offset, Math.min(offset + 1, input.value.length))
}
async function copy() {
  try { await navigator.clipboard.writeText(output.value); notice.value = '已复制 JSON 处理结果' }
  catch { notice.value = '复制失败，请选中结果后按 Ctrl+C' }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 2000)
}
function fillExample() {
  input.value = '{"name":"Kikyo 工具箱","user":{"id":9007199254740993,"active":true},"tools":["计算器","编码工具","颜色转换","JSON 工具"],"message":"你好，世界！👋","optional":null}'
  run('format', true)
}
function clear() {
  input.value = ''
  output.value = ''
  parsed.value = null
  failure.value = null
  processedInput.value = null
  operation.value = null
  hasOutput.value = false
  view.value = 'text'
}
function useOutput() {
  input.value = output.value
  failure.value = null
  editor.value?.focus()
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    run(event.shiftKey ? 'compact' : 'format')
  }
}
</script>

<template>
  <main class="encoding-page json-page">
    <header class="encoding-header"><div><h1>JSON 工具</h1><p>JSON 校验、树形解析、格式化、压缩与字符串转义</p></div><span class="encoding-local"><i></i>本地处理 · 不上传数据</span></header>
    <section class="json-workspace" aria-label="JSON 解析与转换">
      <div class="json-toolbar">
        <div class="json-main-actions"><button type="button" class="utility-button primary" @click="run('format')">解析 / 格式化</button><button type="button" class="utility-button" @click="run('compact')">压缩</button><button type="button" class="utility-button" @click="run('escape')">转义</button><button type="button" class="utility-button" @click="run('unescape')">反转义</button><button type="button" class="utility-button" @click="run('compactEscape')">压缩并转义</button></div>
        <div class="json-settings"><label>缩进 <select v-model="indentation" aria-label="JSON 缩进"><option value="  ">2 空格</option><option value="    ">4 空格</option><option :value="'\t'">Tab</option></select></label><button type="button" class="text-button" @click="fillExample">填入示例</button><button type="button" class="text-button" @click="clear">清空内容</button></div>
      </div>
      <p class="json-help">格式化与压缩保留大整数原文、键顺序及重复键。转义将整段输入作为字符串处理，包含外层双引号；反转义解码一层，也支持不带外层引号的转义文本。</p>
      <div class="json-editors">
        <label class="json-input-panel"><span class="json-editor-heading"><span>输入内容</span><small>{{ input.length.toLocaleString() }} 字符 · {{ inputLines }} 行</small></span><textarea ref="editor" v-model="input" aria-label="JSON 输入内容" placeholder="在这里粘贴 JSON，或点击「填入示例」" spellcheck="false" autocomplete="off" :aria-invalid="!!failure" @keydown="keydown"></textarea></label>
        <section class="json-output-panel" aria-label="JSON 处理结果">
          <div class="json-editor-heading"><span>处理结果 <small v-if="hasOutput">{{ output.length.toLocaleString() }} 字符</small></span><nav class="json-result-tabs" role="tablist" aria-label="JSON 结果视图" @keydown="navigateResult"><button id="json-view-text" type="button" role="tab" :aria-selected="view === 'text'" aria-controls="json-result-text" :tabindex="view === 'text' ? 0 : -1" :class="{ active: view === 'text' }" @click="chooseView('text')">文本</button><button id="json-view-tree" type="button" role="tab" :aria-selected="view === 'tree'" aria-controls="json-result-tree" :tabindex="view === 'tree' ? 0 : -1" :class="{ active: view === 'tree' }" @click="chooseView('tree')">树形</button></nav></div>
          <div v-if="view === 'text'" id="json-result-text" class="json-text-panel" role="tabpanel" aria-labelledby="json-view-text"><textarea :value="output" aria-label="JSON 文本结果" placeholder="处理后的结果" spellcheck="false" readonly></textarea></div>
          <JsonTree v-else-if="parsed" id="json-result-tree" :root="parsed.root" role="tabpanel" aria-labelledby="json-view-tree" />
        </section>
      </div>
      <div v-if="failure" class="json-error" role="alert"><div><strong>处理失败<span v-if="failure.line"> · 第 {{ failure.line }} 行，第 {{ failure.column }} 列</span></strong><span>{{ failure.message }}</span></div><button v-if="failure.offset !== undefined" type="button" class="utility-button" @click="locateError">定位错误</button></div>
      <div v-else class="json-status" role="status"><span v-if="stale" class="json-stale">输入已修改，当前显示上次成功结果，请重新处理。</span><template v-else-if="parsed"><span class="json-valid"><i></i>JSON 校验通过</span><span>{{ rootType }} · {{ parsed.nodeCount.toLocaleString() }} 节点 · 最大深度 {{ parsed.maxDepth }}</span></template><span v-else-if="operation">{{ actionNames[operation] }}完成</span><span v-else>支持对象、数组、字符串、数字、布尔值及 null</span></div>
      <p v-if="parsed?.duplicateKeys && !stale" class="json-duplicate-warning">检测到 {{ parsed.duplicateKeys }} 个重复键，格式化、压缩和树形视图均按原顺序保留，不会覆盖。</p>
      <div class="json-bottom-actions"><span>Ctrl + Enter 格式化 <span class="heading-dot">·</span> Ctrl + Shift + Enter 压缩</span><div><button type="button" class="utility-button" :disabled="!hasOutput" @click="useOutput">结果作为输入</button><button type="button" class="utility-button primary" :disabled="!hasOutput" @click="copy">复制结果</button></div></div>
    </section>
    <footer class="encoding-page-footer">KIKYO TOOLS <span>严格 JSON · 保留数值原文 · 切换页面保留内容</span></footer>
    <Transition name="toast"><div v-if="notice" class="toast-message" role="status">{{ notice }}</div></Transition>
  </main>
</template>
