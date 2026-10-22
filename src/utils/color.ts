export interface ColorValue {
  r: number
  g: number
  b: number
  hex: string
  rgb: string
  css: string
}

function colorValue(r: number, g: number, b: number): ColorValue {
  const rgb = `${r}, ${g}, ${b}`
  return { r, g, b, hex: '#' + [r, g, b].map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase(), rgb, css: `rgb(${rgb})` }
}

function parseChannel(value: string, label: string): number {
  const text = value.trim()
  if (!/^\d{1,3}$/.test(text) || Number(text) > 255) {
    throw new Error(`${label} 必须是 0 到 255 之间的整数`)
  }
  return Number(text)
}

export function rgbToColor(red: string, green: string, blue: string): ColorValue {
  return colorValue(parseChannel(red, 'R（红）'), parseChannel(green, 'G（绿）'), parseChannel(blue, 'B（蓝）'))
}

export function hexToColor(input: string): ColorValue {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(input.trim())
  if (!match) throw new Error('请输入 3 位或 6 位十六进制颜色码，例如 #F80 或 #FF8800；不包含透明度')
  const digits = match[1]!.length === 3 ? Array.from(match[1]!, digit => digit + digit).join('') : match[1]!
  return colorValue(parseInt(digits.slice(0, 2), 16), parseInt(digits.slice(2, 4), 16), parseInt(digits.slice(4, 6), 16))
}

export interface ArgbColor extends ColorValue {
  a: number
  argb: string
  rgba: string
  signed: string
  unsigned: string
  opacity: string
}

function argbValue(a: number, rgb: ColorValue): ArgbColor {
  const alphaHex = a.toString(16).padStart(2, '0').toUpperCase()
  const unsigned = a * 0x1000000 + rgb.r * 0x10000 + rgb.g * 0x100 + rgb.b
  const opacity = String(Number((a / 255).toFixed(6)))
  return {
    ...rgb, a,
    argb: '#' + alphaHex + rgb.hex.slice(1),
    rgba: rgb.hex + alphaHex,
    signed: String(unsigned >= 0x80000000 ? unsigned - 0x100000000 : unsigned),
    unsigned: String(unsigned),
    opacity,
    css: `rgba(${rgb.rgb}, ${opacity})`,
  }
}

export function argbToColor(alpha: string, red: string, green: string, blue: string): ArgbColor {
  return argbValue(parseChannel(alpha, 'A（透明度）'), rgbToColor(red, green, blue))
}

export function alphaHexToColor(input: string, order: 'argb' | 'rgba'): ArgbColor {
  const match = /^#?([0-9a-f]{8}|[0-9a-f]{4})$/i.exec(input.trim())
  const format = order === 'argb' ? '#AARRGGBB / #ARGB' : '#RRGGBBAA / #RGBA'
  if (!match) throw new Error(`请输入 4 位或 8 位十六进制颜色码，当前格式为 ${format}`)
  const digits = match[1]!.length === 4 ? Array.from(match[1]!, digit => digit + digit).join('') : match[1]!
  const alpha = order === 'argb' ? digits.slice(0, 2) : digits.slice(6, 8)
  const rgb = order === 'argb' ? digits.slice(2) : digits.slice(0, 6)
  return argbValue(parseInt(alpha, 16), hexToColor(rgb))
}

export function integerToArgb(input: string): ArgbColor {
  const text = input.trim()
  if (!/^[+-]?\d{1,64}$/.test(text)) throw new Error('请输入十进制 32 位整数，不支持小数或科学计数法')
  const value = Number(text)
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xFFFFFFFF) {
    throw new Error('整数范围为 -2147483648 到 4294967295（有符号或无符号 32 位）')
  }
  const unsigned = value < 0 ? value + 0x100000000 : value
  return alphaHexToColor(unsigned.toString(16).padStart(8, '0'), 'argb')
}

export function previewTextColor(color: ColorValue): string {
  const [r, g, b] = [color.r, color.g, color.b].map(value => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  return luminance > 0.179 ? '#101010' : '#FFFFFF'
}
