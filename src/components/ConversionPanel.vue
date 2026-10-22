<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import type { CalculationResult, ConversionField } from '../types/calculator'

const props = defineProps<{
  result: CalculationResult | null
  error: string
  convert: (value: string, field: ConversionField) => Promise<boolean>
}>()
const fields = [
  { key: 'decimal', label: '十进制', tag: 'DEC', editable: true, title: '有符号 64 位整数或浮点数' },
  { key: 'hex', label: '十六进制', tag: 'HEX', editable: true, title: '64 位补码，可输入 0x 前缀或 h 后缀' },
  { key: 'octal', label: '八进制', tag: 'OCT', editable: true, title: '64 位补码，可输入 0o 前缀' },
  { key: 'binary', label: '二进制', tag: 'BIN', editable: true, title: '64 位补码，可输入 0b 前缀' },
  { key: 'float32', label: '浮点数', tag: 'F32', editable: true, title: 'IEEE 754 单精度数值转换（不是位解释）' },
  { key: 'float64', label: '双精度', tag: 'F64', editable: true, title: 'IEEE 754 双精度数值转换（不是位解释）' },
  { key: 'ascii', label: 'ASCII', tag: '7BIT', editable: false, title: 'ASCII 字符，控制字符以转义形式显示' },
  { key: 'ebcdic', label: 'EBCDIC', tag: '037', editable: false, title: 'IBM037 代码页字符' },
  { key: 'unicode', label: 'UNICODE', tag: 'UTF', editable: false, title: 'Unicode 码点对应的字符' },
] as const
const drafts = reactive<Record<string, string>>({})
const dirty = reactive<Record<string, boolean>>({})
const invalid = ref<string | null>(null)
const pending = ref(false)
let skipBlur: string | null = null

watch(() => props.result, result => {
  for (const field of fields) {
    if (!dirty[field.key]) drafts[field.key] = result?.[field.key] ?? ''
  }
}, { immediate: true })

async function submit(field: ConversionField) {
  if (skipBlur === field) { skipBlur = null; return }
  if (!dirty[field] || pending.value) return
  const submitted = drafts[field] ?? ''
  pending.value = true
  const valid = await props.convert(submitted, field)
  pending.value = false
  await nextTick()
  // Preserve further typing while the previous conversion was in flight.
  if (drafts[field] !== submitted) return
  invalid.value = valid ? null : field
  if (valid) {
    dirty[field] = false
    drafts[field] = props.result?.[field] ?? ''
  }
}
function cancel(field: string, event: KeyboardEvent) {
  event.stopPropagation()
  drafts[field] = props.result?.[field as ConversionField] ?? ''
  dirty[field] = false
  invalid.value = null
  skipBlur = field
  const input = event.target as HTMLInputElement
  input.blur()
}
</script>

<template>
  <section class="conversion-panel" aria-labelledby="conversion-title" :aria-busy="pending">
    <div class="section-heading"><h2 id="conversion-title">底数转换</h2><span class="section-note">64 BIT</span></div>
    <div class="conversion-fields">
      <label v-for="field in fields" :key="field.key" class="conversion-row" :title="field.title">
        <span class="conversion-label">{{ field.label }}</span>
        <div class="conversion-input-wrap">
          <input v-model="drafts[field.key]" :aria-label="field.label" :data-conversion="field.key"
            :readonly="!field.editable" :aria-invalid="invalid === field.key"
            :class="{ invalid: invalid === field.key }" spellcheck="false" autocomplete="off"
            :placeholder="result ? '—' : ''" @input="dirty[field.key] = true; invalid = null"
            @blur="field.editable && submit(field.key as ConversionField)"
            @keydown.enter.prevent="field.editable && submit(field.key as ConversionField)"
            @keydown.esc="cancel(field.key, $event)" />
          <span class="field-tag" aria-hidden="true">{{ field.tag }}</span>
        </div>
      </label>
    </div>
    <p v-if="error && invalid" class="conversion-error" role="alert">{{ error }}</p>
    <p class="conversion-hint">编辑数值后按 Enter 转换 <span>↵</span></p>
  </section>
</template>
