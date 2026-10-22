import QRCode from 'qrcode'
import jsQR from 'jsqr'

export type QrLevel = 'L' | 'M' | 'Q' | 'H'

export interface GeneratedQr {
  png: string
  svg: string
  modules: number
  byteLength: number
}

export interface DecodedQr {
  text: string
  width: number
  height: number
  corners: Array<{ x: number; y: number }>
}

export const MAX_QR_IMAGE_BYTES = 20 * 1024 * 1024

const MAX_CONTENT_BYTES = 2953
const QR_SIZES = [256, 384, 512, 768, 1024]
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/x-ms-bmp', 'image/gif'])
const NOT_FOUND_MESSAGE = '未识别到二维码，请使用清晰、完整且留有白色边框的图片'

export async function generateQr(content: string, size: number, level: QrLevel): Promise<GeneratedQr> {
  if (!content.trim()) throw new Error('请输入二维码内容，内容不能全部为空白字符。')
  if (!QR_SIZES.includes(size)) throw new Error('请选择有效的二维码尺寸：256、384、512、768 或 1024。')
  if (!['L', 'M', 'Q', 'H'].includes(level)) throw new Error('请选择有效的纠错等级：L、M、Q 或 H。')

  // TextEncoder replaces lone surrogates; reject them before encoding to preserve the input exactly.
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = content.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('内容包含无效的 Unicode 字符，请检查后重试。')
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error('内容包含无效的 Unicode 字符，请检查后重试。')
    }
  }

  const byteLength = new TextEncoder().encode(content).length
  if (byteLength > MAX_CONTENT_BYTES) {
    throw new Error('内容超过 2953 个 UTF-8 字节，请减少内容或降低纠错等级。')
  }

  const options = {
    errorCorrectionLevel: level,
    width: size,
    margin: 4,
    color: { dark: '#000000', light: '#ffffff' },
  }
  try {
    const modules = QRCode.create(content, options).modules.size
    const png = await QRCode.toDataURL(content, { ...options, type: 'image/png' })
    const svg = await QRCode.toString(content, { ...options, type: 'svg' })
    return { png, svg, modules, byteLength }
  } catch {
    throw new Error('二维码生成失败，内容可能超过当前纠错等级的容量，请减少内容或降低纠错等级。')
  }
}

export async function decodeQrFile(file: File): Promise<DecodedQr> {
  if (!IMAGE_TYPES.has(file.type.toLowerCase())) {
    throw new Error('请选择 PNG、JPEG、WEBP、BMP 或 GIF 图片（GIF 仅识别第一帧）。')
  }
  if (file.size > MAX_QR_IMAGE_BYTES) throw new Error('图片文件不能超过 20 MiB。')
  if (file.size === 0) throw new Error('图片文件为空，请重新选择。')

  let bitmap: ImageBitmap
  try {
    // Animated images are decoded to their first frame by createImageBitmap.
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('图片读取失败，请选择有效的 PNG、JPEG、WEBP、BMP 或 GIF 图片。')
  }

  let canvas: HTMLCanvasElement | undefined
  try {
    const { width, height } = bitmap
    if (width > 8192 || height > 8192 || width * height > 24_000_000) {
      throw new Error('图片尺寸过大，请将单边缩小至 8192 像素以内，且总像素不超过 2400 万。')
    }
    if (width === 0 || height === 0) throw new Error('图片尺寸无效，请重新选择。')

    try {
      canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Canvas is unavailable')

      let previousWidth = 0
      let previousHeight = 0
      for (const maxEdge of [1200, 2000, 3200]) {
        const scale = Math.min(1, maxEdge / Math.max(width, height))
        const scanWidth = Math.max(1, Math.round(width * scale))
        const scanHeight = Math.max(1, Math.round(height * scale))
        if (scanWidth === previousWidth && scanHeight === previousHeight) continue
        previousWidth = scanWidth
        previousHeight = scanHeight
        canvas.width = scanWidth
        canvas.height = scanHeight
        // Composite transparent pixels onto white so transparent QR margins stay readable.
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, scanWidth, scanHeight)
        context.drawImage(bitmap, 0, 0, scanWidth, scanHeight)
        const image = context.getImageData(0, 0, scanWidth, scanHeight)
        const result = jsQR(image.data, scanWidth, scanHeight, { inversionAttempts: 'attemptBoth' })
        if (result) {
          const location = result.location
          return {
            text: result.data,
            width,
            height,
            // Clockwise from top-left; coordinates refer to the original image.
            corners: [location.topLeftCorner, location.topRightCorner, location.bottomRightCorner, location.bottomLeftCorner]
              .map(point => ({ x: point.x * width / scanWidth, y: point.y * height / scanHeight })),
          }
        }
      }
    } catch {
      throw new Error('图片处理失败，请选择有效的图片或缩小图片尺寸后重试。')
    }
    throw new Error(NOT_FOUND_MESSAGE)
  } finally {
    bitmap.close()
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}
