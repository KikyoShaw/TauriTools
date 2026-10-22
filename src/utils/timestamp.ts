export type TimestampUnit = 'seconds' | 'milliseconds'
export type Timezone = 'local' | 'utc'

const DATE_LIMIT = 8_640_000_000_000_000

export function parseTimestamp(input: string, unit: TimestampUnit): Date {
  if (!/^[+-]?\d+$/.test(input.trim())) throw new Error('时间戳应为整数，请选择正确的秒或毫秒单位')
  const value = Number(input.trim())
  const milliseconds = unit === 'seconds' ? value * 1000 : value
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(milliseconds) || Math.abs(milliseconds) > DATE_LIMIT) {
    throw new Error('时间戳超出可转换的日期范围')
  }
  const date = new Date(milliseconds)
  if (!Number.isFinite(date.getTime())) throw new Error('无效的时间戳')
  return date
}

export function formatDate(date: Date, timezone: Timezone): string {
  const get = (local: keyof Date, utc: keyof Date): number => (date[timezone === 'utc' ? utc : local] as () => number).call(date)
  const year = get('getFullYear', 'getUTCFullYear')
  const pad = (value: number, size = 2) => String(value).padStart(size, '0')
  const formattedYear = year >= 0 && year <= 9999 ? pad(year, 4) : `${year < 0 ? '-' : '+'}${pad(Math.abs(year), 6)}`
  return `${formattedYear}-${pad(get('getMonth', 'getUTCMonth') + 1)}-${pad(get('getDate', 'getUTCDate'))} ${pad(get('getHours', 'getUTCHours'))}:${pad(get('getMinutes', 'getUTCMinutes'))}:${pad(get('getSeconds', 'getUTCSeconds'))}.${pad(get('getMilliseconds', 'getUTCMilliseconds'), 3)}`
}

export function parseDate(input: string, timezone: Timezone): Date {
  const text = input.trim()
  // Explicit ISO offsets describe an absolute instant, independently of the selected timezone.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) {
    const offset = /([+-])(\d{2}):(\d{2})$/.exec(text)
    if (offset && (Number(offset[2]) > 23 || Number(offset[3]) > 59)) throw new Error('无效的时区偏移')
    // Validate calendar components before Date.parse can normalize an invalid day.
    parseDate(text.replace(/(?:Z|[+-]\d{2}:\d{2})$/i, ''), 'utc')
    const value = new Date(text)
    if (!Number.isFinite(value.getTime())) throw new Error('日期超出可转换范围')
    return value
  }
  const match = /^(\d{4}|[+-]\d{6})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(text)
  if (!match) throw new Error('日期格式应为 YYYY-MM-DD HH:mm:ss，可包含毫秒或 ISO 时区')
  const parts = [Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0), Number((match[7] ?? '').padEnd(3, '0'))]
  const [year, month, day, hour, minute, second, millisecond] = parts as [number, number, number, number, number, number, number]
  if (month < 0 || month > 11 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) throw new Error('日期或时间超出有效范围')
  const date = new Date(0)
  if (timezone === 'utc') {
    date.setUTCFullYear(year, month, day)
    date.setUTCHours(hour, minute, second, millisecond)
  } else {
    date.setFullYear(year, month, day)
    date.setHours(hour, minute, second, millisecond)
  }
  const actual = timezone === 'utc'
    ? [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()]
    : [date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()]
  if (!Number.isFinite(date.getTime()) || actual.some((value, index) => value !== parts[index])) {
    throw new Error('日期不存在，或处于本地夏令时跳过的时段')
  }
  return date
}

export function toTimestamp(date: Date, unit: TimestampUnit): string {
  return String(unit === 'seconds' ? Math.floor(date.getTime() / 1000) : date.getTime())
}
