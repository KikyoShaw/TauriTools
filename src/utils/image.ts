export type ImageFormat = 'png' | 'jpeg' | 'webp'

export interface LoadedImage {
  bitmap: ImageBitmap
  width: number
  height: number
  mime: string
  size: number
  hasTransparency: boolean
}

export interface ImageOptions {
  format: ImageFormat
  width: number
  height: number
  quality: number
  background: string
}

export interface ConvertedImage {
  blob: Blob
  width: number
  height: number
  format: ImageFormat
  mime: string
  hasTransparency: boolean
}

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024
export const MAX_IMAGE_EDGE = 8192
export const MAX_IMAGE_PIXELS = 24_000_000

const outputMimes: Record<ImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
const inputMimes = new Set([...Object.values(outputMimes), 'image/bmp', 'image/x-ms-bmp', 'image/gif'])
const extensionMimes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif' }

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('操作已取消', 'AbortError')
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) {
    throw new Error(`图片宽高必须为 1 到 ${MAX_IMAGE_EDGE} 之间的整数`)
  }
  if (width * height > MAX_IMAGE_PIXELS) throw new Error('图片总像素不能超过 2400 万')
}

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('当前浏览器无法处理图片，请更新浏览器后重试')
  return context
}

// Read at most 128 rows at a time, so the temporary pixel array stays below 4 MiB.
async function hasTransparency(context: CanvasRenderingContext2D, width: number, height: number, signal?: AbortSignal): Promise<boolean> {
  for (let top = 0; top < height; top += 128) {
    checkAbort(signal)
    const pixels = context.getImageData(0, top, width, Math.min(128, height - top)).data
    for (let alpha = 3; alpha < pixels.length; alpha += 4) {
      if (pixels[alpha] < 255) return true
    }
    if ((top / 128 + 1) % 4 === 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      checkAbort(signal)
    }
  }
  return false
}

function sniffMime(bytes: Uint8Array): string | undefined {
  const startsWith = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte)
  if (startsWith(137, 80, 78, 71, 13, 10, 26, 10)) return 'image/png'
  if (startsWith(255, 216, 255)) return 'image/jpeg'
  if (startsWith(71, 73, 70, 56) && (bytes[4] === 55 || bytes[4] === 57) && bytes[5] === 97) return 'image/gif'
  if (startsWith(66, 77)) return 'image/bmp'
  if (startsWith(82, 73, 70, 70) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return 'image/webp'
  return undefined
}

export async function loadImage(file: File, signal?: AbortSignal): Promise<LoadedImage> {
  checkAbort(signal)
  if (file.size === 0) throw new Error('图片文件为空，请重新选择')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('图片大小不能超过 30 MiB')
  const declaredMime = file.type.toLowerCase()
  const expectedMime = declaredMime || extensionMimes[file.name.split('.').pop()?.toLowerCase() ?? '']
  if (!expectedMime || !inputMimes.has(expectedMime)) throw new Error('仅支持 PNG、JPEG、WebP、BMP 和 GIF 图片（GIF 仅处理首帧）')
  const mime = sniffMime(new Uint8Array(await file.slice(0, 16).arrayBuffer()))
  checkAbort(signal)
  if (!mime || mime !== (expectedMime === 'image/x-ms-bmp' ? 'image/bmp' : expectedMime)) {
    throw new Error('图片内容与文件格式不符，或图片文件已损坏')
  }
  let bitmap: ImageBitmap | undefined
  let canvas: HTMLCanvasElement | undefined
  try {
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      checkAbort(signal)
      throw new Error('无法解码图片，文件可能已损坏或当前浏览器不支持此图片')
    }
    checkAbort(signal)
    const { width, height } = bitmap
    validateDimensions(width, height)
    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvasContext(canvas)
    context.drawImage(bitmap, 0, 0)
    const transparent = await hasTransparency(context, width, height, signal)
    checkAbort(signal)
    return { bitmap, width, height, mime, size: file.size, hasTransparency: transparent }
  } catch (error) {
    bitmap?.close()
    throw error
  } finally {
    if (canvas) canvas.width = canvas.height = 0
  }
}

function encodeCanvas(canvas: HTMLCanvasElement, mime: string, quality: number, signal?: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal?.removeEventListener('abort', abort)
      reject(new DOMException('操作已取消', 'AbortError'))
    }
    if (signal?.aborted) return abort()
    signal?.addEventListener('abort', abort, { once: true })
    try {
      canvas.toBlob(blob => {
        signal?.removeEventListener('abort', abort)
        if (signal?.aborted) return abort()
        if (!blob || blob.size === 0) return reject(new Error('图片编码失败，请尝试较小的尺寸'))
        if (blob.type.toLowerCase() !== mime) return reject(new Error('当前浏览器不支持所选输出格式，请选择其他格式'))
        resolve(blob)
      }, mime, quality / 100)
    } catch {
      signal?.removeEventListener('abort', abort)
      reject(new Error('图片编码失败，请尝试其他格式或较小的尺寸'))
    }
  })
}

export async function convertImage(source: LoadedImage, options: ImageOptions, signal?: AbortSignal): Promise<ConvertedImage> {
  checkAbort(signal)
  const { format, width, height, quality, background } = options
  if (format !== 'png' && format !== 'jpeg' && format !== 'webp') throw new Error('请选择 PNG、JPEG 或 WebP 输出格式')
  validateDimensions(width, height)
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error('图片质量必须为 1 到 100 之间的整数')
  if (format === 'jpeg' && !/^#[0-9a-f]{6}$/i.test(background)) throw new Error('背景颜色必须为 #RRGGBB 格式，例如 #FFFFFF')
  const canvas = document.createElement('canvas')
  try {
    canvas.width = width
    canvas.height = height
    const context = canvasContext(canvas)
    if (format === 'jpeg') {
      context.fillStyle = background
      context.fillRect(0, 0, width, height)
    }
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(source.bitmap, 0, 0, width, height)
    const transparent = format === 'jpeg' ? false : await hasTransparency(context, width, height, signal)
    checkAbort(signal)
    const mime = outputMimes[format]
    const blob = await encodeCanvas(canvas, mime, quality, signal)
    checkAbort(signal)
    return { blob, width, height, format, mime, hasTransparency: transparent }
  } finally {
    canvas.width = canvas.height = 0
  }
}

export function imageDownloadName(original: string, format: ImageFormat, width: number, height: number): string {
  const basename = original.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_').replace(/\.[^.]*$/, '').replace(/[. ]+$/, '') || 'image'
  return `${basename}-${width}x${height}.${format === 'jpeg' ? 'jpg' : format}`
}

export function formatImageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const index = Math.max(0, exponent)
  return `${Number((bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2))} ${units[index]}`
}
