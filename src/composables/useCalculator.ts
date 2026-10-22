import { computed, ref, watch } from 'vue'
import { calculate, convertBase, desktopAvailable } from '../services/calculator'
import type { AngleMode, CalculationResult, ConversionField, HistoryEntry } from '../types/calculator'

const STORAGE_KEY = 'kikyo.calculator.v1'
const MAX_HISTORY = 100

function isResult(value: unknown): value is CalculationResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<CalculationResult>
  return ['integer', 'float'].includes(result.kind ?? '') &&
    ['decimal', 'hex', 'octal', 'binary', 'float32', 'float64', 'ascii', 'ebcdic', 'unicode']
      .every(key => typeof result[key as keyof CalculationResult] === 'string')
}

function loadState(): { history: HistoryEntry[]; variables: Record<string, string>; angleMode: AngleMode } {
  const empty = { history: [], variables: {}, angleMode: 'deg' as AngleMode }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const state = JSON.parse(raw)
    if (state.version !== 1) return empty
    const history = Array.isArray(state.history) ? state.history.filter((item: HistoryEntry) =>
      item && typeof item.id === 'string' && typeof item.expression === 'string' &&
      typeof item.time === 'number' && isResult(item.result)).slice(0, MAX_HISTORY) : []
    const variables: Record<string, string> = Object.create(null)
    if (state.variables && typeof state.variables === 'object') {
      for (const [name, value] of Object.entries(state.variables)) {
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && typeof value === 'string') variables[name] = value
      }
    }
    return { history, variables, angleMode: state.angleMode === 'rad' ? 'rad' : 'deg' }
  } catch { return empty }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function groupBinary(value: string) {
  if (!/^[01]+$/.test(value)) return value
  return value.replace(/\B(?=(\d{4})+(?!\d))/g, ' ')
}

export function useCalculator() {
  const saved = loadState()
  const expression = ref(saved.history[0]?.expression ?? '0x44 >> 2')
  const result = ref<CalculationResult | null>(saved.history[0]?.result ?? null)
  const conversion = ref<CalculationResult | null>(saved.history[0]?.result ?? null)
  const history = ref<HistoryEntry[]>(saved.history)
  const variables = ref<Record<string, string>>(saved.variables)
  const angleMode = ref<AngleMode>(saved.angleMode)
  const busy = ref(false)
  const error = ref('')
  const conversionError = ref('')
  const notice = ref('')
  const storageError = ref(false)
  let calculationId = 0
  let conversionId = 0
  let noticeTimer: ReturnType<typeof setTimeout> | undefined

  const userVariables = computed(() => Object.entries(variables.value).filter(([name]) => name !== 'ans'))
  const binary = computed(() => groupBinary(result.value?.binary ?? '—'))

  watch([history, variables, angleMode], () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1, history: history.value, variables: variables.value, angleMode: angleMode.value,
      }))
      storageError.value = false
    } catch { storageError.value = true }
  }, { deep: true })

  function showNotice(message: string) {
    notice.value = message
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => { notice.value = '' }, 2200)
  }

  async function run() {
    if (busy.value || !expression.value.trim()) return
    const source = expression.value
    const current = ++calculationId
    conversionId++
    busy.value = true
    error.value = ''
    conversionError.value = ''
    try {
      const next = await calculate(source, { ...variables.value }, angleMode.value)
      if (current !== calculationId) return
      result.value = next
      conversion.value = next
      variables.value = next.variables
      history.value = [{ id: crypto.randomUUID(), expression: source, result: next, time: Date.now() },
        ...history.value.filter(item => item.expression !== source)].slice(0, MAX_HISTORY)
    } catch (failure) {
      if (current === calculationId) error.value = errorMessage(failure)
    } finally { busy.value = false }
  }

  async function convert(value: string, field: ConversionField): Promise<boolean> {
    if (busy.value) { conversionError.value = '请等待当前计算完成'; return false }
    const current = ++conversionId
    conversionError.value = ''
    try {
      const next = await convertBase(value, field)
      if (current !== conversionId) return false
      conversion.value = next
      return true
    } catch (failure) {
      if (current === conversionId) conversionError.value = errorMessage(failure)
      return false
    }
  }

  function invalidate() {
    calculationId++
    conversionId++
  }

  function restore(entry: HistoryEntry) {
    invalidate()
    expression.value = entry.expression
    result.value = entry.result
    conversion.value = entry.result
    error.value = ''
    conversionError.value = ''
  }

  function clear() {
    invalidate()
    expression.value = ''
    error.value = ''
  }

  async function copy() {
    if (!result.value) { showNotice('请先计算一个结果'); return }
    try {
      await navigator.clipboard.writeText(result.value.decimal)
      showNotice('已复制计算结果')
    } catch { showNotice('复制失败，请选中结果后按 Ctrl+C') }
  }

  async function initialize() {
    if (!desktopAvailable || result.value) return
    await run()
  }

  return {
    expression, result, conversion, history, variables, userVariables, angleMode, busy, error,
    conversionError, notice, storageError, binary, run, convert, restore, clear, copy, initialize,
    desktopAvailable, clearHistory: () => { history.value = [] },
    clearVariables: () => { invalidate(); variables.value = {} },
  }
}
