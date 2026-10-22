export type AngleMode = 'deg' | 'rad'

export interface CalculationResult {
  decimal: string
  hex: string
  octal: string
  binary: string
  float32: string
  float64: string
  ascii: string
  ebcdic: string
  unicode: string
  kind: 'integer' | 'float'
  assignedVariable: string | null
  variables: Record<string, string>
}

export interface HistoryEntry {
  id: string
  expression: string
  result: CalculationResult
  time: number
}

export type ConversionField = 'decimal' | 'hex' | 'octal' | 'binary' | 'float32' | 'float64'
