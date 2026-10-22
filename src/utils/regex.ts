export const REGEX_TIMEOUT_MS = 1000
export const REGEX_INPUT_LIMIT = 200_000
export const REGEX_PATTERN_LIMIT = 8192
export const REGEX_MATCH_LIMIT = 1000
export const REGEX_OUTPUT_LIMIT = 1024 * 1024
export const REGEX_FLAGS = 'gimsuy'

export interface RegexRequest {
  source: string
  flags: string
  input: string
  replacement: string
}

export interface RegexMatch {
  index: number
  end: number
  text: string
  captures: Array<string | null>
  groups: Record<string, string | null>
}

export interface RegexResult {
  source: string
  flags: string
  matches: RegexMatch[]
  capped: boolean
  replacedText: string | null
  replacementWarning: string | null
}

export type RegexErrorCode = 'validation' | 'syntax' | 'timeout' | 'cancelled' | 'worker'

export interface RegexWorkerRequest extends RegexRequest {
  id: number
}

export type RegexWorkerResponse =
  | { id: number; ok: true; result: RegexResult }
  | { id: number; ok: false; code: 'validation' | 'syntax' | 'worker'; message: string }

export class RegexToolError extends Error {
  constructor(message: string, public readonly code: RegexErrorCode) {
    super(message)
    this.name = 'RegexToolError'
  }
}

// Validation never compiles or executes an expression on the UI thread.
export function validateRegexRequest(request: RegexRequest): void {
  const seen = new Set<string>()
  for (const flag of request.flags) {
    if (!REGEX_FLAGS.includes(flag)) {
      throw new RegexToolError(`不支持标志「${flag}」，仅支持 g、i、m、s、u、y。`, 'validation')
    }
    if (seen.has(flag)) throw new RegexToolError(`标志「${flag}」重复，请只保留一次。`, 'validation')
    seen.add(flag)
  }
  if (request.source.length > REGEX_PATTERN_LIMIT) {
    throw new RegexToolError(`正则表达式不能超过 ${REGEX_PATTERN_LIMIT} 个 UTF-16 代码单元。`, 'validation')
  }
  if (request.input.length > REGEX_INPUT_LIMIT) {
    throw new RegexToolError(`测试文本不能超过 ${REGEX_INPUT_LIMIT.toLocaleString()} 个 UTF-16 代码单元。`, 'validation')
  }
}

export interface RegexRunner {
  run(request: RegexRequest): Promise<RegexResult>
  cancel(): void
}

/** Each run gets a fresh module worker. Cancelling also settles the old promise. */
export function createRegexRunner(): RegexRunner {
  let nextId = 0
  let active: { cancel(): void } | undefined

  function cancel() {
    active?.cancel()
  }

  function run(request: RegexRequest): Promise<RegexResult> {
    cancel()
    const id = ++nextId
    return new Promise((resolve, reject) => {
      let worker: Worker | undefined
      let timer: ReturnType<typeof setTimeout> | undefined
      let settled = false
      const task = {
        cancel: () => finish(new RegexToolError('已取消本次匹配。', 'cancelled')),
      }
      function finish(error?: RegexToolError, result?: RegexResult) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        worker?.terminate()
        if (active === task) active = undefined
        if (error) reject(error)
        else resolve(result!)
      }
      try {
        validateRegexRequest(request)
        worker = new Worker(new URL('../workers/regex.worker.ts', import.meta.url), { type: 'module' })
        active = task
        worker.onmessage = (event: MessageEvent<RegexWorkerResponse>) => {
          const response = event.data
          if (response.id !== id) return
          if (response.ok) finish(undefined, response.result)
          else finish(new RegexToolError(response.message, response.code))
        }
        worker.onerror = event => {
          event.preventDefault()
          finish(new RegexToolError('正则处理线程运行失败，请重试。', 'worker'))
        }
        worker.onmessageerror = () => finish(new RegexToolError('无法读取正则处理结果，请重试。', 'worker'))
        timer = setTimeout(() => {
          finish(new RegexToolError('匹配超过1秒，已终止处理线程。请简化表达式或缩短测试文本后重试。', 'timeout'))
        }, REGEX_TIMEOUT_MS)
        worker.postMessage({ ...request, id } satisfies RegexWorkerRequest)
      } catch (error) {
        finish(error instanceof RegexToolError
          ? error
          : new RegexToolError('无法启动正则处理线程，请检查 Worker 支持或内容安全策略。', 'worker'))
      }
    })
  }

  return { run, cancel }
}
