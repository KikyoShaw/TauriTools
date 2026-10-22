import { createCRC32, createMD5, createSHA1, createSHA256, createSHA512 } from 'hash-wasm'
import type { HashInput, HashValues, HashWorkerRequest, HashWorkerResponse } from '../utils/hash'

const CHUNK_BYTES = 1024 * 1024
const MAX_TEXT_LENGTH = 2 * 1024 * 1024
const MAX_TEXT_BYTES = 8 * 1024 * 1024
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<HashWorkerRequest>) => void) | null
  postMessage: (message: HashWorkerResponse) => void
}

async function calculate(requestId: number, input: HashInput) {
  try {
    let textBytes: Uint8Array | undefined
    let totalBytes: number
    if (input.kind === 'text') {
      if (input.text.length > MAX_TEXT_LENGTH) throw new Error('文本过长，最多支持 2 Mi 个 UTF-16 字符。')
      textBytes = new TextEncoder().encode(input.text)
      if (textBytes.byteLength > MAX_TEXT_BYTES) throw new Error('文本的 UTF-8 编码超过 8 MiB，请改用文件校验。')
      totalBytes = textBytes.byteLength
    } else {
      totalBytes = input.file.size
      if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) throw new Error('文件大小超出可安全计算的范围。')
    }
    scope.postMessage({ requestId, type: 'progress', progress: { bytesDone: 0, totalBytes } })
    const hashers = await Promise.all([createMD5(), createSHA1(), createSHA256(), createSHA512(), createCRC32()])
    for (const hasher of hashers) hasher.init()
    let bytesDone = 0
    while (bytesDone < totalBytes) {
      const end = bytesDone + Math.min(CHUNK_BYTES, totalBytes - bytesDone)
      let chunk: Uint8Array
      if (textBytes) {
        chunk = textBytes.subarray(bytesDone, end)
      } else if (input.kind === 'file') {
        try { chunk = new Uint8Array(await input.file.slice(bytesDone, end).arrayBuffer()) }
        catch { throw new Error('无法读取文件，请重新选择文件后重试。') }
      } else {
        throw new Error('无法读取待计算的文本。')
      }
      if (chunk.byteLength !== end - bytesDone) throw new Error('文件读取不完整，请重新选择文件后重试。')
      for (const hasher of hashers) hasher.update(chunk)
      bytesDone = end
      scope.postMessage({ requestId, type: 'progress', progress: { bytesDone, totalBytes } })
    }
    const keys = ['md5', 'sha1', 'sha256', 'sha512', 'crc32'] as const
    const widths = [32, 40, 64, 128, 8]
    const hashes = {} as HashValues
    hashers.forEach((hasher, index) => {
      hashes[keys[index]!] = hasher.digest('hex').toLowerCase().padStart(widths[index]!, '0')
    })
    scope.postMessage({ requestId, type: 'done', result: { hashes, bytes: bytesDone } })
  } catch (error) {
    const detail = error instanceof Error ? error.message : ''
    scope.postMessage({ requestId, type: 'error', message: detail ? `哈希计算失败：${detail}` : '哈希计算失败，请重试。' })
  }
}

scope.onmessage = (event) => {
  void calculate(event.data.requestId, event.data.input)
}
