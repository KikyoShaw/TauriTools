import type { RegexMatch, RegexResult, RegexWorkerRequest, RegexWorkerResponse } from '../utils/regex'

// Keep runtime imports out of the worker: regex.ts also creates this worker.
const REGEX_MATCH_LIMIT = 1000
const REGEX_OUTPUT_LIMIT = 1024 * 1024
class RegexToolError extends Error {
  constructor(message: string, public readonly code: 'validation' | 'syntax') { super(message) }
}
function validateRegexRequest(request: RegexWorkerRequest) {
  if (request.source.length > 8192 || request.input.length > 200_000) {
    throw new RegexToolError('表达式或测试文本超过长度上限，请缩短后重试。', 'validation')
  }
  const seen = new Set<string>()
  for (const flag of request.flags) {
    if (!'gimsuy'.includes(flag) || seen.has(flag)) {
      throw new RegexToolError('正则标志仅支持 g、i、m、s、u、y，且不可重复。', 'validation')
    }
    seen.add(flag)
  }
}

// A local scope type keeps this worker compatible with the app's DOM tsconfig.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RegexWorkerRequest>) => void) | null
  postMessage(response: RegexWorkerResponse): void
}

function advanceIndex(input: string, index: number, unicode: boolean): number {
  if (!unicode || index + 1 >= input.length) return index + 1
  const first = input.charCodeAt(index)
  const second = input.charCodeAt(index + 1)
  return first >= 0xd800 && first <= 0xdbff && second >= 0xdc00 && second <= 0xdfff ? index + 2 : index + 1
}

function toMatch(match: RegExpExecArray): RegexMatch {
  return {
    index: match.index,
    end: match.index + match[0].length,
    text: match[0],
    captures: match.slice(1).map(value => value ?? null),
    groups: Object.fromEntries(Object.entries(match.groups ?? {}).map(([name, value]) => [name, value ?? null])),
  }
}

/** Implements string replacement tokens without ever constructing an unbounded result. */
function replaceBounded(input: string, replacement: string, matches: RegexMatch[]): string {
  const chunks: string[] = []
  let length = 0
  function append(value: string, start = 0, end = value.length) {
    const size = end - start
    if (length + size > REGEX_OUTPUT_LIMIT) throw new RangeError('replacement output limit')
    if (size) chunks.push(value.slice(start, end))
    length += size
  }

  let cursor = 0
  for (const match of matches) {
    append(input, cursor, match.index)
    let position = 0
    while (position < replacement.length) {
      const dollar = replacement.indexOf('$', position)
      if (dollar === -1) { append(replacement, position); break }
      append(replacement, position, dollar)
      const token = replacement[dollar + 1]
      let consumed = 2
      if (token === '$') append('$')
      else if (token === '&') append(match.text)
      else if (token === '`') append(input, 0, match.index)
      else if (token === "'") append(input, match.end)
      else if (token === '<' && Object.keys(match.groups).length > 0 && replacement.indexOf('>', dollar + 2) !== -1) {
        const close = replacement.indexOf('>', dollar + 2)
        const name = replacement.slice(dollar + 2, close)
        append(Object.hasOwn(match.groups, name) ? match.groups[name] ?? '' : '')
        consumed = close - dollar + 1
      } else if (token !== undefined && token >= '0' && token <= '9') {
        let capture = Number(token)
        const following = replacement[dollar + 2]
        if (following !== undefined && following >= '0' && following <= '9') {
          const pair = capture * 10 + Number(following)
          if (pair > 0 && pair <= match.captures.length) { capture = pair; consumed = 3 }
        }
        if (capture > 0 && capture <= match.captures.length) append(match.captures[capture - 1] ?? '')
        else { append('$'); consumed = 1 }
      } else { append('$'); consumed = 1 }
      position = dollar + consumed
    }
    cursor = match.end
  }
  append(input, cursor)
  return chunks.join('')
}

function execute(request: RegexWorkerRequest): RegexResult {
  validateRegexRequest(request)
  let expression: RegExp
  try { expression = new RegExp(request.source, request.flags) }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new RegexToolError(`正则表达式语法错误，请检查括号、转义或当前引擎支持的语法。原始错误：${detail}`, 'syntax')
  }

  const matches: RegexMatch[] = []
  let capped = false
  while (true) {
    const match = expression.exec(request.input)
    if (!match) break
    if (matches.length === REGEX_MATCH_LIMIT) { capped = true; break }
    matches.push(toMatch(match))
    if (!expression.global) break
    if (match[0] === '') expression.lastIndex = advanceIndex(request.input, expression.lastIndex, expression.unicode)
  }

  let replacedText: string | null = null
  let replacementWarning: string | null = null
  if (capped) {
    replacementWarning = '超过1000处匹配，缩小文本或表达式后重试。替换结果不可用。'
  } else {
    try { replacedText = replaceBounded(request.input, request.replacement, matches) }
    catch (error) {
      if (!(error instanceof RangeError)) throw error
      replacementWarning = '替换结果超过 1,048,576 个 UTF-16 代码单元（1 Mi），请缩短替换内容后重试。替换结果不可用。'
    }
  }
  return { source: request.source, flags: request.flags, matches, capped, replacedText, replacementWarning }
}

scope.onmessage = event => {
  const request = event.data
  try { scope.postMessage({ id: request.id, ok: true, result: execute(request) }) }
  catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      code: error instanceof RegexToolError && (error.code === 'validation' || error.code === 'syntax') ? error.code : 'worker',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
