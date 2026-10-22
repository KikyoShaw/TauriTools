import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const desktop = !!process.env.CDP_URL
const browser = desktop
  ? await chromium.connectOverCDP(process.env.CDP_URL)
  : await chromium.launch({ executablePath: process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = desktop ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = desktop ? context.pages().find(page => /localhost|127\.0\.0\.1/.test(page.url())) ?? context.pages()[0] : await context.newPage()
if (!desktop) await page.goto(process.env.APP_URL ?? 'http://127.0.0.1:1420')
await mkdir('artifacts', { recursive: true })
const failures = []
const observations = []
page.on('pageerror', error => failures.push(error.message))
page.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
const content = page.getByLabel('二维码生成内容', { exact: true })
const result = page.getByLabel('二维码解析结果', { exact: true })
const upload = page.getByLabel('选择二维码图片', { exact: true })
const button = name => page.getByRole('button', { name, exact: true }).click()
const tab = name => page.getByRole('tab', { name, exact: true }).click()
const source = '  Kikyo 二维码工具 👋\nhttps://github.com/KikyoShaw/TauriTools?name=中文&v=1\n第二行保留空格  '
async function waitForResult(expected) {
  await page.waitForFunction(value => document.querySelector('[aria-label="二维码解析结果"]')?.value === value, expected)
  assert.equal(await result.inputValue(), expected)
}
async function generate(text) {
  await content.fill(text)
  await button('生成二维码')
  await page.waitForFunction(() => document.querySelector('[aria-labelledby="qr-preview-title"]')?.getAttribute('aria-busy') === 'false')
  assert(await page.getByAltText('生成的二维码', { exact: true }).isVisible())
}
async function download(format) {
  const pending = page.waitForEvent('download')
  await button(`下载 ${format.toUpperCase()}`)
  const download = await pending
  assert.equal(await download.failure(), null)
  assert.match(download.suggestedFilename(), new RegExp(`\\.${format}$`))
  const path = `artifacts/verified-qrcode.${format}`
  await download.saveAs(path)
  return path
}
let cdp
try {
  await tab('二维码')
  cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await button('生成二维码')
  assert.match(await page.getByRole('alert').textContent(), /请输入二维码内容/)
  assert(await page.getByRole('button', { name: '下载 PNG', exact: true }).isDisabled())
  await generate(source)
  const png = await download('png')
  const svg = await download('svg')
  const pngBytes = await readFile(png)
  assert.equal(pngBytes.subarray(1, 4).toString(), 'PNG')
  const svgText = await readFile(svg, 'utf8')
  assert.match(svgText, /<svg/)
  assert(!svgText.includes('<script'))
  await button('解析此二维码')
  await waitForResult(source)
  assert(await page.getByAltText('待解析的二维码图片', { exact: true }).evaluate(image => image.complete && image.naturalWidth === 512))
  observations.push('中文/Emoji/网址/换行和首尾空格生成 → PNG和SVG实际下载；直接解析精确还原原文')

  await button('清空图片')
  await upload.setInputFiles(png)
  await waitForResult(source)
  await button('复制解析内容')
  assert.match(await page.locator('.toast-message').textContent(), /已复制/)
  await page.locator('.toast-message').waitFor({ state: 'hidden' })
  const preview = await page.getByAltText('待解析的二维码图片', { exact: true }).getAttribute('src')
  const jpeg = await page.evaluate(async url => {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    canvas.getContext('2d').drawImage(image, 0, 0)
    return canvas.toDataURL('image/jpeg', .95).split(',')[1]
  }, preview)
  await upload.setInputFiles({ name: 'qr-photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') })
  await waitForResult(source)
  observations.push('上传下载后的PNG、JPEG图片 → 正常识别；解析内容可复制')

  await button('清空图片')
  const pngBase64 = pngBytes.toString('base64')
  await page.evaluate(encoded => {
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0))
    const clipboardData = new DataTransfer()
    clipboardData.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }))
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  }, pngBase64)
  await waitForResult(source)
  await button('清空图片')
  const dataTransfer = await page.evaluateHandle(encoded => {
    const data = new DataTransfer()
    data.items.add(new File([Uint8Array.from(atob(encoded), char => char.charCodeAt(0))], 'dropped.png', { type: 'image/png' }))
    return data
  }, pngBase64)
  await page.locator('.qr-drop-zone').dispatchEvent('drop', { dataTransfer })
  await waitForResult(source)
  await dataTransfer.dispose()
  observations.push('粘贴图片事件、拖入图片 → 触发解析并还原内容')

  await upload.setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  assert.match(await page.getByRole('alert').textContent(), /PNG/)
  assert.equal(await result.inputValue(), '')
  await upload.setInputFiles({ name: 'corrupt.png', mimeType: 'image/png', buffer: Buffer.from('not an image') })
  await page.getByText(/图片读取失败/).waitFor()
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 200; canvas.height = 200
    const context = canvas.getContext('2d')
    context.fillStyle = 'white'; context.fillRect(0, 0, 200, 200)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    const input = document.querySelector('[aria-label="选择二维码图片"]')
    const data = new DataTransfer()
    data.items.add(new File([blob], 'blank.png', { type: 'image/png' }))
    input.files = data.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.getByText(/未识别到二维码/).waitFor()
  assert.equal(await result.inputValue(), '')
  observations.push('非图片、损坏图片和无二维码图片 → 清晰错误，不残留上次识别结果')

  await tab('生成二维码')
  await content.fill(source + 'modified')
  assert(await page.locator('.qr-stale').isVisible())
  assert(await page.getByRole('button', { name: '下载 PNG', exact: true }).isDisabled())
  await content.fill('x'.repeat(3000))
  await button('生成二维码')
  assert.match(await page.getByRole('alert').textContent(), /2953/)
  await page.getByLabel('二维码图片尺寸', { exact: true }).selectOption('256')
  await page.getByLabel('二维码纠错等级', { exact: true }).selectOption('H')
  const url = 'https://github.com/KikyoShaw/TauriTools'
  await generate(url)
  assert.equal(await page.getByAltText('生成的二维码', { exact: true }).evaluate(image => image.naturalWidth), 256)
  await button('解析此二维码')
  await waitForResult(url)
  await button('内容用于生成')
  assert.equal(await content.inputValue(), url)
  await tab('JSON 工具')
  await tab('二维码')
  assert.equal(await content.inputValue(), url)
  assert.equal(await page.getByLabel('二维码纠错等级', { exact: true }).inputValue(), 'H')
  observations.push('修改后禁用过期下载、超长内容错误、256px/H级二维码、内容回填与Tab状态 → 正常')

  await page.getByLabel('二维码图片尺寸', { exact: true }).selectOption('512')
  await page.getByLabel('二维码纠错等级', { exact: true }).selectOption('M')
  await generate(url)
  await page.getByRole('heading', { name: '二维码', exact: true }).click()
  await mkdir('docs/images', { recursive: true })
  await page.screenshot({ path: 'docs/images/qrcode-generate.png', fullPage: true, scale: 'css' })
  await button('解析此二维码')
  await waitForResult(url)
  await page.getByRole('heading', { name: '二维码', exact: true }).click()
  await page.screenshot({ path: 'docs/images/qrcode-decode.png', fullPage: true, scale: 'css' })
  if (desktop) await cdp.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 680, deviceScaleFactor: 1, mobile: false })
  else {
    await cdp.send('Emulation.clearDeviceMetricsOverride')
    await page.setViewportSize({ width: 960, height: 680 })
  }
  for (const mode of ['生成二维码', '解析二维码']) {
    await tab(mode)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
  }
  await page.screenshot({ path: 'artifacts/qrcode-960.png', fullPage: true, scale: 'css' })
  // Invalid image decoding deliberately causes a browser image-error log for its preview.
  const unexpected = failures.filter(message => !message.startsWith('Failed to load resource:'))
  assert.deepEqual(unexpected, [])
  await writeFile('artifacts/qrcode-verification.json', JSON.stringify({ verdict: 'PASS', desktop, observations }, null, 2))
  console.log(JSON.stringify({ verdict: 'PASS', desktop, observations }, null, 2))
} catch (error) {
  await page.screenshot({ path: 'artifacts/qrcode-failure.png', fullPage: true }).catch(() => {})
  throw error
} finally {
  if (cdp) await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {})
  await browser.close()
}
