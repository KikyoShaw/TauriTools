<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, ref, shallowRef, watch } from 'vue'
import { createRegexRunner, REGEX_INPUT_LIMIT, REGEX_MATCH_LIMIT, REGEX_PATTERN_LIMIT, RegexToolError } from '../../utils/regex'
import type { RegexRequest, RegexResult } from '../../utils/regex'

const flagOptions = [
  { value: 'g', label: '全局匹配 g' },
  { value: 'i', label: '忽略大小写 i' },
  { value: 'm', label: '多行模式 m' },
  { value: 's', label: '点匹配换行 s' },
  { value: 'u', label: 'Unicode u' },
  { value: 'y', label: '粘连匹配 y' },
]
const source = ref('')
const input = ref('')
const replacement = ref('')
const selectedFlags = ref(['g'])
const flags = computed(() => flagOptions.filter(option => selectedFlags.value.includes(option.value)).map(option => option.value).join(''))
const result = shallowRef<RegexResult | null>(null)
const processed = shallowRef<RegexRequest | null>(null)
const busy = ref(false)
const failure = ref('')
const notice = ref('')
const runner = createRegexRunner()
let generation = 0
let noticeTimer: ReturnType<typeof setTimeout> | undefined
const stale = computed(() => processed.value !== null && (
  source.value !== processed.value.source || input.value !== processed.value.input ||
  replacement.value !== processed.value.replacement || flags.value !== processed.value.flags
))
const canCopy = computed(() => result.value?.replacedText !== null && result.value !== null && !stale.value && !busy.value)
const highlights = computed(() => {
  if (!result.value || !processed.value) return []
  const text = processed.value.input
  const segments: Array<{ text: string; match: boolean; zero: boolean; index: number }> = []
  let cursor = 0
  for (const match of result.value.matches) {
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), match: false, zero: false, index: cursor })
    segments.push({ text: match.text, match: true, zero: match.index === match.end, index: match.index })
    cursor = match.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false, zero: false, index: cursor })
  return segments
})

function cancel() {
  generation++
  runner.cancel()
  busy.value = false
}
watch([source, input, replacement, flags], () => { cancel(); failure.value = ''; notice.value = '' }, { flush: 'sync' })
function cleanup() { cancel(); clearTimeout(noticeTimer) }
onBeforeUnmount(cleanup)
onDeactivated(cleanup)

async function run() {
  const request = { source: source.value, flags: flags.value, input: input.value, replacement: replacement.value }
  const current = ++generation
  failure.value = ''
  notice.value = ''
  result.value = null
  processed.value = null
  busy.value = true
  try {
    const response = await runner.run(request)
    if (current !== generation) return
    result.value = response
    processed.value = request
  } catch (error) {
    if (current !== generation || (error instanceof RegexToolError && error.code === 'cancelled')) return
    failure.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (current === generation) busy.value = false
  }
}
function fillExample() {
  source.value = '(?<name>[A-Za-z]+)=(\\d+)'
  input.value = 'width=1280\nheight=720\nscale=2'
  replacement.value = '$<name>: $2'
  selectedFlags.value = ['g']
  void run()
}
function clear() {
  cancel()
  source.value = ''
  input.value = ''
  replacement.value = ''
  selectedFlags.value = ['g']
  result.value = null
  processed.value = null
  failure.value = ''
  notice.value = ''
}
async function copy() {
  if (!canCopy.value) return
  try { await navigator.clipboard.writeText(result.value!.replacedText!); notice.value = '已复制替换结果' }
  catch { notice.value = '复制失败，请选中替换结果后按 Ctrl+C' }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 2000)
}
function keydown(event: KeyboardEvent) {
  if (!event.isComposing && event.keyCode !== 229 && (event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    void run()
  }
}
function preview(value: string) { return value.length > 180 ? `${value.slice(0, 180)}…` : value }
function captureText(value: string | null) { return value === null ? '未参与匹配' : value === '' ? '空字符串' : preview(value) }
</script>

<template>
  <section class="regex-tool" aria-label="正则表达式工具" @keydown="keydown">
    <div class="regex-heading"><h2>正则表达式测试</h2><span>本地处理 · 不上传数据</span></div>
    <p id="regex-pattern-hint" class="regex-help">输入原始表达式，不要添加 /…/ 分隔符；标志由下方选项设置。空表达式有效，会匹配零宽位置。使用 JavaScript 原生 RegExp 引擎。</p>
    <label class="regex-field"><span>正则表达式 <small>{{ source.length.toLocaleString() }} / {{ REGEX_PATTERN_LIMIT.toLocaleString() }}</small></span><textarea v-model="source" class="regex-pattern" aria-label="正则表达式" aria-describedby="regex-pattern-hint" :aria-invalid="!!failure" rows="2" placeholder="例如 (?&lt;name&gt;[A-Za-z]+)=(\d+)" spellcheck="false" autocomplete="off"></textarea></label>
    <fieldset class="regex-flags"><legend>匹配标志</legend><label v-for="option in flagOptions" :key="option.value"><input v-model="selectedFlags" type="checkbox" :value="option.value" />{{ option.label }}</label></fieldset>
    <div class="regex-editors">
      <label class="regex-field"><span>正则测试文本 <small>{{ input.length.toLocaleString() }} / {{ REGEX_INPUT_LIMIT.toLocaleString() }}</small></span><textarea v-model="input" aria-label="正则测试文本" rows="8" placeholder="在这里粘贴需要匹配的文本" spellcheck="false" autocomplete="off"></textarea></label>
      <div class="regex-replacement-panel"><label class="regex-field"><span>正则替换内容</span><textarea v-model="replacement" aria-label="正则替换内容" rows="3" placeholder="例如 $&lt;name&gt;: $2，留空表示删除匹配内容" spellcheck="false" autocomplete="off"></textarea></label><p class="regex-help">支持 $$、$&amp;、$1–$99、$&lt;name&gt;、$`、$'。未选 g 时仅匹配和替换第一处；y 从文本起始位置连续匹配。索引按 UTF-16 代码单元计算，结束位置不包含在匹配内。</p></div>
    </div>
    <div class="regex-actions"><div><button type="button" class="utility-button primary" @click="run">{{ busy ? '重新运行匹配' : '运行匹配' }}</button><button v-if="busy" type="button" class="utility-button" @click="cancel">取消匹配</button><button type="button" class="utility-button" @click="fillExample">填入示例</button><button type="button" class="utility-button" @click="clear">清空正则</button></div><span>Ctrl + Enter 运行 · 超过 1 秒自动终止</span></div>
    <p v-if="failure" class="regex-error" role="alert">{{ failure }}</p>
    <p v-else class="regex-status" role="status" aria-live="polite"><span v-if="busy">正在匹配…</span><span v-else-if="stale" class="regex-warning">内容已修改，请重新匹配</span><span v-else-if="result">{{ result.capped ? `超过 ${REGEX_MATCH_LIMIT} 处匹配，仅显示前 ${REGEX_MATCH_LIMIT} 处` : result.matches.length ? `找到 ${result.matches.length} 处匹配` : '未找到匹配' }}</span><span v-else>输入内容后点击「运行匹配」，同时生成匹配详情和替换结果。</span></p>
    <template v-if="result">
      <p v-if="result.capped" class="regex-warning" role="status">匹配数量已达到显示上限，总数未完全统计。下方仅高亮前 {{ REGEX_MATCH_LIMIT }} 处匹配。</p>
      <section class="regex-result-section" aria-label="正则匹配高亮"><h3>匹配高亮 <small>零宽匹配用 <span class="regex-zero-sample">¦</span> 标记</small></h3><pre class="regex-highlight"><template v-for="(segment, index) in highlights" :key="index"><mark v-if="segment.match" :class="{ 'regex-zero': segment.zero }" :title="`索引 ${segment.index}${segment.zero ? '：零宽匹配' : ''}`" :aria-label="segment.zero ? `索引 ${segment.index} 的零宽匹配` : undefined">{{ segment.zero ? '¦' : segment.text }}</mark><template v-else>{{ segment.text }}</template></template><span v-if="!highlights.length" class="regex-empty">测试文本为空</span></pre></section>
      <section class="regex-result-section" aria-label="正则匹配详情"><h3>匹配详情 <small>第 0 组为完整匹配；空字符串与未参与匹配的分组分别显示。</small></h3><p v-if="!result.matches.length" class="regex-empty">未找到匹配</p><ol v-else class="regex-match-list"><li v-for="(match, index) in result.matches" :key="index"><div class="regex-match-heading"><strong>匹配 {{ index + 1 }}</strong><span>索引 {{ match.index }} → {{ match.end }}<span v-if="match.index === match.end"> · 零宽匹配</span></span></div><dl><div><dt>第 0 组</dt><dd :title="match.text">{{ captureText(match.text) }}</dd></div><div v-for="(capture, captureIndex) in match.captures" :key="captureIndex"><dt>第 {{ captureIndex + 1 }} 组</dt><dd :class="{ 'regex-unmatched': capture === null }" :title="capture ?? undefined">{{ captureText(capture) }}</dd></div><div v-for="(value, name) in match.groups" :key="name"><dt :title="String(name)">{{ name }}</dt><dd :class="{ 'regex-unmatched': value === null }" :title="value ?? undefined">{{ captureText(value) }}</dd></div></dl></li></ol></section>
      <section class="regex-result-section" aria-label="正则替换结果"><div class="regex-output-heading"><h3>替换结果 <small v-if="result.replacedText !== null">{{ result.replacedText.length.toLocaleString() }} 个 UTF-16 代码单元</small></h3><button type="button" class="utility-button" :disabled="!canCopy" @click="copy">复制替换结果</button></div><p v-if="result.replacementWarning" class="regex-warning" role="status">{{ result.replacementWarning }}</p><label v-else class="regex-field"><span class="regex-sr-only">正则替换结果</span><textarea :value="result.replacedText ?? ''" aria-label="正则替换结果" rows="6" readonly spellcheck="false"></textarea></label></section>
    </template>
    <p v-if="notice" class="regex-notice" role="status">{{ notice }}</p>
  </section>
</template>
