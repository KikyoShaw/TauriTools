<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { formatDate, parseDate, parseTimestamp, toTimestamp } from '../utils/timestamp'
import type { TimestampUnit, Timezone } from '../utils/timestamp'

const emit = defineEmits<{ copy: [value: string] }>()
const timezone = ref<Timezone>('local')
const timestampUnit = ref<TimestampUnit>('seconds')
const dateUnit = ref<TimestampUnit>('seconds')
const now = ref(new Date())
const timestampInput = ref(toTimestamp(now.value, 'seconds'))
const dateInput = ref(formatDate(now.value, 'local'))
const parsedTimestamp = ref<Date | null>(null)
const parsedDate = ref<Date | null>(null)
const timestampError = ref('')
const dateError = ref('')
const timestampResult = computed(() => parsedTimestamp.value ? formatDate(parsedTimestamp.value, timezone.value) : '')
const dateResult = computed(() => parsedDate.value ? toTimestamp(parsedDate.value, dateUnit.value) : '')
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone
let timer: ReturnType<typeof setInterval> | undefined
function stop() { clearInterval(timer); timer = undefined }
function start() { stop(); now.value = new Date(); timer = setInterval(() => { now.value = new Date() }, 1000) }
onMounted(start)
onActivated(start)
onDeactivated(stop)
onBeforeUnmount(stop)
function fromTimestamp() {
  timestampError.value = ''
  try { parsedTimestamp.value = parseTimestamp(timestampInput.value, timestampUnit.value) }
  catch (error) { parsedTimestamp.value = null; timestampError.value = (error as Error).message }
}
function fromDate() {
  dateError.value = ''
  try { parsedDate.value = parseDate(dateInput.value, timezone.value) }
  catch (error) { parsedDate.value = null; dateError.value = (error as Error).message }
}
function fillNow() {
  const value = new Date()
  timestampInput.value = toTimestamp(value, timestampUnit.value)
  dateInput.value = formatDate(value, timezone.value)
  fromTimestamp()
  fromDate()
}
</script>

<template>
  <div class="timestamp-tool">
    <div class="timestamp-live">
      <span>当前 Unix 时间戳 <strong>{{ toTimestamp(now, 'seconds') }}</strong><small>秒</small></span>
      <span class="live-date">{{ formatDate(now, timezone) }}</span>
      <button type="button" class="utility-button" @click="fillNow">填入当前时间</button>
      <button type="button" class="utility-button" @click="emit('copy', toTimestamp(now, 'seconds'))">复制当前时间戳</button>
    </div>
    <div class="tool-options timestamp-zone">
      <label>时区 <select v-model="timezone" aria-label="时间显示时区"><option value="local">本地时间 · {{ localZone }}</option><option value="utc">UTC</option></select></label>
      <span class="tool-option-hint">无时区的日期按此设置解释；带 Z 或偏移量的 ISO 日期按其自身时区解释</span>
    </div>
    <div class="timestamp-grid">
      <form class="timestamp-card" @submit.prevent="fromTimestamp">
        <h3>时间戳 → 日期时间</h3>
        <div class="timestamp-input-row"><input v-model="timestampInput" aria-label="待转换时间戳" placeholder="例如 1700000000" spellcheck="false" />
          <select v-model="timestampUnit" aria-label="输入时间戳单位"><option value="seconds">秒 (s)</option><option value="milliseconds">毫秒 (ms)</option></select></div>
        <p class="tool-field-hint">支持负数时间戳，单位由你指定</p>
        <button type="submit" class="utility-button primary">转换为日期</button>
        <p v-if="timestampError" class="tool-error" role="alert">{{ timestampError }}</p>
        <div v-if="parsedTimestamp" class="timestamp-result">
          <label>转换结果<input :value="timestampResult" aria-label="日期转换结果" readonly /></label>
          <span class="iso-result">ISO · {{ parsedTimestamp.toISOString() }}</span>
          <button type="button" class="utility-button" @click="emit('copy', timestampResult)">复制日期</button>
        </div>
      </form>
      <form class="timestamp-card" @submit.prevent="fromDate">
        <h3>日期时间 → 时间戳</h3>
        <input v-model="dateInput" aria-label="待转换日期时间" placeholder="YYYY-MM-DD HH:mm:ss" spellcheck="false" />
        <div class="tool-options date-output-options"><label>输出单位 <select v-model="dateUnit" aria-label="输出时间戳单位"><option value="seconds">秒 (s)</option><option value="milliseconds">毫秒 (ms)</option></select></label><span class="tool-option-hint">支持毫秒、ISO 8601 日期</span></div>
        <button type="submit" class="utility-button primary">转换为时间戳</button>
        <p v-if="dateError" class="tool-error" role="alert">{{ dateError }}</p>
        <div v-if="parsedDate" class="timestamp-result">
          <label>转换结果<input :value="dateResult" aria-label="时间戳转换结果" readonly /></label>
          <span class="iso-result">ISO · {{ parsedDate.toISOString() }}</span>
          <button type="button" class="utility-button" @click="emit('copy', dateResult)">复制时间戳</button>
        </div>
      </form>
    </div>
    <p class="tool-explanation">Unix 时间戳从 1970-01-01 00:00:00 UTC 起计算。秒级转换向下取整；本地夏令时回拨产生的重复时间采用较早一次，需要精确指定时可使用带时区偏移的 ISO 日期。</p>
  </div>
</template>
