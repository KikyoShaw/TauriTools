<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import TimestampTool from '../components/TimestampTool.vue'
import { transformText } from '../utils/encoding'
import type { CodecId, CodecOptions } from '../utils/encoding'

const tools = [
  { id: 'unicode', label: 'Unicode 编码', title: 'Unicode 编码 / 解码', hint: '文本与 \\uXXXX 转义互转，支持中文和 Emoji。ASCII 模式会保留英文、数字和标点。', encode: 'ASCII 转 Unicode', decode: 'Unicode 转 ASCII', sample: '你好，世界！Hello 👋' },
  { id: 'utf8', label: 'UTF-8 编码', title: 'UTF-8 编码 / 解码', hint: '将文本转换为 UTF-8 字节，每个字节用两个十六进制字符表示。解码支持空格、0x 和 \\x 格式。', encode: 'UTF-8 编码', decode: 'UTF-8 解码', sample: '中文 UTF-8 🌏' },
  { id: 'url', label: 'URL 编码/解码', title: 'URL 编码 / 解码', hint: 'URL 参数模式适合单个参数；完整 URL 模式保留路径分隔符；表单模式使用 + 表示空格。', encode: 'URL 编码', decode: 'URL 解码', sample: 'https://example.com/search?q=中文 &name=Kikyo' },
  { id: 'timestamp', label: 'Unix 时间戳', title: 'Unix 时间戳', hint: '', encode: '', decode: '', sample: '' },
  { id: 'native', label: 'ASCII / Native', title: 'ASCII / Native 编码互转', hint: '与 native2ascii 相同，将非 ASCII 的 UTF-16 代码单元写为 \\uXXXX，保留 ASCII 内容。', encode: 'Native 转 ASCII', decode: 'ASCII 转 Native', sample: 'name=桔梗\nmessage=Hello 世界' },
  { id: 'hex', label: 'Hex 编码/解码', title: 'Hex 编码 / 解码', hint: '文本按 UTF-8 转为连续十六进制字节。解码按严格 UTF-8 解释，非法字节会显示错误。', encode: 'Hex 编码', decode: 'Hex 解码', sample: 'Hello, 桔梗！' },
  { id: 'html', label: 'HTML 编码/解码', title: 'HTML 实体编码 / 解码', hint: '转义 &、<、>、引号，并还原命名实体或数字实体。结果以纯文本显示。', encode: 'HTML 编码', decode: 'HTML 解码', sample: '<div title="你好">Tom & Jerry</div>' },
  { id: 'base64', label: 'Base64', title: 'Base64 编码 / 解码', hint: '以 UTF-8 文本进行 Base64 转换，可选择 URL 安全字符集（- 和 _）。', encode: 'Base64 编码', decode: 'Base64 解码', sample: 'Kikyo 工具箱 🔧' },
  { id: 'base', label: 'Base 编码/解码', title: 'Base 编码 / 解码', hint: '支持 Base16、RFC 4648 Base32 和 Bitcoin 字符集 Base58。输入与输出均为 UTF-8 文本。', encode: '编码', decode: '解码', sample: 'Hello World' },
] as const

type ToolId = typeof tools[number]['id']
const active = ref<ToolId>('unicode')
const tool = computed(() => tools.find(item => item.id === active.value)!)
const drafts = reactive(Object.fromEntries(tools.map(item => [item.id, { input: '', output: '', error: '', action: '' }])) as Record<ToolId, { input: string; output: string; error: string; action: string }>)
const current = computed(() => drafts[active.value])
const options = reactive<CodecOptions>({ urlMode: 'component', base64UrlSafe: false, baseVariant: 'base32' })
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(noticeTimer))

function apply(action: 'encode' | 'decode', codec?: CodecId, label?: string) {
  current.value.error = ''
  current.value.action = ''
  try {
    current.value.output = transformText(codec ?? active.value as CodecId, action, current.value.input, options)
    current.value.action = label ?? (action === 'encode' ? tool.value.encode : tool.value.decode)
  } catch (error) {
    current.value.output = ''
    current.value.error = error instanceof Error ? error.message : String(error)
  }
}
async function copy(value: string) {
  try { await navigator.clipboard.writeText(value); notify('已复制结果') }
  catch { notify('复制失败，请选中结果后按 Ctrl+C') }
}
function notify(message: string) {
  notice.value = message
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 2000)
}
function swap() {
  const source = current.value.input
  current.value.input = current.value.output
  current.value.output = source
  current.value.error = ''
  current.value.action = ''
}
function clear() {
  current.value.input = ''
  current.value.output = ''
  current.value.error = ''
  current.value.action = ''
}
function inputKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    apply(event.shiftKey ? 'decode' : 'encode')
  }
}
function navigate(event: KeyboardEvent) {
  const index = tools.findIndex(item => item.id === active.value)
  let next: number
  if (event.key === 'ArrowRight') next = (index + 1) % tools.length
  else if (event.key === 'ArrowLeft') next = (index + tools.length - 1) % tools.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = tools.length - 1
  else return
  event.preventDefault()
  active.value = tools[next]!.id
  document.getElementById(`codec-tab-${active.value}`)?.focus()
}
</script>

<template>
  <main class="encoding-page">
    <header class="encoding-header"><div><h1>编码工具</h1><p>常用编码、文本转换与时间工具</p></div><span class="encoding-local"><i></i>本地转换 · 无需联网</span></header>
    <nav class="codec-tabs" role="tablist" aria-label="编码工具分类" @keydown="navigate">
      <button v-for="item in tools" :id="`codec-tab-${item.id}`" :key="item.id" type="button" role="tab"
        :aria-selected="active === item.id" :aria-controls="`codec-panel-${item.id}`" :tabindex="active === item.id ? 0 : -1"
        :class="{ active: active === item.id }" @click="active = item.id">{{ item.label }}</button>
    </nav>
    <section :id="`codec-panel-${active}`" class="encoding-panel" role="tabpanel" :aria-labelledby="`codec-tab-${active}`">
      <KeepAlive><TimestampTool v-if="active === 'timestamp'" @copy="copy" /></KeepAlive>
      <template v-if="active !== 'timestamp'">
        <div class="codec-description"><h2>{{ tool.title }}</h2><button class="text-button" type="button" @click="current.input = tool.sample; current.error = ''">填入示例</button></div>
        <p class="tool-explanation">{{ tool.hint }}</p>
        <div v-if="active === 'url' || active === 'base64' || active === 'base'" class="tool-options">
          <label v-if="active === 'url'">编码模式 <select v-model="options.urlMode" aria-label="URL 编码模式"><option value="component">URL 参数 · encodeURIComponent</option><option value="uri">完整 URL · encodeURI</option><option value="form">表单 · application/x-www-form-urlencoded</option></select></label>
          <label v-if="active === 'base64'" class="checkbox-option"><input v-model="options.base64UrlSafe" type="checkbox" aria-label="Base64 URL 安全模式" />URL 安全模式（无填充）</label>
          <label v-if="active === 'base'">编码类型 <select v-model="options.baseVariant" aria-label="Base 编码类型"><option value="base16">Base16</option><option value="base32">Base32 · RFC 4648</option><option value="base58">Base58 · Bitcoin</option></select></label>
        </div>
        <div class="codec-editors">
          <label class="codec-editor"><span class="codec-editor-heading">输入内容 <small>{{ current.input.length.toLocaleString() }} 字符</small></span><textarea v-model="current.input" aria-label="编码输入内容" placeholder="请把你需要转换的内容粘贴在这里" spellcheck="false" @input="current.error = ''" @keydown="inputKeydown"></textarea></label>
          <label class="codec-editor"><span class="codec-editor-heading">转换结果 <small>{{ current.output.length.toLocaleString() }} 字符</small></span><textarea :value="current.output" aria-label="编码转换结果" placeholder="转换后的结果" spellcheck="false" readonly></textarea></label>
        </div>
        <p v-if="current.error" class="tool-error" role="alert">{{ current.error }}</p>
        <div v-else class="codec-operation-status" role="status">{{ current.action ? current.action + '完成' : '输入内容，选择下方操作' }}</div>
        <div class="codec-actions">
          <div class="codec-primary-actions">
            <button type="button" class="utility-button primary" @click="apply('encode')">{{ tool.encode }}</button>
            <button type="button" class="utility-button primary" @click="apply('decode')">{{ tool.decode }}</button>
            <template v-if="active === 'unicode'">
              <button type="button" class="utility-button" @click="apply('decode', 'unicode', 'Unicode 转中文')">Unicode 转中文</button>
              <button type="button" class="utility-button" @click="apply('encode', 'native', '中文转 Unicode')">中文转 Unicode</button>
            </template>
          </div>
          <div class="codec-secondary-actions">
            <button type="button" class="utility-button" :disabled="!current.output" @click="copy(current.output)">复制结果</button>
            <button type="button" class="utility-button" :disabled="!current.output" @click="swap">交换内容</button>
            <button type="button" class="utility-button subtle" @click="clear">清空内容</button>
          </div>
        </div>
        <div class="codec-footer"><span>Ctrl + Enter 编码 <span class="heading-dot">·</span> Ctrl + Shift + Enter 解码</span><span>切换工具保留当前内容</span></div>
      </template>
    </section>
    <footer class="encoding-page-footer">KIKYO TOOLS <span>编码规则明确，结果以纯文本呈现</span></footer>
    <Transition name="toast"><div v-if="notice" class="toast-message" role="status">{{ notice }}</div></Transition>
  </main>
</template>
