import { invoke, isTauri } from '@tauri-apps/api/core'
import type { AngleMode, CalculationResult, ConversionField } from '../types/calculator'

export const desktopAvailable = isTauri()

function requireDesktop() {
  if (!desktopAvailable) throw new Error('请在 Tauri 桌面窗口中运行计算。可使用 npm run tauri dev 启动。')
}

export function calculate(expression: string, variables: Record<string, string>, angleMode: AngleMode) {
  requireDesktop()
  return invoke<CalculationResult>('calculate', { request: { expression, variables, angleMode } })
}

export function convertBase(value: string, field: ConversionField) {
  requireDesktop()
  const radix = { decimal: 10, hex: 16, octal: 8, binary: 2, float32: 10, float64: 10 }[field]
  return invoke<CalculationResult>('convert_base', {
    request: { value, radix, float32: field === 'float32' },
  })
}
