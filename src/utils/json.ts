export type JsonNodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

export interface JsonEntry {
  key: string
  rawKey: string
  value: JsonNode
}

export interface JsonNode {
  type: JsonNodeType
  start: number
  end: number
  raw?: string
  entries?: JsonEntry[]
  items?: JsonNode[]
}

export interface ParsedJson {
  root: JsonNode
  nodeCount: number
  maxDepth: number
  duplicateKeys: number
}

const MAX_INPUT_LENGTH = 2 * 1024 * 1024
const MAX_DEPTH = 128
const MAX_NODES = 50_000

export class JsonToolError extends Error {
  // Offsets are zero-based UTF-16 units; lines and columns are one-based.
  offset: number
  line: number
  column: number

  constructor(message: string, input: string, offset: number) {
    const position = Math.max(0, Math.min(input.length, offset))
    let line = 1
    let column = 1
    for (let index = 0; index < position; index += 1) {
      if (input[index] === '\r') {
        line += 1
        column = 1
        if (input[index + 1] === '\n' && index + 1 < position) index += 1
      } else if (input[index] === '\n') {
        line += 1
        column = 1
      } else {
        column += 1
      }
    }
    super(`${message}（第 ${line} 行，第 ${column} 列）`)
    this.name = 'JsonToolError'
    this.offset = position
    this.line = line
    this.column = column
  }
}

function checkInputSize(input: string): void {
  if (input.length > MAX_INPUT_LENGTH) {
    throw new JsonToolError('输入过长，请控制在 2 Mi 个字符以内。', input, MAX_INPUT_LENGTH)
  }
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9'
}

class ParseCursor {
  private offset = 0
  private nodeCount = 0
  private maxDepth = 0
  private duplicateKeys = 0

  constructor(
    private readonly input: string,
    private readonly errorInput = input,
    private readonly errorOffsetAdjustment = 0,
  ) {}

  private fail(message: string, offset = this.offset): never {
    throw new JsonToolError(message, this.errorInput, offset + this.errorOffsetAdjustment)
  }

  private skipWhitespace(): void {
    while (' \t\r\n'.includes(this.input[this.offset] ?? '\0')) this.offset += 1
  }

  parse(): ParsedJson {
    const root = this.readValue(1)
    this.skipWhitespace()
    if (this.offset !== this.input.length) this.fail('JSON 值后存在多余内容。')
    return {
      root,
      nodeCount: this.nodeCount,
      maxDepth: this.maxDepth,
      duplicateKeys: this.duplicateKeys,
    }
  }

  private readValue(depth: number): JsonNode {
    this.skipWhitespace()
    const start = this.offset
    if (start === this.input.length) this.fail('缺少 JSON 值，输入已结束。')
    if (depth > MAX_DEPTH) this.fail('嵌套层级超过 128 层，请简化 JSON 结构。')
    if (this.nodeCount >= MAX_NODES) this.fail('节点数量超过 50000 个，请减少 JSON 数据量。')
    this.nodeCount += 1
    // Root depth is 1; keys do not count as separate nodes.
    this.maxDepth = Math.max(this.maxDepth, depth)
    const character = this.input[this.offset]
    if (character === '{') return this.readObject(start, depth)
    if (character === '[') return this.readArray(start, depth)
    if (character === '"') {
      return { type: 'string', start, raw: this.readString(), end: this.offset }
    }
    if (character === '-' || isDigit(character)) {
      this.readNumber()
      return { type: 'number', start, end: this.offset, raw: this.input.slice(start, this.offset) }
    }
    const literal = character === 't' ? 'true' : character === 'f' ? 'false' : character === 'n' ? 'null' : null
    if (literal !== null) {
      for (let index = 0; index < literal.length; index += 1) {
        if (this.input[this.offset] !== literal[index]) this.fail(`无效的 JSON 值，应为 ${literal}。`)
        this.offset += 1
      }
      return { type: literal === 'null' ? 'null' : 'boolean', start, end: this.offset, raw: literal }
    }
    this.fail('无效的 JSON 值，请使用对象、数组、双引号字符串、数字、true、false 或 null。')
  }

  private readString(): string {
    const start = this.offset
    this.offset += 1
    while (this.offset < this.input.length) {
      const character = this.input[this.offset]
      if (character === '"') {
        this.offset += 1
        return this.input.slice(start, this.offset)
      }
      if (character.charCodeAt(0) < 0x20) this.fail('字符串中不能包含未转义的换行或控制字符。')
      if (character !== '\\') {
        this.offset += 1
        continue
      }
      this.offset += 1
      if (this.offset === this.input.length) this.fail('字符串中的转义字符不完整。')
      const escape = this.input[this.offset]
      if (escape === 'u') {
        this.offset += 1
        for (let index = 0; index < 4; index += 1) {
          if (this.offset === this.input.length || !/[0-9a-fA-F]/.test(this.input[this.offset])) {
            this.fail('Unicode 转义必须在 \\u 后包含 4 位十六进制数字。')
          }
          this.offset += 1
        }
      } else {
        if (!'"\\/bfnrt'.includes(escape)) this.fail('无效的字符串转义，请检查反斜杠后的字符。')
        this.offset += 1
      }
    }
    this.fail('字符串缺少结束双引号。')
  }

  private readNumber(): void {
    if (this.input[this.offset] === '-') this.offset += 1
    if (this.input[this.offset] === '0') {
      this.offset += 1
      if (isDigit(this.input[this.offset])) this.fail('JSON 数字不能包含多余的前导零。')
    } else {
      if (!isDigit(this.input[this.offset])) this.fail('负号后必须有数字。')
      while (isDigit(this.input[this.offset])) this.offset += 1
    }
    if (this.input[this.offset] === '.') {
      this.offset += 1
      if (!isDigit(this.input[this.offset])) this.fail('小数点后必须有数字。')
      while (isDigit(this.input[this.offset])) this.offset += 1
    }
    if (this.input[this.offset] === 'e' || this.input[this.offset] === 'E') {
      this.offset += 1
      if (this.input[this.offset] === '+' || this.input[this.offset] === '-') this.offset += 1
      if (!isDigit(this.input[this.offset])) this.fail('指数部分必须包含数字。')
      while (isDigit(this.input[this.offset])) this.offset += 1
    }
  }

  private readObject(start: number, depth: number): JsonNode {
    this.offset += 1
    this.skipWhitespace()
    const entries: JsonEntry[] = []
    const keys = new Set<string>()
    if (this.input[this.offset] !== '}') {
      while (true) {
        if (this.input[this.offset] !== '"') this.fail('对象的键必须是双引号字符串。')
        const rawKey = this.readString()
        const key = JSON.parse(rawKey) as string
        this.skipWhitespace()
        if (this.input[this.offset] !== ':') this.fail('对象的键后缺少冒号。')
        this.offset += 1
        const value = this.readValue(depth + 1)
        entries.push({ key, rawKey, value })
        if (keys.has(key)) this.duplicateKeys += 1
        keys.add(key)
        this.skipWhitespace()
        if (this.input[this.offset] === '}') break
        if (this.input[this.offset] !== ',') this.fail('对象成员之间需要逗号，或使用右花括号结束。')
        this.offset += 1
        this.skipWhitespace()
        if (this.input[this.offset] === '}') this.fail('对象末尾不能有多余的逗号。')
      }
    }
    this.offset += 1
    return { type: 'object', start, end: this.offset, entries }
  }

  private readArray(start: number, depth: number): JsonNode {
    this.offset += 1
    this.skipWhitespace()
    const items: JsonNode[] = []
    if (this.input[this.offset] !== ']') {
      while (true) {
        items.push(this.readValue(depth + 1))
        this.skipWhitespace()
        if (this.input[this.offset] === ']') break
        if (this.input[this.offset] !== ',') this.fail('数组元素之间需要逗号，或使用右方括号结束。')
        this.offset += 1
        this.skipWhitespace()
        if (this.input[this.offset] === ']') this.fail('数组末尾不能有多余的逗号。')
      }
    }
    this.offset += 1
    return { type: 'array', start, end: this.offset, items }
  }
}

export function parseJson(input: string): ParsedJson {
  checkInputSize(input)
  return new ParseCursor(input).parse()
}

export function serializeJson(root: JsonNode, indent = '  '): string {
  function render(node: JsonNode, depth: number): string {
    if (node.type !== 'object' && node.type !== 'array') return node.raw!
    const object = node.type === 'object'
    const open = object ? '{' : '['
    const close = object ? '}' : ']'
    const parts = object
      ? (node.entries ?? []).map((entry) => `${entry.rawKey}:${indent ? ' ' : ''}${render(entry.value, depth + 1)}`)
      : (node.items ?? []).map((item) => render(item, depth + 1))
    if (parts.length === 0) return open + close
    if (indent === '') return open + parts.join(',') + close
    const padding = indent.repeat(depth + 1)
    return `${open}\n${padding}${parts.join(`,\n${padding}`)}\n${indent.repeat(depth)}${close}`
  }
  return render(root, 0)
}

export function escapeJsonText(input: string): string {
  checkInputSize(input)
  return JSON.stringify(input)
}

export function unescapeJsonText(input: string): string {
  checkInputSize(input)
  // Trim only to detect an outer literal; unquoted text keeps all whitespace.
  const quoted = input.trim().startsWith('"')
  const { root } = quoted
    ? new ParseCursor(input).parse()
    : new ParseCursor(`"${input}"`, input, -1).parse()
  if (root.type !== 'string') throw new JsonToolError('请输入 JSON 字符串或转义文本。', input, root.start)
  return JSON.parse(root.raw!) as string
}
