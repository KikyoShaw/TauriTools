import { diffLines } from 'diff'
import { parseJson, serializeJson } from './json'
import type { JsonNode, ParsedJson } from './json'

export const MAX_DIFF_INPUT_LENGTH = 2 * 1024 * 1024
export const MAX_DIFF_LINES = 10_000

export class DiffToolError extends Error {
  constructor(message: string) { super(message); this.name = 'DiffToolError' }
}

export interface DiffRow {
  type: 'equal' | 'add' | 'remove'
  leftLine: number | null
  rightLine: number | null
  left?: string
  right?: string
  leftHasNewline?: boolean
  rightHasNewline?: boolean
  changeIndex?: number
  groupIndex?: number
}

export interface DiffResult {
  rows: DiffRow[]
  added: number
  removed: number
  equal: number
  /** Zero-based indices of every changed row and the first row of each contiguous group. */
  changedLineIndices: number[]
  groupIndices: number[]
}

export interface JsonDiffOptions { ignoreKeyOrder?: boolean }
export interface JsonDiffRow {
  type: 'added' | 'removed' | 'changed' | 'type' | 'order'
  path: string
  left?: string
  right?: string
  leftLine: number | null
  rightLine: number | null
  changeIndex: number
}
export interface JsonDiffResult {
  rows: JsonDiffRow[]
  added: number
  removed: number
  changed: number
  typeChanged: number
  orderChanged: number
}

function checkSize(value: string, side: string): void {
  if (value.length > MAX_DIFF_INPUT_LENGTH) throw new DiffToolError(`${side}内容超过 2 Mi 个字符，请缩小输入。`)
}

function countTextLines(value: string): number {
  let count = 0
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\r' || value[index] === '\n') {
      if (value[index] === '\r' && value[index + 1] === '\n') index += 1
      count += 1
      if (count > MAX_DIFF_LINES) return count
    }
  }
  return count + (value.length > 0 && !/[\r\n]$/.test(value) ? 1 : 0)
}

function textLines(value: string): { text: string; hasNewline: boolean }[] {
  if (value === '') return []
  const parts = value.replace(/\r\n?/g, '\n').split('\n')
  const endsWithNewline = parts[parts.length - 1] === ''
  if (endsWithNewline) parts.pop()
  return parts.map((text, index) => ({ text, hasNewline: index < parts.length - 1 || endsWithNewline }))
}

/** CRLF/LF/CR are equivalent. Optional whitespace normalization trims each line and
 * collapses intra-line whitespace, preserving blank lines and final-newline presence. */
export function compareTexts(left: string, right: string, ignoreWhitespace = false): DiffResult {
  checkSize(left, '左侧'); checkSize(right, '右侧')
  if (countTextLines(left) + countTextLines(right) > MAX_DIFF_LINES) {
    throw new DiffToolError('左右内容合计不能超过 10000 行，请缩小输入后重试。')
  }
  const leftLines = textLines(left)
  const rightLines = textLines(right)
  // One escaped record per source line prevents an empty final line from disappearing
  // during whitespace normalization, and distinguishes a missing final newline.
  const comparisonText = (lines: ReturnType<typeof textLines>) => lines.map((line) =>
    JSON.stringify([ignoreWhitespace ? line.text.trim().replace(/\s+/g, ' ') : line.text, line.hasNewline]) + '\n',
  ).join('')
  const changes = diffLines(comparisonText(leftLines), comparisonText(rightLines), {
    timeout: 1000, maxEditLength: MAX_DIFF_LINES,
  })
  if (!changes) throw new DiffToolError('差异计算超过 1 秒或编辑量上限，请减少内容后重试。')
  const result: DiffResult = { rows: [], added: 0, removed: 0, equal: 0, changedLineIndices: [], groupIndices: [] }
  let leftIndex = 0
  let rightIndex = 0
  let inGroup = false
  for (const change of changes) {
    const type = change.added ? 'add' : change.removed ? 'remove' : 'equal'
    for (let index = 0; index < (change.count ?? 0); index += 1) {
      const row: DiffRow = { type, leftLine: null, rightLine: null }
      if (type !== 'add') {
        const line = leftLines[leftIndex++]!
        row.leftLine = leftIndex; row.left = line.text; row.leftHasNewline = line.hasNewline
      }
      if (type !== 'remove') {
        const line = rightLines[rightIndex++]!
        row.rightLine = rightIndex; row.right = line.text; row.rightHasNewline = line.hasNewline
      }
      if (type === 'equal') { result.equal += 1; inGroup = false }
      else {
        if (!inGroup) result.groupIndices.push(result.rows.length)
        inGroup = true
        row.changeIndex = result.changedLineIndices.length
        row.groupIndex = result.groupIndices.length - 1
        result.changedLineIndices.push(result.rows.length)
        if (type === 'add') result.added += 1
        else result.removed += 1
      }
      result.rows.push(row)
    }
  }
  return result
}

// Decimal string arithmetic keeps even enormous exponents exact, without expanding
// a power of ten or converting the coefficient/exponent to a floating-point number.
function addSignedIntegers(first: string, second: string): string {
  const unpack = (value: string) => ({ negative: value.startsWith('-'), digits: value.replace(/^[+-]/, '').replace(/^0+/, '') || '0' })
  let a = unpack(first)
  let b = unpack(second)
  if (a.digits === '0') a.negative = false
  if (b.digits === '0') b.negative = false
  const sameSign = a.negative === b.negative
  if (!sameSign && (a.digits.length < b.digits.length || (a.digits.length === b.digits.length && a.digits < b.digits))) [a, b] = [b, a]
  const output: string[] = []
  let carry = 0
  for (let i = a.digits.length - 1, j = b.digits.length - 1; i >= 0 || j >= 0; i -= 1, j -= 1) {
    const x = i >= 0 ? a.digits.charCodeAt(i) - 48 : 0
    const y = j >= 0 ? b.digits.charCodeAt(j) - 48 : 0
    const value = sameSign ? x + y + carry : x - y - carry
    output.push(String((value + 10) % 10))
    carry = sameSign ? Math.floor(value / 10) : value < 0 ? 1 : 0
  }
  if (sameSign && carry) output.push(String(carry))
  const digits = output.reverse().join('').replace(/^0+/, '') || '0'
  return `${a.negative && digits !== '0' ? '-' : ''}${digits}`
}

export function normalizeJsonNumber(raw: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw)
  if (!match) throw new DiffToolError('无效的 JSON 数字。')
  const fraction = match[3] ?? ''
  const digits = (match[2]! + fraction).replace(/^0+/, '')
  if (!digits) return '0'
  const significant = digits.replace(/0+$/, '')
  const exponent = addSignedIntegers(match[4] ?? '0', String(digits.length - significant.length - fraction.length))
  return `${match[1]}${significant}e${exponent}`
}

function parseSide(input: string, side: string): ParsedJson {
  checkSize(input, side)
  let parsed: ParsedJson
  try { parsed = parseJson(input) }
  catch (error) { throw new DiffToolError(`${side} JSON：${error instanceof Error ? error.message : String(error)}`) }
  if (parsed.duplicateKeys) throw new DiffToolError(`${side} JSON 包含 ${parsed.duplicateKeys} 个重复键；请消除重复键后对比，避免键值歧义。`)
  return parsed
}

function lineLocator(input: string): (node: JsonNode | undefined) => number | null {
  const starts = [0]
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === '\r') {
      if (input[index + 1] === '\n') index += 1
      starts.push(index + 1)
    } else if (input[index] === '\n') starts.push(index + 1)
  }
  return (node) => {
    if (!node) return null
    let low = 0
    let high = starts.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (starts[middle]! <= node.start) low = middle + 1
      else high = middle
    }
    return low
  }
}

/** Structural comparison using the lossless AST; arrays retain their order.
 * Each added/removed subtree is one difference. Numbers compare by exact decimal
 * value, including -0 = 0. Strings compare their decoded JSON token values. */
export function compareJson(left: string, right: string, options: JsonDiffOptions = {}): JsonDiffResult {
  const a = parseSide(left, '左侧')
  const b = parseSide(right, '右侧')
  const leftLine = lineLocator(left)
  const rightLine = lineLocator(right)
  const result: JsonDiffResult = { rows: [], added: 0, removed: 0, changed: 0, typeChanged: 0, orderChanged: 0 }
  const add = (type: JsonDiffRow['type'], path: string, oldNode?: JsonNode, newNode?: JsonNode, oldText?: string, newText?: string) => {
    result.rows.push({ type, path, left: oldText ?? (oldNode ? serializeJson(oldNode, '') : undefined), right: newText ?? (newNode ? serializeJson(newNode, '') : undefined), leftLine: leftLine(oldNode), rightLine: rightLine(newNode), changeIndex: result.rows.length })
    if (type === 'type') result.typeChanged += 1
    else if (type === 'order') result.orderChanged += 1
    else result[type] += 1
  }
  const visit = (oldNode: JsonNode, newNode: JsonNode, path: string): void => {
    if (oldNode.type !== newNode.type) { add('type', path, oldNode, newNode); return }
    if (oldNode.type === 'object') {
      const oldEntries = oldNode.entries ?? []
      const newEntries = newNode.entries ?? []
      const oldMap = new Map(oldEntries.map((entry) => [entry.key, entry.value]))
      const newMap = new Map(newEntries.map((entry) => [entry.key, entry.value]))
      // Added/removed keys already explain changes to membership. Only relative
      // ordering of shared keys generates a separate order difference.
      if (options.ignoreKeyOrder === false) {
        const oldKeys = oldEntries.filter((entry) => newMap.has(entry.key)).map((entry) => entry.key)
        const newKeys = newEntries.filter((entry) => oldMap.has(entry.key)).map((entry) => entry.key)
        if (oldKeys.some((key, index) => key !== newKeys[index])) add('order', path, oldNode, newNode, JSON.stringify(oldKeys), JSON.stringify(newKeys))
      }
      for (const entry of oldEntries) {
        const childPath = `${path}[${JSON.stringify(entry.key)}]`
        const next = newMap.get(entry.key)
        if (next) visit(entry.value, next, childPath)
        else add('removed', childPath, entry.value)
      }
      for (const entry of newEntries) if (!oldMap.has(entry.key)) add('added', `${path}[${JSON.stringify(entry.key)}]`, undefined, entry.value)
      return
    }
    if (oldNode.type === 'array') {
      const oldItems = oldNode.items ?? []
      const newItems = newNode.items ?? []
      for (let index = 0; index < Math.max(oldItems.length, newItems.length); index += 1) {
        const before = oldItems[index]
        const after = newItems[index]
        const childPath = `${path}[${index}]`
        if (!before) add('added', childPath, undefined, after)
        else if (!after) add('removed', childPath, before)
        else visit(before, after, childPath)
      }
      return
    }
    const value = (node: JsonNode): string => node.type === 'number' ? normalizeJsonNumber(node.raw!) : node.type === 'string' ? JSON.parse(node.raw!) as string : node.raw!
    if (value(oldNode) !== value(newNode)) add('changed', path, oldNode, newNode)
  }
  visit(a.root, b.root, '$')
  return result
}
