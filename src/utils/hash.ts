export const HASH_ALGORITHMS = [
  { id: 'md5', label: 'MD5', length: 32 },
  { id: 'sha1', label: 'SHA-1', length: 40 },
  { id: 'sha256', label: 'SHA-256', length: 64 },
  { id: 'sha512', label: 'SHA-512', length: 128 },
  { id: 'crc32', label: 'CRC32', length: 8 },
] as const

export const MAX_HASH_TEXT_LENGTH = 2 * 1024 * 1024
export const MAX_HASH_TEXT_BYTES = 8 * 1024 * 1024
export type HashAlgorithm = typeof HASH_ALGORITHMS[number]['id']
export type HashValues = Record<HashAlgorithm, string>
export type HashInput = { kind: 'text'; text: string } | { kind: 'file'; file: File }
export interface HashProgress { bytesDone: number; totalBytes: number }
export interface HashResult { hashes: HashValues; bytes: number }
export interface HashTask { promise: Promise<HashResult>; cancel: () => void }
export interface HashWorkerRequest { requestId: number; input: HashInput }
export type HashWorkerResponse =
  | { requestId: number; type: 'progress'; progress: HashProgress }
  | { requestId: number; type: 'done'; result: HashResult }
  | { requestId: number; type: 'error'; message: string }

let nextRequestId = 0

/** Each request owns its worker. Cancellation always rejects with AbortError. */
export function startHash(input: HashInput, onProgress?: (progress: HashProgress) => void): HashTask {
  const requestId = ++nextRequestId
  let worker: Worker | undefined
  let settled = false
  let rejectPromise: (reason: Error) => void = () => {}
  const cleanup = () => {
    if (worker) {
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
      worker = undefined
    }
  }
  const promise = new Promise<HashResult>((resolve, reject) => {
    rejectPromise = reject
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    try {
      if (input.kind === 'text' && input.text.length > MAX_HASH_TEXT_LENGTH) {
        throw new Error('文本过长，最多支持 2 Mi 个 UTF-16 字符。')
      }
      if (input.kind === 'file' && (!Number.isSafeInteger(input.file.size) || input.file.size < 0)) {
        throw new Error('文件大小超出可安全计算的范围。')
      }
      worker = new Worker(new URL('../workers/hash.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<HashWorkerResponse>) => {
        const message = event.data
        if (settled || message.requestId !== requestId) return
        if (message.type === 'progress') {
          try { onProgress?.(message.progress) }
          catch { fail(new Error('更新计算进度失败。')) }
        } else if (message.type === 'error') {
          fail(new Error(message.message))
        } else if (message.type === 'done') {
          settled = true
          cleanup()
          resolve(message.result)
        }
      }
      worker.onerror = (event) => {
        event.preventDefault()
        fail(new Error('哈希计算线程启动或运行失败，请检查浏览器是否支持 WebAssembly。'))
      }
      worker.onmessageerror = () => fail(new Error('无法读取哈希计算结果，请重试。'))
      // File is structured-cloned; its contents are read incrementally in the worker.
      worker.postMessage({ requestId, input } satisfies HashWorkerRequest)
    } catch (error) {
      fail(error instanceof Error ? error : new Error('无法启动哈希计算。'))
    }
  })
  return {
    promise,
    cancel() {
      if (settled) return
      settled = true
      cleanup()
      rejectPromise(new DOMException('已取消哈希计算。', 'AbortError'))
    },
  }
}
