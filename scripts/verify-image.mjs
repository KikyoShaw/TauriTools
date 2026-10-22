import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const desktop = !!process.env.CDP_URL
const browser = desktop ? await chromium.connectOverCDP(process.env.CDP_URL) : await chromium.launch({ executablePath: process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = desktop ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = desktop ? context.pages().find(item => /localhost|127\.0\.0\.1/.test(item.url())) ?? context.pages()[0] : await context.newPage()
if (!desktop) await page.goto(process.env.APP_URL ?? 'http://127.0.0.1:1420')
await mkdir('artifacts', { recursive: true })
await mkdir('docs/images', { recursive: true })
const failures = []
const observations = []
page.on('pageerror', error => failures.push(error.message))
const tab = name => page.getByRole('tab', { name, exact: true }).click()
const button = name => page.getByRole('button', { name, exact: true }).click()
const upload = page.getByLabel('导入处理图片', { exact: true })
async function waitForSource() {
  await page.getByAltText('原始处理图片', { exact: true }).waitFor()
  await page.waitForFunction(() => { const image = document.querySelector('img[alt="原始处理图片"]'); return image?.complete && image.naturalWidth > 0 })
}
async function processImage() {
  await button('处理并预览')
  await page.locator('.image-success').waitFor()
  await page.waitForFunction(() => { const image = document.querySelector('img[alt="处理后的图片"]'); return image?.complete && image.naturalWidth > 0 })
}
async function outputPixel(x, y) {
  return page.getByAltText('处理后的图片', { exact: true }).evaluate((image, { x, y }) => {
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const drawing = canvas.getContext('2d', { willReadFrequently: true })
    drawing.drawImage(image, 0, 0)
    return { width: canvas.width, height: canvas.height, pixel: Array.from(drawing.getImageData(x, y, 1, 1).data) }
  }, { x, y })
}
async function changeQuality(value) {
  await page.getByLabel('图片压缩质量', { exact: true }).evaluate((input, value) => {
    input.value = String(value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}
async function download(extension) {
  const pending = page.waitForEvent('download')
  await button('下载处理图片')
  const file = await pending
  assert.equal(await file.failure(), null)
  assert(file.suggestedFilename().endsWith(extension))
  const path = `artifacts/processed-image${extension}`
  await file.saveAs(path)
  return readFile(path)
}
let cdp
try {
  await tab('图片工具')
  cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  assert(await page.getByRole('button', { name: '处理并预览', exact: true }).isDisabled())
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 400; canvas.height = 200
    const drawing = canvas.getContext('2d')
    drawing.fillStyle = '#ff0000'; drawing.fillRect(0, 0, 200, 200)
    drawing.fillStyle = '#2389bf80'; drawing.fillRect(220, 60, 110, 100)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await upload.setInputFiles({ name: 'transparent.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') })
  await waitForSource()
  assert.match(await page.locator('.image-import').textContent(), /400 × 200.*包含透明像素/)
  await page.getByLabel('图片输出格式', { exact: true }).selectOption('png')
  assert(await page.getByLabel('图片压缩质量', { exact: true }).isDisabled())
  await page.getByLabel('图片目标宽度', { exact: true }).fill('200')
  assert.equal(await page.getByLabel('图片目标高度', { exact: true }).inputValue(), '100')
  await processImage()
  let pixels = await outputPixel(199, 0)
  assert.equal(pixels.width, 200); assert.equal(pixels.height, 100); assert.equal(pixels.pixel[3], 0)
  const png = await download('.png')
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  observations.push('透明PNG导入、比例联动200×100、PNG无损导出及实际透明像素 → 正确')

  await page.getByLabel('图片输出格式', { exact: true }).selectOption('jpeg')
  assert(await page.locator('.image-stale').isVisible())
  assert(await page.getByRole('button', { name: '下载处理图片', exact: true }).isDisabled())
  await page.getByLabel('JPEG 背景颜色', { exact: true }).fill('#123456')
  await processImage()
  pixels = await outputPixel(199, 0)
  assert.equal(pixels.pixel[3], 255)
  for (const [index, value] of [18, 52, 86].entries()) assert(Math.abs(pixels.pixel[index] - value) <= 8, `JPEG背景像素异常 ${pixels.pixel}`)
  const jpeg = await download('.jpg')
  assert.equal(jpeg[0], 0xff); assert.equal(jpeg[1], 0xd8)
  observations.push('PNG转JPEG → 透明区域合成#123456背景，输出像素不透明，下载文件为JPEG')

  await page.getByLabel('图片输出格式', { exact: true }).selectOption('webp')
  await page.getByLabel('图片缩放方式', { exact: true }).selectOption('percentage')
  await page.getByLabel('图片缩放百分比', { exact: true }).fill('25')
  await changeQuality(70)
  await processImage()
  pixels = await outputPixel(99, 0)
  assert.equal(pixels.width, 100); assert.equal(pixels.height, 50); assert.equal(pixels.pixel[3], 0)
  const webp = await download('.webp')
  assert.equal(webp.subarray(0, 4).toString(), 'RIFF'); assert.equal(webp.subarray(8, 12).toString(), 'WEBP')
  await upload.setInputFiles({ name: 'converted.webp', mimeType: 'image/webp', buffer: webp })
  await waitForSource()
  assert.match(await page.locator('.image-import').textContent(), /100 × 50.*image\/webp/)
  observations.push('25%缩放、WebP质量70、透明度保留、下载后重新导入 → 正确')

  await page.getByLabel('锁定图片比例', { exact: true }).uncheck()
  await page.getByLabel('图片目标宽度', { exact: true }).fill('60')
  await page.getByLabel('图片目标高度', { exact: true }).fill('35')
  await processImage()
  pixels = await outputPixel(59, 0)
  assert.equal(pixels.width, 60); assert.equal(pixels.height, 35)
  await page.getByLabel('图片目标宽度', { exact: true }).fill('0')
  await button('处理并预览')
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').textContent(), /尺寸|宽|范围|整数/)
  assert(await page.getByRole('button', { name: '下载处理图片', exact: true }).isDisabled())
  await page.getByLabel('图片目标宽度', { exact: true }).fill('8193')
  await button('处理并预览')
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').textContent(), /8192|尺寸/)
  observations.push('解锁宽高60×35、0宽度和超限尺寸 → 正确或明确报错，错误后不可下载旧结果')

  await upload.setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') })
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').textContent(), /PNG|图片/)
  assert.equal(await page.getByAltText('原始处理图片', { exact: true }).count(), 0)
  await upload.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid') })
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').textContent(), /读取|图片|解码/)
  await page.evaluate(encoded => {
    const data = new DataTransfer()
    data.items.add(new File([Uint8Array.from(atob(encoded), char => char.charCodeAt(0))], 'paste.png', { type: 'image/png' }))
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, fixture)
  await waitForSource()
  const transfer = await page.evaluateHandle(encoded => {
    const data = new DataTransfer()
    data.items.add(new File([Uint8Array.from(atob(encoded), char => char.charCodeAt(0))], 'drop.png', { type: 'image/png' }))
    return data
  }, fixture)
  await page.getByLabel('图片导入区域', { exact: true }).dispatchEvent('drop', { dataTransfer: transfer })
  await transfer.dispose()
  await waitForSource()
  assert.match(await page.locator('.image-import h2').textContent(), /drop.png/)
  observations.push('非法文件/损坏图片、粘贴图片事件和拖拽导入 → 错误清晰且能继续使用')

  const screenshotFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 900; canvas.height = 600
    const drawing = canvas.getContext('2d')
    const gradient = drawing.createLinearGradient(80, 0, 750, 550)
    gradient.addColorStop(0, '#78b5c7'); gradient.addColorStop(1, '#9468a8')
    drawing.fillStyle = gradient
    drawing.beginPath(); drawing.roundRect(70, 65, 760, 470, 40); drawing.fill()
    drawing.fillStyle = '#ffffff33'; drawing.beginPath(); drawing.arc(700, 170, 100, 0, Math.PI * 2); drawing.fill()
    drawing.fillStyle = '#ffffff20'; drawing.beginPath(); drawing.arc(175, 465, 110, 0, Math.PI * 2); drawing.fill()
    drawing.fillStyle = '#ffffff'; drawing.font = 'bold 66px sans-serif'; drawing.fillText('KikyoTools', 130, 270)
    drawing.font = '25px sans-serif'; drawing.fillText('Local image tools', 135, 330)
    drawing.font = '18px sans-serif'; drawing.fillText('PNG / JPEG / WebP', 136, 389)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await upload.setInputFiles({ name: 'kikyo-transparent.png', mimeType: 'image/png', buffer: Buffer.from(screenshotFixture, 'base64') })
  await waitForSource()
  await page.getByLabel('图片输出格式', { exact: true }).selectOption('webp')
  await changeQuality(80)
  await page.getByLabel('图片目标宽度', { exact: true }).fill('600')
  await processImage()
  await tab('JSON 工具')
  await tab('图片工具')
  assert.equal(await page.getByLabel('图片目标宽度', { exact: true }).inputValue(), '600')
  assert(await page.getByAltText('处理后的图片', { exact: true }).isVisible())
  await page.getByRole('heading', { name: '图片工具', exact: true }).click()
  await page.screenshot({ path: 'docs/images/image-tools.png', fullPage: true, scale: 'css' })
  if (desktop) await cdp.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 680, deviceScaleFactor: 1, mobile: false })
  else { await cdp.send('Emulation.clearDeviceMetricsOverride'); await page.setViewportSize({ width: 960, height: 680 }) }
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
  await page.screenshot({ path: 'artifacts/image-tools-960.png', fullPage: true, scale: 'css' })
  await button('清空图片')
  assert.equal(await page.getByAltText('原始处理图片', { exact: true }).count(), 0)
  assert.equal(await page.getByAltText('处理后的图片', { exact: true }).count(), 0)
  assert.deepEqual(failures, [])
  observations.push('原图/结果预览、体积变化、Tab保留、960px布局和清空资源 → 正常')
  await writeFile('artifacts/image-verification.json', JSON.stringify({ verdict: 'PASS', desktop, observations }, null, 2))
  console.log(JSON.stringify({ verdict: 'PASS', desktop, observations }, null, 2))
} catch (error) {
  await page.screenshot({ path: 'artifacts/image-failure.png', fullPage: true }).catch(() => {})
  throw error
} finally {
  if (cdp) await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {})
  await browser.close()
}
