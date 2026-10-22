<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import CalculatorKeypad from './components/CalculatorKeypad.vue'
import ConversionPanel from './components/ConversionPanel.vue'
import { useCalculator } from './composables/useCalculator'

const {
  expression, result, conversion, history, userVariables, angleMode, busy, error,
  conversionError, notice, storageError, binary, run, convert, restore, clear, copy,
  initialize, desktopAvailable, clearHistory, clearVariables,
} = useCalculator()
const editor = ref<HTMLTextAreaElement | null>(null)
const showHelp = ref(false)

async function insert(value: string) {
  const input = editor.value
  const start = input?.selectionStart ?? expression.value.length
  const end = input?.selectionEnd ?? start
  const selected = expression.value.slice(start, end)
  const isFunction = value.endsWith('()')
  const inserted = isFunction && selected ? value.slice(0, -1) + selected + ')' : value
  expression.value = expression.value.slice(0, start) + inserted + expression.value.slice(end)
  error.value = ''
  await nextTick()
  input?.focus()
  const position = start + inserted.length - (isFunction && !selected ? 1 : 0)
  input?.setSelectionRange(position, position)
}
async function backspace() {
  const input = editor.value
  const start = input?.selectionStart ?? expression.value.length
  const end = input?.selectionEnd ?? start
  // Array.from removes a complete Unicode code point rather than half a surrogate pair.
  const before = expression.value.slice(0, start)
  const remove = start === end ? Array.from(before).pop()?.length ?? 0 : 0
  expression.value = expression.value.slice(0, start - remove) + expression.value.slice(end)
  await nextTick()
  input?.focus()
  input?.setSelectionRange(start - remove, start - remove)
}
function action(name: string) {
  if (name === 'backspace') void backspace()
  if (name === 'clear') { clear(); editor.value?.focus() }
  if (name === 'copy') void copy()
  if (name === 'run') void run()
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void run()
  }
  if (event.key === 'Escape') { event.preventDefault(); clear() }
}
function timeLabel(time: number) {
  return new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
onMounted(async () => {
  await initialize()
  editor.value?.focus()
  const end = expression.value.length
  editor.value?.setSelectionRange(end, end)
})
</script>

<template>
  <div class="app-shell">
    <main class="workspace">
      <header class="workspace-header">
        <div class="app-identity"><span class="app-mark" aria-hidden="true">&gt;_</span><h1>程序员计算器</h1><span class="version-label">KIKYO</span></div>
        <div class="header-tools">
          <span class="integer-badge" title="有符号 64 位整数，溢出时提示错误">INT64</span>
          <div class="angle-switch" role="group" aria-label="角度单位">
            <button :class="{ selected: angleMode === 'deg' }" :aria-pressed="angleMode === 'deg'" @click="angleMode = 'deg'">DEG</button>
            <button :class="{ selected: angleMode === 'rad' }" :aria-pressed="angleMode === 'rad'" @click="angleMode = 'rad'">RAD</button>
          </div>
          <button class="help-button" :aria-expanded="showHelp" title="表达式语法与快捷键" @click="showHelp = !showHelp">?</button>
        </div>
      </header>

      <div v-if="!desktopAvailable" class="preview-banner">界面预览模式 · 使用 <code>npm run tauri dev</code> 启动桌面计算器</div>
      <section class="expression-section" aria-labelledby="expression-title">
        <div class="editor-heading"><h2 id="expression-title">表达式</h2><span>EXPRESSION <span class="heading-dot">/</span> {{ angleMode.toUpperCase() }}</span></div>
        <div class="expression-editor" :class="{ 'has-error': error }">
          <textarea ref="editor" v-model="expression" aria-label="计算表达式" spellcheck="false" autocapitalize="off" autocomplete="off"
            placeholder="输入表达式，如 0x44 >> 2" @keydown="keydown" @input="error = ''"></textarea>
          <div class="expression-output" aria-live="polite" :class="{ 'error-output': error }">
            <template v-if="error"><span class="output-marker">!!!</span><span role="alert">{{ error }}</span></template>
            <template v-else-if="result"><span class="output-marker">&lt;&lt;&lt;</span><span>结果 = <strong data-testid="result-decimal">{{ result.decimal }}</strong><span v-if="result.hex !== '—'" class="result-hex"> [{{ result.hex }}h]</span></span></template>
            <template v-else><span class="output-marker">&lt;&lt;&lt;</span><span class="output-placeholder">{{ desktopAvailable ? '等待计算' : '桌面端运行后显示结果' }}</span></template>
          </div>
          <div class="editor-bottom"><span>{{ expression.split('\n').length }} 行</span><span>Shift + Enter 换行 <span class="heading-dot">·</span> Enter 运行 ↵</span></div>
        </div>
      </section>

      <section class="result-strip" aria-label="结果进制表示">
        <div class="base-result"><span>十进制</span><strong>{{ result?.decimal ?? '—' }}</strong></div>
        <div class="base-result hex-result"><span>十六进制</span><strong>{{ result && result.hex !== '—' ? result.hex + 'h' : '—' }}</strong></div>
        <div class="base-result"><span>八进制</span><strong>{{ result?.octal ?? '—' }}</strong></div>
        <div class="base-result binary-result"><span>二进制</span><strong :title="binary">{{ binary }}</strong></div>
      </section>

      <CalculatorKeypad :busy="busy" @insert="insert" @action="action" />

      <section v-if="showHelp" class="syntax-help" aria-label="表达式帮助">
        <div><strong>数值与位运算</strong><code>0xFF · FFh · 0b1010 · 0o77</code><span>&amp; 与 · | 或 · ^ 异或 · ~ 取反 · &lt;&lt; 左移 · &gt;&gt; 算术右移</span></div>
        <div><strong>函数与变量</strong><code>x = pow(2, 8)<br />sqrt(x) + ans</code><span>支持 pi、e、ln、min、max、floor、ceil、round</span></div>
        <div><strong>计算规则</strong><span>整数采用 64 位补码，算术溢出报错。<br />不能整除时返回小数。函数使用 DEG / RAD 设置。<br />多行执行失败时不保存该批变量。</span></div>
      </section>

      <footer class="workspace-footer">
        <span class="runtime-status"><i :class="{ inactive: !desktopAvailable }"></i>{{ desktopAvailable ? 'Rust 计算引擎' : '浏览器预览' }}<span class="footer-separator">/</span>64 位精确整数</span>
        <span v-if="storageError" class="storage-warning">本地存储不可用</span>
        <span v-else class="footer-hint">支持变量赋值与多行表达式</span>
      </footer>
    </main>

    <aside class="sidebar" aria-label="历史记录与底数转换">
      <section class="history-section" aria-labelledby="history-title">
        <div class="section-heading"><h2 id="history-title">历史记录 <span class="count-badge">{{ history.length.toString().padStart(2, '0') }}</span></h2><button class="text-button" :disabled="!history.length" @click="clearHistory">清空</button></div>
        <div class="history-list">
          <p v-if="!history.length" class="empty-state">计算记录会显示在这里</p>
          <button v-for="entry in history" :key="entry.id" class="history-entry" :title="entry.expression + '\n' + timeLabel(entry.time)" @click="restore(entry)">
            <span class="history-value">{{ entry.result.hex !== '—' ? entry.result.hex + 'h' : entry.result.decimal }}</span><span class="history-decimal">{{ entry.result.decimal }}</span>
            <span class="history-expression">{{ entry.expression }}</span>
          </button>
        </div>
      </section>
      <section class="variables-section" aria-labelledby="variables-title">
        <div class="section-heading"><h2 id="variables-title">变量</h2><button v-if="userVariables.length" class="text-button" @click="clearVariables">重置</button><span v-else class="section-note">x = …</span></div>
        <p v-if="!userVariables.length" class="empty-state">暂无</p>
        <div v-else class="variable-list">
          <button v-for="[name, value] in userVariables" :key="name" class="variable-entry" :title="'插入变量 ' + name" @click="insert(name)"><span>{{ name }}</span><span>{{ value }}</span></button>
        </div>
      </section>
      <ConversionPanel :result="conversion" :error="conversionError" :convert="convert" />
      <div class="sidebar-footer"><span>LOCAL · OFFLINE</span><span>v0.1.0</span></div>
    </aside>
    <Transition name="toast"><div v-if="notice" class="toast-message" role="status">{{ notice }}</div></Transition>
  </div>
</template>
