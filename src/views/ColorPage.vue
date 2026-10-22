<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { namedColors } from '../data/namedColors'
import { hexToColor, previewTextColor, rgbToColor } from '../utils/color'
import type { ColorValue } from '../utils/color'

const channels = reactive({ r: '255', g: '180', b: '0' })
const hexInput = ref('#CC00FF')
const rgbResult = ref<ColorValue | null>(rgbToColor('255', '180', '0'))
const hexResult = ref<ColorValue | null>(hexToColor('#CC00FF'))
const preview = ref<ColorValue>(rgbResult.value!)
const selectedName = ref('')
const rgbError = ref('')
const hexError = ref('')
const search = ref('')
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(noticeTimer))

const colors = namedColors.map(color => ({ ...color, value: hexToColor(color.hex) }))
const filteredColors = computed(() => {
  const query = search.value.trim().toLowerCase().replace(/\s/g, '')
  if (!query) return colors
  return colors.filter(color => [color.name, color.label, color.hex, color.value.rgb, color.value.css]
    .some(text => text.toLowerCase().replace(/\s/g, '').includes(query)))
})

function convertRgb() {
  rgbError.value = ''
  try {
    const color = rgbToColor(channels.r, channels.g, channels.b)
    rgbResult.value = color
    preview.value = color
    selectedName.value = ''
  } catch (error) { rgbResult.value = null; rgbError.value = (error as Error).message }
}
function convertHex() {
  hexError.value = ''
  try {
    const color = hexToColor(hexInput.value)
    hexResult.value = color
    preview.value = color
    selectedName.value = ''
  } catch (error) { hexResult.value = null; hexError.value = (error as Error).message }
}
function selectColor(hex: string, name = '') {
  const color = hexToColor(hex)
  channels.r = String(color.r)
  channels.g = String(color.g)
  channels.b = String(color.b)
  hexInput.value = color.hex
  rgbResult.value = color
  hexResult.value = color
  preview.value = color
  selectedName.value = name
  rgbError.value = ''
  hexError.value = ''
}
function pick(event: Event) {
  selectColor((event.target as HTMLInputElement).value)
}
async function copy(value: string) {
  clearTimeout(noticeTimer)
  try { await navigator.clipboard.writeText(value); notice.value = '已复制 ' + value }
  catch { notice.value = '复制失败，请选中结果后按 Ctrl+C' }
  noticeTimer = setTimeout(() => { notice.value = '' }, 2200)
}
</script>

<template>
  <main class="encoding-page color-page">
    <header class="encoding-header"><div><h1>颜色转换</h1><p>RGB 与十六进制颜色码互转 · 标准 CSS 颜色参考</p></div><span class="encoding-local"><i></i>本地转换 · 无需联网</span></header>
    <section class="color-converter-grid" aria-label="RGB 与十六进制转换">
      <form class="color-converter-card" novalidate @submit.prevent="convertRgb">
        <div class="color-card-heading"><h2>RGB → 十六进制</h2><span>RGB TO HEX</span></div>
        <p class="tool-explanation">输入红、绿、蓝三个通道的整数值，范围 0–255。</p>
        <div class="color-rgb-inputs">
          <label v-for="(channel, key) in { r: '红色', g: '绿色', b: '蓝色' }" :key="key">
            <span><i :class="`channel-dot ${key}`"></i>{{ key.toUpperCase() }} <small>{{ channel }}</small></span>
            <input v-model="channels[key]" :aria-label="`RGB ${key.toUpperCase()}`" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" :aria-invalid="!!rgbError" @input="rgbError = ''" />
          </label>
        </div>
        <button type="submit" class="utility-button primary">转换为 HEX</button>
        <p v-if="rgbError" class="tool-error" role="alert">{{ rgbError }}</p>
        <div v-if="rgbResult" class="color-conversion-result">
          <span class="result-color-swatch" :style="{ backgroundColor: rgbResult.hex }" role="img" :aria-label="`RGB 转换颜色预览 ${rgbResult.hex}`"></span>
          <label>十六进制颜色码<input :value="rgbResult.hex" aria-label="RGB 转换 HEX 结果" readonly /></label>
          <button type="button" class="utility-button" @click="copy(rgbResult.hex)">复制 HEX</button>
        </div>
      </form>
      <form class="color-converter-card" novalidate @submit.prevent="convertHex">
        <div class="color-card-heading"><h2>十六进制 → RGB</h2><span>HEX TO RGB</span></div>
        <p class="tool-explanation">支持 #RRGGBB 和 #RGB 简写，# 可省略，大小写均可。</p>
        <label class="color-hex-input"><span>HEX <small>十六进制颜色码</small></span><input v-model="hexInput" aria-label="十六进制颜色码" type="text" autocomplete="off" spellcheck="false" placeholder="#CC00FF" :aria-invalid="!!hexError" @input="hexError = ''" /></label>
        <button type="submit" class="utility-button primary">转换为 RGB</button>
        <p v-if="hexError" class="tool-error" role="alert">{{ hexError }}</p>
        <div v-if="hexResult" class="color-conversion-result">
          <span class="result-color-swatch" :style="{ backgroundColor: hexResult.hex }" role="img" :aria-label="`HEX 转换颜色预览 ${hexResult.hex}`"></span>
          <label>RGB 颜色值<input :value="hexResult.rgb" aria-label="HEX 转换 RGB 结果" readonly /></label>
          <button type="button" class="utility-button" @click="copy(hexResult.css)">复制 RGB</button>
        </div>
      </form>
    </section>

    <section class="color-preview-panel" aria-label="当前颜色预览">
      <div class="color-preview-block" :style="{ backgroundColor: preview.hex, color: previewTextColor(preview) }"><span>{{ preview.hex }}</span><small>Aa · 颜色预览</small></div>
      <div class="color-preview-details"><h2>{{ selectedName || '当前颜色' }}</h2><span>{{ preview.css }}</span><p>转换成功或点击下方色块时更新预览</p></div>
      <label class="color-picker-label"><input :value="preview.hex" type="color" aria-label="颜色选择器" @input="pick" /><span>选择颜色</span></label>
      <button type="button" class="utility-button" @click="copy(preview.css)">复制 CSS</button>
    </section>

    <section class="color-reference" aria-labelledby="color-reference-title">
      <div class="color-reference-heading"><div><h2 id="color-reference-title">颜色码对照表 <span class="count-badge">{{ filteredColors.length }} / {{ colors.length }}</span></h2><p>点击色块填入转换区 · 包含 CSS 标准颜色及同色别名</p></div><div class="color-search"><input v-model="search" aria-label="搜索颜色" type="search" placeholder="搜索英文名 / 中文 / HEX / RGB" autocomplete="off" spellcheck="false" /><button v-if="search" type="button" class="text-button" @click="search = ''">清除搜索</button></div></div>
      <div class="color-table-scroll">
        <table class="color-table">
          <caption class="color-sr-only">CSS 命名颜色，列出色块、英文名称、中文描述、十六进制及 RGB 值</caption>
          <thead><tr><th scope="col" class="swatch-column">颜色</th><th scope="col">英文代码</th><th scope="col">中文描述</th><th scope="col">十六进制</th><th scope="col">RGB</th></tr></thead>
          <tbody><tr v-for="color in filteredColors" :key="color.name" :class="{ 'selected-color-row': selectedName === color.name }" :data-color-name="color.name">
            <td class="swatch-column"><button type="button" class="reference-color-swatch" :style="{ backgroundColor: color.hex }" :aria-label="`选择 ${color.name} ${color.hex}`" :title="`填入 ${color.name} · ${color.hex}`" @click="selectColor(color.hex, color.name)"></button></td>
            <th scope="row">{{ color.name }}</th><td>{{ color.label }}</td><td class="color-code-cell">{{ color.hex }}</td><td class="color-code-cell">{{ color.value.rgb }}</td>
          </tr><tr v-if="!filteredColors.length"><td colspan="5" class="color-empty">没有匹配的颜色，请尝试其他名称或颜色码。</td></tr></tbody>
        </table>
      </div>
    </section>
    <footer class="encoding-page-footer">KIKYO TOOLS <span>RGB 0–255 · HEX #RRGGBB · 不含透明度</span></footer>
    <Transition name="toast"><div v-if="notice" class="toast-message" role="status">{{ notice }}</div></Transition>
  </main>
</template>
