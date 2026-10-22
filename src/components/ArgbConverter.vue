<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { alphaHexToColor, argbToColor, hexToColor, integerToArgb } from '../utils/color'
import type { ArgbColor } from '../utils/color'

const emit = defineEmits<{ copy: [value: string] }>()
type Source = 'channels' | 'argb' | 'rgba' | 'integer'
const channels = reactive({ r: '255', g: '255', b: '255', a: '25' })
const result = ref(argbToColor('25', '255', '255', '255'))
const argb = ref(result.value.argb)
const rgba = ref(result.value.rgba)
const integer = ref(result.value.unsigned)
const error = ref('')
const invalidSource = ref<Source | null>(null)
const percentage = computed(() => (result.value.a / 255 * 100).toFixed(1) + '%')

function commit(color: ArgbColor, source?: Source) {
  result.value = color
  if (source !== 'channels') {
    channels.r = String(color.r)
    channels.g = String(color.g)
    channels.b = String(color.b)
    channels.a = String(color.a)
  }
  if (source !== 'argb') argb.value = color.argb
  if (source !== 'rgba') rgba.value = color.rgba
  if (source !== 'integer') integer.value = color.unsigned
  error.value = ''
  invalidSource.value = null
}
function update(source: Source, normalize = false) {
  try {
    const color = source === 'channels' ? argbToColor(channels.a, channels.r, channels.g, channels.b)
      : source === 'integer' ? integerToArgb(integer.value)
      : alphaHexToColor(source === 'argb' ? argb.value : rgba.value, source)
    commit(color, normalize ? undefined : source)
  } catch (failure) {
    invalidSource.value = source
    error.value = (failure as Error).message
  }
}
function setRgb(hex: string) {
  const rgb = hexToColor(hex)
  // Color picker and named colors change RGB while preserving the last valid alpha.
  commit(argbToColor(String(result.value.a), String(rgb.r), String(rgb.g), String(rgb.b)))
}
function pick(event: Event) { setRgb((event.target as HTMLInputElement).value) }
defineExpose({ setRgb })
</script>

<template>
  <section class="argb-tool" aria-label="ARGB 与 32 位整数转换">
    <p class="argb-introduction">输入任意一组数值，其他格式自动联动。整数按 <code>0xAARRGGBB</code> 打包，A=0 为全透明，A=255 为不透明。</p>
    <div class="argb-converter-grid">
      <form class="color-converter-card" novalidate @submit.prevent="update('channels', true)">
        <div class="color-card-heading"><h2>RGBA 通道</h2><span>0–255</span></div>
        <div class="argb-channel-inputs">
          <label v-for="(label, key) in { r: '红色', g: '绿色', b: '蓝色', a: '透明度' }" :key="key"><span><i :class="`channel-dot ${key}`"></i>{{ key.toUpperCase() }} <small>{{ label }}</small></span><input v-model="channels[key]" :aria-label="`ARGB ${key.toUpperCase()} 通道`" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" :aria-invalid="invalidSource === 'channels'" @input="update('channels')" @blur="update('channels', true)" /></label>
        </div>
        <p class="tool-field-hint">每个通道均为 0–255 的整数；A 为 8 位透明度。</p>
      </form>
      <form class="color-converter-card" novalidate @submit.prevent>
        <div class="color-card-heading"><h2>十六进制颜色码</h2><span>HEX</span></div>
        <label class="argb-format-field"><span>#ARGB <small>Alpha 在前 · #AARRGGBB</small></span><div><input v-model="argb" aria-label="ARGB 十六进制" type="text" autocomplete="off" spellcheck="false" :aria-invalid="invalidSource === 'argb'" @input="update('argb')" @blur="update('argb', true)" @keydown.enter.prevent="update('argb', true)" /><button type="button" class="utility-button" @click="emit('copy', result.argb)">复制 ARGB</button></div></label>
        <label class="argb-format-field"><span>#RGBA <small>Alpha 在后 · #RRGGBBAA</small></span><div><input v-model="rgba" aria-label="RGBA 十六进制" type="text" autocomplete="off" spellcheck="false" :aria-invalid="invalidSource === 'rgba'" @input="update('rgba')" @blur="update('rgba', true)" @keydown.enter.prevent="update('rgba', true)" /><button type="button" class="utility-button" @click="emit('copy', result.rgba)">复制 RGBA</button></div></label>
        <p class="tool-field-hint">可省略 #，支持 4 位简写；CSS 的 8 位 HEX 使用 RGBA 顺序。</p>
      </form>
      <form class="color-converter-card" novalidate @submit.prevent="update('integer', true)">
        <div class="color-card-heading"><h2>32 位整数</h2><span>ARGB ↔ INT</span></div>
        <label class="argb-format-field"><span>整数输入 <small>有符号 / 无符号</small></span><input v-model="integer" aria-label="ARGB 整数输入" type="text" inputmode="text" autocomplete="off" spellcheck="false" :aria-invalid="invalidSource === 'integer'" @input="update('integer')" @blur="update('integer', true)" /></label>
        <label class="argb-format-field argb-integer-result"><span>int32 <small>有符号</small></span><div><input :value="result.signed" aria-label="ARGB 有符号整数" type="text" readonly /><button type="button" class="utility-button" @click="emit('copy', result.signed)">复制 int32</button></div></label>
        <label class="argb-format-field argb-integer-result"><span>uint32 <small>无符号</small></span><div><input :value="result.unsigned" aria-label="ARGB 无符号整数" type="text" readonly /><button type="button" class="utility-button" @click="emit('copy', result.unsigned)">复制 uint32</button></div></label>
      </form>
    </div>
    <p v-if="error" class="tool-error argb-error" role="alert">{{ error }}。其他字段及预览保留最近一次有效颜色。</p>
    <section class="argb-preview-panel" aria-label="透明颜色预览">
      <div class="alpha-checkerboard" role="img" :aria-label="`透明颜色 ${result.rgba}，不透明度 ${percentage}`"><div :style="{ backgroundColor: result.rgba }"></div><span>A = {{ result.a }}</span></div>
      <div class="argb-preview-details"><h2>透明度预览 <small>{{ percentage }}</small></h2><label>Alpha <input v-model="channels.a" aria-label="Alpha 透明度滑块" type="range" min="0" max="255" step="1" @input="update('channels')" /></label><span>{{ result.css }}</span></div>
      <label class="color-picker-label"><input :value="result.hex" type="color" aria-label="ARGB 颜色选择器" @input="pick" /><span>选择 RGB</span></label>
      <button type="button" class="utility-button" @click="emit('copy', result.css)">复制 RGBA CSS</button>
    </section>
    <p class="tool-explanation argb-explanation">int32：-2147483648 到 2147483647；uint32：0 到 4294967295。两者表示相同的 32 位位模式，例如不透明白色是 int32 = -1 / uint32 = 4294967295。下方色块只更改 RGB，保留当前透明度。</p>
  </section>
</template>
