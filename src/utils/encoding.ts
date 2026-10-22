export type CodecId = 'unicode' | 'utf8' | 'url' | 'native' | 'hex' | 'html' | 'base64' | 'base'
export type CodecAction = 'encode' | 'decode' | 'unicodeToChinese'

export interface CodecOptions {
  urlMode?: 'component' | 'uri' | 'form'
  base64UrlSafe?: boolean
  baseVariant?: 'base16' | 'base32' | 'base58'
  uppercase?: boolean
}

const MAX_INPUT_BYTES = 1024 * 1024
const MAX_BASE58_BYTES = 4096
const MAX_BASE58_CHARACTERS = 8192
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const encoder = new TextEncoder()
// Preserve a leading U+FEFF instead of silently treating it as a byte-order mark.
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

function assertWellFormed(text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error('文本包含未配对的 Unicode 高代理项，请检查转义或字符是否完整。')
      }
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error('文本包含未配对的 Unicode 低代理项，请检查转义或字符是否完整。')
    }
  }
}

function validateInput(input: string): void {
  if (typeof input !== 'string') throw new Error('请输入需要转换的文本。')
  if (input.length > MAX_INPUT_BYTES) throw new Error('输入过长，请将 UTF-8 数据大小控制在 1 MiB 以内。')
  assertWellFormed(input)
  let byteLength = 0
  for (let index = 0; index < input.length; index += 1) {
    const unit = input.charCodeAt(index)
    if (unit <= 0x7f) byteLength += 1
    else if (unit <= 0x7ff) byteLength += 2
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      byteLength += 4
      index += 1
    } else byteLength += 3
    if (byteLength > MAX_INPUT_BYTES) throw new Error('输入过长，请将 UTF-8 数据大小控制在 1 MiB 以内。')
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes)
  } catch {
    throw new Error('解码后的字节不是有效的 UTF-8 文本，请检查编码类型和输入数据。')
  }
}

function encodeUnicode(input: string, asciiOnly: boolean, uppercase: boolean): string {
  return input.replace(asciiOnly ? /[^\x00-\x7f]/g : /[\s\S]/g, (character) => {
    const digits = character.charCodeAt(0).toString(16).padStart(4, '0')
    return `\\u${uppercase ? digits.toUpperCase() : digits}`
  })
}

function decodeUnicode(input: string): string {
  const parts: string[] = []
  let plainStart = 0
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] !== '\\' || input[index + 1] !== 'u') continue
    parts.push(input.slice(plainStart, index))
    if (input[index + 2] === '{') {
      const end = input.indexOf('}', index + 3)
      const digits = end < 0 ? '' : input.slice(index + 3, end)
      if (!/^[0-9a-f]{1,6}$/i.test(digits)) {
        throw new Error('Unicode 转义格式错误：花括号内应为 1 至 6 位十六进制数字。')
      }
      const codePoint = Number.parseInt(digits, 16)
      if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        throw new Error('Unicode 码点无效：必须在 U+0000 至 U+10FFFF 范围内，且不能是代理项。')
      }
      parts.push(String.fromCodePoint(codePoint))
      index = end
    } else {
      const digits = input.slice(index + 2, index + 6)
      if (!/^[0-9a-f]{4}$/i.test(digits)) {
        throw new Error('Unicode 转义格式错误：\\u 后必须有 4 位十六进制数字。')
      }
      parts.push(String.fromCharCode(Number.parseInt(digits, 16)))
      index += 5
    }
    plainStart = index + 1
  }
  parts.push(input.slice(plainStart))
  const result = parts.join('')
  assertWellFormed(result)
  return result
}

function encodeHex(bytes: Uint8Array, uppercase: boolean, separator = ''): string {
  const alphabet = uppercase ? '0123456789ABCDEF' : '0123456789abcdef'
  return Array.from(bytes, (byte) => `${alphabet[byte >>> 4]}${alphabet[byte & 15]}`).join(separator)
}

function decodeHex(input: string, byteNotation: boolean): Uint8Array {
  const text = input.trim()
  if (!text) return new Uint8Array()
  const bytes: number[] = []
  const message = byteNotation
    ? 'UTF-8 字节格式错误：请使用成对十六进制数字，例如 E4 B8 AD、0xE4 0xB8 0xAD 或 \\xE4\\xB8\\xAD；每个前缀后只能有两位数字。'
    : 'HEX 格式错误：请使用成对十六进制数字，可包含空白或 0x 前缀，例如 e4b8ad 或 0xe4 0xb8 0xad。'
  for (const token of text.split(/\s+/)) {
    if (byteNotation && /^(?:0x|\\x)/i.test(token)) {
      if (!/^(?:(?:0x|\\x)[0-9a-f]{2})+$/i.test(token)) throw new Error(message)
      for (let index = 0; index < token.length; index += 4) {
        bytes.push(Number.parseInt(token.slice(index + 2, index + 4), 16))
      }
    } else {
      const digits = !byteNotation && /^0x/i.test(token) ? token.slice(2) : token
      if (!/^[0-9a-f]+$/i.test(digits) || digits.length % 2 !== 0) throw new Error(message)
      for (let index = 0; index < digits.length; index += 2) {
        bytes.push(Number.parseInt(digits.slice(index, index + 2), 16))
      }
    }
  }
  return Uint8Array.from(bytes)
}

function transformUrl(action: 'encode' | 'decode', input: string, mode: CodecOptions['urlMode']): string {
  try {
    switch (mode ?? 'component') {
      case 'component':
        return action === 'encode' ? encodeURIComponent(input) : decodeURIComponent(input)
      case 'uri':
        return action === 'encode' ? encodeURI(input) : decodeURI(input)
      case 'form':
        return action === 'encode'
          ? new URLSearchParams([['q', input]]).toString().slice(2)
          : decodeURIComponent(input.replace(/\+/g, ' '))
      default:
        throw new Error('不支持的 URL 编码模式。')
    }
  } catch (error) {
    if (error instanceof URIError) {
      throw new Error('URL 格式错误：请检查 % 后是否为两位十六进制数字，以及转义内容是否为有效 UTF-8。')
    }
    throw error
  }
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

// Common HTML named entities, including the HTML 4 set. Unknown names remain literal.
const HTML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", AMP: '&', LT: '<', GT: '>', QUOT: '"',
  nbsp: ' ', iexcl: '¡', cent: '¢', pound: '£', curren: '¤', yen: '¥', brvbar: '¦', sect: '§',
  uml: '¨', copy: '©', ordf: 'ª', laquo: '«', not: '¬', shy: '­', reg: '®', macr: '¯',
  deg: '°', plusmn: '±', sup2: '²', sup3: '³', acute: '´', micro: 'µ', para: '¶', middot: '·',
  cedil: '¸', sup1: '¹', ordm: 'º', raquo: '»', frac14: '¼', frac12: '½', frac34: '¾', iquest: '¿',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç',
  Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
  ETH: 'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', times: '×',
  Oslash: 'Ø', Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý', THORN: 'Þ', szlig: 'ß',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  eth: 'ð', ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', divide: '÷',
  oslash: 'ø', ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', thorn: 'þ', yuml: 'ÿ',
  OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', fnof: 'ƒ', circ: 'ˆ', tilde: '˜',
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Epsilon: 'Ε', Zeta: 'Ζ', Eta: 'Η', Theta: 'Θ',
  Iota: 'Ι', Kappa: 'Κ', Lambda: 'Λ', Mu: 'Μ', Nu: 'Ν', Xi: 'Ξ', Omicron: 'Ο', Pi: 'Π',
  Rho: 'Ρ', Sigma: 'Σ', Tau: 'Τ', Upsilon: 'Υ', Phi: 'Φ', Chi: 'Χ', Psi: 'Ψ', Omega: 'Ω',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π',
  rho: 'ρ', sigmaf: 'ς', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  thetasym: 'ϑ', upsih: 'ϒ', piv: 'ϖ', ensp: ' ', emsp: ' ', thinsp: ' ',
  zwnj: '‌', zwj: '‍', lrm: '‎', rlm: '‏', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', dagger: '†', Dagger: '‡',
  bull: '•', hellip: '…', permil: '‰', prime: '′', Prime: '″', lsaquo: '‹', rsaquo: '›', oline: '‾',
  frasl: '⁄', euro: '€', image: 'ℑ', weierp: '℘', real: 'ℜ', trade: '™', alefsym: 'ℵ',
  larr: '←', uarr: '↑', rarr: '→', darr: '↓', harr: '↔', crarr: '↵',
  lArr: '⇐', uArr: '⇑', rArr: '⇒', dArr: '⇓', hArr: '⇔', forall: '∀', part: '∂', exist: '∃',
  empty: '∅', nabla: '∇', isin: '∈', notin: '∉', ni: '∋', prod: '∏', sum: '∑', minus: '−',
  lowast: '∗', radic: '√', prop: '∝', infin: '∞', ang: '∠', and: '∧', or: '∨', cap: '∩', cup: '∪',
  int: '∫', there4: '∴', sim: '∼', cong: '≅', asymp: '≈', ne: '≠', equiv: '≡', le: '≤', ge: '≥',
  sub: '⊂', sup: '⊃', nsub: '⊄', sube: '⊆', supe: '⊇', oplus: '⊕', otimes: '⊗', perp: '⊥', sdot: '⋅',
  lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋', lang: '〈', rang: '〉', loz: '◊',
  spades: '♠', clubs: '♣', hearts: '♥', diams: '♦', Tab: '\t', NewLine: '\n',
}

function decodeHtml(input: string): string {
  return input.replace(/&(#(?:[^&;\s<>]*)|[a-z][a-z0-9]*);/gi, (reference: string, entity: string) => {
    if (!entity.startsWith('#')) {
      return Object.hasOwn(HTML_ENTITIES, entity) ? HTML_ENTITIES[entity]! : reference
    }
    const hexadecimal = /^#x[0-9a-f]+$/i.test(entity)
    if (!hexadecimal && !/^#[0-9]+$/.test(entity)) {
      throw new Error('HTML 数字实体格式错误，请使用 &#20013; 或 &#x4E2D; 格式。')
    }
    const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
    if (!Number.isInteger(codePoint) || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      throw new Error('HTML 数字实体包含无效 Unicode 码点，或使用了未配对的代理项。')
    }
    return String.fromCodePoint(codePoint)
  })
}

function encodeBase64(bytes: Uint8Array, urlSafe: boolean): string {
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)))
  }
  const result = btoa(chunks.join(''))
  return urlSafe ? result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : result
}

function decodeBase64(input: string, urlSafe: boolean): Uint8Array {
  const text = input.replace(/\s/g, '')
  const valid = urlSafe ? /^[a-z0-9_-]*={0,2}$/i : /^[a-z0-9+/]*={0,2}$/i
  if (!valid.test(text)) {
    throw new Error(urlSafe
      ? 'Base64 URL 安全格式错误：仅允许字母、数字、-、_ 和末尾的 = 填充。'
      : 'Base64 格式错误：仅允许字母、数字、+、/ 和末尾的 = 填充。')
  }
  const body = text.replace(/=+$/, '')
  const padding = text.length - body.length
  const remainder = body.length % 4
  const requiredPadding = (4 - remainder) % 4
  if (remainder === 1 || (padding > 0 && (text.length % 4 !== 0 || padding !== requiredPadding))) {
    throw new Error('Base64 长度或 = 填充无效，请检查数据是否完整。')
  }
  const normalized = body.replace(/-/g, '+').replace(/_/g, '/')
  const lastValue = normalized ? BASE64_ALPHABET.indexOf(normalized[normalized.length - 1]!) : 0
  if ((remainder === 2 && (lastValue & 15) !== 0) || (remainder === 3 && (lastValue & 3) !== 0)) {
    throw new Error('Base64 尾部未使用的位必须为零，输入不是规范编码。')
  }
  try {
    const binary = atob(normalized + '='.repeat(requiredPadding))
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    throw new Error('Base64 数据无效，无法解码。')
  }
}

function encodeBase32(bytes: Uint8Array, uppercase: boolean): string {
  const characters: string[] = []
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      characters.push(BASE32_ALPHABET[(buffer >>> bits) & 31]!)
    }
    buffer &= (1 << bits) - 1
  }
  if (bits > 0) characters.push(BASE32_ALPHABET[(buffer << (5 - bits)) & 31]!)
  const body = characters.join('')
  const result = body + '='.repeat((8 - (body.length % 8)) % 8)
  return uppercase ? result : result.toLowerCase()
}

function decodeBase32(input: string): Uint8Array {
  const text = input.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z2-7]*={0,6}$/.test(text)) {
    throw new Error('Base32 格式错误：仅允许字母 A-Z、数字 2-7 和末尾的 = 填充。')
  }
  const body = text.replace(/=+$/, '')
  const expectedPadding: Record<number, number> = { 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 }
  const requiredPadding = expectedPadding[body.length % 8]
  const padding = text.length - body.length
  if (requiredPadding === undefined || (padding > 0 && (text.length % 8 !== 0 || padding !== requiredPadding))) {
    throw new Error('Base32 长度或 = 填充无效，请检查数据是否完整。')
  }
  const bytes = new Uint8Array(Math.floor(body.length * 5 / 8))
  let buffer = 0
  let bits = 0
  let offset = 0
  for (const character of body) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes[offset] = (buffer >>> bits) & 255
      offset += 1
    }
    buffer &= (1 << bits) - 1
  }
  if (buffer !== 0) throw new Error('Base32 尾部未使用的位必须为零，输入不是规范编码。')
  return bytes
}

function base58SizeError(): Error {
  return new Error('Base58 数据过长：原始 UTF-8 数据最多 4096 字节，编码文本最多 8192 个字符。')
}

function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length > MAX_BASE58_BYTES) throw base58SizeError()
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1
  const digits: number[] = []
  for (let index = zeros; index < bytes.length; index += 1) {
    let carry = bytes[index]!
    for (let digit = 0; digit < digits.length; digit += 1) {
      carry += digits[digit]! * 256
      digits[digit] = carry % 58
      carry = Math.floor(carry / 58)
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }
  return '1'.repeat(zeros) + digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join('')
}

function decodeBase58(input: string): Uint8Array {
  const text = input.trim()
  if (text.length > MAX_BASE58_CHARACTERS) throw base58SizeError()
  if (!/^[1-9A-HJ-NP-Za-km-z]*$/.test(text)) {
    throw new Error('Base58 格式错误：请使用 Bitcoin 字母表，不包含 0、O、I、l、空白或标点。')
  }
  let zeros = 0
  while (zeros < text.length && text[zeros] === '1') zeros += 1
  if (zeros > MAX_BASE58_BYTES) throw base58SizeError()
  const bytes: number[] = []
  for (let index = zeros; index < text.length; index += 1) {
    let carry = BASE58_ALPHABET.indexOf(text[index]!)
    for (let byte = 0; byte < bytes.length; byte += 1) {
      carry += bytes[byte]! * 58
      bytes[byte] = carry & 255
      carry >>>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 255)
      carry >>>= 8
    }
    if (zeros + bytes.length > MAX_BASE58_BYTES) throw base58SizeError()
  }
  const result = new Uint8Array(zeros + bytes.length)
  result.set(bytes.reverse(), zeros)
  return result
}

/** Convert text without normalization. Binary codecs always use strict UTF-8. */
export function transformText(
  codec: CodecId,
  action: 'encode' | 'decode',
  input: string,
  options: CodecOptions = {},
): string {
  validateInput(input)
  if (action !== 'encode' && action !== 'decode') throw new Error('不支持的转换操作，请选择编码或解码。')
  const encoding = action === 'encode'
  switch (codec) {
    case 'unicode':
    case 'native':
      return encoding ? encodeUnicode(input, codec === 'native', options.uppercase ?? false) : decodeUnicode(input)
    case 'utf8':
      return encoding ? encodeHex(encoder.encode(input), true, ' ') : decodeUtf8(decodeHex(input, true))
    case 'hex':
      return encoding ? encodeHex(encoder.encode(input), options.uppercase ?? false) : decodeUtf8(decodeHex(input, false))
    case 'url':
      return transformUrl(action, input, options.urlMode)
    case 'html':
      return encoding ? input.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]!) : decodeHtml(input)
    case 'base64':
      return encoding
        ? encodeBase64(encoder.encode(input), options.base64UrlSafe ?? false)
        : decodeUtf8(decodeBase64(input, options.base64UrlSafe ?? false))
    case 'base':
      switch (options.baseVariant ?? 'base32') {
        case 'base16':
          return encoding ? encodeHex(encoder.encode(input), options.uppercase ?? true) : decodeUtf8(decodeHex(input, false))
        case 'base32':
          return encoding
            ? encodeBase32(encoder.encode(input), options.uppercase ?? true)
            : decodeUtf8(decodeBase32(input))
        case 'base58':
          return encoding ? encodeBase58(encoder.encode(input)) : decodeUtf8(decodeBase58(input))
        default:
          throw new Error('不支持的 BASE 编码类型，请选择 Base16、Base32 或 Base58。')
      }
    default:
      throw new Error('不支持的编码类型。')
  }
}

/** Decode all supported Unicode escapes, including Chinese and emoji. */
export function unicodeToChinese(input: string): string {
  validateInput(input)
  return decodeUnicode(input)
}
