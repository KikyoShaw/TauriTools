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

export function rgbToColor(red: string, green: string, blue: string): ColorValue {
  const channels = [red, green, blue].map((value, index) => {
    const text = value.trim()
    if (!/^\d{1,3}$/.test(text) || Number(text) > 255) {
      throw new Error(`${['R（红）', 'G（绿）', 'B（蓝）'][index]} 必须是 0 到 255 之间的整数`)
    }
    return Number(text)
  })
  return colorValue(channels[0]!, channels[1]!, channels[2]!)
}

export function hexToColor(input: string): ColorValue {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(input.trim())
  if (!match) throw new Error('请输入 3 位或 6 位十六进制颜色码，例如 #F80 或 #FF8800；不包含透明度')
  const digits = match[1]!.length === 3 ? Array.from(match[1]!, digit => digit + digit).join('') : match[1]!
  return colorValue(parseInt(digits.slice(0, 2), 16), parseInt(digits.slice(2, 4), 16), parseInt(digits.slice(4, 6), 16))
}

export function previewTextColor(color: ColorValue): string {
  const [r, g, b] = [color.r, color.g, color.b].map(value => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  return luminance > 0.179 ? '#101010' : '#FFFFFF'
}
