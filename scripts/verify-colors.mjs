import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const desktop = !!process.env.CDP_URL
const browser = desktop
  ? await chromium.connectOverCDP(process.env.CDP_URL)
  : await chromium.launch({ executablePath: process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = desktop ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = desktop ? context.pages()[0] : await context.newPage()
if (!desktop) await page.goto('http://127.0.0.1:1420')
const failures = []
const observations = []
page.on('pageerror', error => failures.push(error.message))
await mkdir('artifacts', { recursive: true })
const r = page.getByLabel('RGB R', { exact: true })
const g = page.getByLabel('RGB G', { exact: true })
const b = page.getByLabel('RGB B', { exact: true })
const hex = page.getByLabel('十六进制颜色码', { exact: true })
const hexResult = page.getByLabel('RGB 转换 HEX 结果', { exact: true })
const rgbResult = page.getByLabel('HEX 转换 RGB 结果', { exact: true })
const tab = name => page.getByRole('tab', { name, exact: true }).click()
const button = name => page.getByRole('button', { name, exact: true }).click()
async function fillRgb(red, green, blue) { await r.fill(red); await g.fill(green); await b.fill(blue) }
let cdp
try {
  await tab('颜色转换')
  cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  for (const [values, result] of [[['255', '180', '0'], '#FFB400'], [['0', '0', '0'], '#000000'], [['255', '255', '255'], '#FFFFFF']]) {
    await fillRgb(...values)
    await button('转换为 HEX')
    assert.equal(await hexResult.inputValue(), result)
  }
  for (const [value, result] of [['#CC00FF', '204, 0, 255'], ['#f80', '255, 136, 0'], ['abcdef', '171, 205, 239'], [' #000 ', '0, 0, 0']]) {
    await hex.fill(value)
    await button('转换为 RGB')
    assert.equal(await rgbResult.inputValue(), result)
  }
  observations.push('RGB黑白边界、255/180/0、#CC00FF、#RGB简写、大小写与省略# → 转换正确')
  for (const invalid of ['256', '-1', '1.5', '']) {
    await fillRgb(invalid, '0', '0')
    await button('转换为 HEX')
    assert.match(await page.getByRole('alert').textContent(), /0 到 255/)
    assert.equal(await hexResult.count(), 0)
  }
  await fillRgb('255', '180', '0')
  await button('转换为 HEX')
  for (const invalid of ['#GG0000', '#12345', '#12345678', '']) {
    await hex.fill(invalid)
    await button('转换为 RGB')
    assert.match(await page.getByRole('alert').textContent(), /3 位或 6 位/)
    assert.equal(await rgbResult.count(), 0)
  }
  observations.push('RGB越界/负数/小数/空值、HEX非法字符/长度/透明度 → 明确报错')
  await hex.fill('#CC00FF')
  await button('转换为 RGB')
  const colorMismatches = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.position = 'fixed'
    probe.style.visibility = 'hidden'
    document.body.appendChild(probe)
    const rows = Array.from(document.querySelectorAll('[data-color-name]'))
    const mismatches = []
    const names = new Set()
    for (const row of rows) {
      const name = row.getAttribute('data-color-name')
      const cells = row.querySelectorAll('td,th')
      names.add(name.toLowerCase())
      probe.style.color = ''
      probe.style.color = name
      const standard = getComputedStyle(probe).color.replace(/\s/g, '')
      const displayed = `rgb(${cells[4].textContent.replace(/\s/g, '')})`
      const swatch = getComputedStyle(row.querySelector('.reference-color-swatch')).backgroundColor.replace(/\s/g, '')
      if (!CSS.supports('color', name) || standard !== displayed || swatch !== displayed) mismatches.push({ name, standard, displayed, swatch })
    }
    probe.remove()
    return { count: rows.length, unique: names.size, mismatches }
  })
  assert.equal(colorMismatches.count, 148)
  assert.equal(colorMismatches.unique, 148)
  assert.deepEqual(colorMismatches.mismatches, [])
  observations.push('148个颜色的名称、HEX色块和RGB显示 → 与浏览器CSS标准逐项一致')
  const search = page.getByLabel('搜索颜色', { exact: true })
  for (const query of ['rebeccapurple', '丽贝卡紫', '#663399', '102, 51, 153']) {
    await search.fill(query)
    assert.equal(await page.locator('[data-color-name]').count(), 1)
    assert.equal(await page.locator('[data-color-name]').getAttribute('data-color-name'), 'RebeccaPurple')
  }
  await page.getByRole('button', { name: '选择 RebeccaPurple #663399', exact: true }).click()
  assert.equal(await r.inputValue(), '102')
  assert.equal(await g.inputValue(), '51')
  assert.equal(await b.inputValue(), '153')
  assert.equal(await hex.inputValue(), '#663399')
  assert.equal(await hexResult.inputValue(), '#663399')
  assert.equal(await rgbResult.inputValue(), '102, 51, 153')
  await search.fill('不存在的颜色')
  assert(await page.getByText('没有匹配的颜色，请尝试其他名称或颜色码。', { exact: true }).isVisible())
  await search.fill('')
  await page.getByLabel('颜色选择器', { exact: true }).evaluate(input => {
    input.value = '#123456'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  assert.equal(await hexResult.inputValue(), '#123456')
  assert.equal(await rgbResult.inputValue(), '18, 52, 86')
  await tab('编码工具')
  await tab('颜色转换')
  assert.equal(await hex.inputValue(), '#123456')
  observations.push('英文/中文/HEX/RGB搜索、无匹配、点色块填入、取色器和Tab状态保留 → 正常')
  await button('复制 RGB')
  assert.match(await page.getByRole('status').textContent(), /已复制 rgb\(18, 52, 86\)/)
  await page.getByRole('status').waitFor({ state: 'hidden' })
  await fillRgb('255', '180', '0')
  await button('转换为 HEX')
  await hex.fill('#CC00FF')
  await button('转换为 RGB')
  await page.getByRole('heading', { name: '颜色转换', exact: true }).click()
  await mkdir('docs/images', { recursive: true })
  await page.screenshot({ path: desktop ? 'docs/images/color-converter.png' : 'artifacts/color-converter.png', fullPage: true, scale: 'css' })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 680, deviceScaleFactor: 1, mobile: false })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
  await page.screenshot({ path: 'artifacts/color-converter-960.png', fullPage: true, scale: 'css' })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await tab('ARGB / int')
  const alpha = page.getByLabel('ARGB A 通道', { exact: true })
  const red = page.getByLabel('ARGB R 通道', { exact: true })
  const green = page.getByLabel('ARGB G 通道', { exact: true })
  const blue = page.getByLabel('ARGB B 通道', { exact: true })
  const argb = page.getByLabel('ARGB 十六进制', { exact: true })
  const rgba = page.getByLabel('RGBA 十六进制', { exact: true })
  const integer = page.getByLabel('ARGB 整数输入', { exact: true })
  const signed = page.getByLabel('ARGB 有符号整数', { exact: true })
  const unsigned = page.getByLabel('ARGB 无符号整数', { exact: true })
  await alpha.fill('25')
  await red.fill('255')
  await green.fill('255')
  await blue.fill('255')
  assert.equal(await argb.inputValue(), '#19FFFFFF')
  assert.equal(await rgba.inputValue(), '#FFFFFF19')
  assert.equal(await unsigned.inputValue(), '436207615')
  await argb.fill('#80FF0000')
  assert.equal(await rgba.inputValue(), '#FF000080')
  assert.equal(await alpha.inputValue(), '128')
  assert.equal(await red.inputValue(), '255')
  await rgba.fill('#0000FF80')
  assert.equal(await argb.inputValue(), '#800000FF')
  assert.equal(await blue.inputValue(), '255')
  assert.equal(await red.inputValue(), '0')
  for (const [value, expectedHex, expectedSigned, expectedUnsigned] of [
    ['-1', '#FFFFFFFF', '-1', '4294967295'],
    ['4294967295', '#FFFFFFFF', '-1', '4294967295'],
    ['-2147483648', '#80000000', '-2147483648', '2147483648'],
    ['0', '#00000000', '0', '0'],
  ]) {
    await integer.fill(value)
    assert.equal(await argb.inputValue(), expectedHex)
    assert.equal(await signed.inputValue(), expectedSigned)
    assert.equal(await unsigned.inputValue(), expectedUnsigned)
  }
  for (const invalid of ['4294967296', '-2147483649', '1.5', '1e3', '']) {
    await integer.fill(invalid)
    assert(await page.getByRole('alert').isVisible())
  }
  await integer.fill('436207615')
  await alpha.fill('256')
  assert.match(await page.getByRole('alert').textContent(), /0 到 255/)
  await alpha.fill('25')
  await argb.fill('#GGFFFFFF')
  assert.match(await page.getByRole('alert').textContent(), /4 位或 8 位/)
  await argb.fill('#1fff')
  assert.equal(await alpha.inputValue(), '17')
  assert.equal(await rgba.inputValue(), '#FFFFFF11')
  await rgba.fill('#fff1')
  assert.equal(await argb.inputValue(), '#11FFFFFF')
  observations.push('ARGB/RGBA顺序、截图示例436207615、int32/uint32极值、透明黑和4位简写 → 正确；非法Alpha/HEX/整数被拒绝')
  await alpha.fill('128')
  await page.getByRole('button', { name: '选择 RebeccaPurple #663399', exact: true }).click()
  assert.equal(await alpha.inputValue(), '128')
  assert.equal(await argb.inputValue(), '#80663399')
  await page.getByLabel('Alpha 透明度滑块', { exact: true }).evaluate(input => {
    input.value = '0'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  assert.equal(await alpha.inputValue(), '0')
  assert.equal(await argb.inputValue(), '#00663399')
  await tab('编码工具')
  await tab('颜色转换')
  assert.equal(await argb.inputValue(), '#00663399')
  observations.push('透明度滑块、颜色表保留Alpha、一级Tab状态、棋盘格预览 → 正常')
  await integer.fill('436207615')
  await page.getByRole('heading', { name: '颜色转换', exact: true }).click()
  await page.screenshot({ path: desktop ? 'docs/images/argb-converter.png' : 'artifacts/argb-converter.png', fullPage: true, scale: 'css' })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 680, deviceScaleFactor: 1, mobile: false })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
  await page.screenshot({ path: 'artifacts/argb-converter-960.png', fullPage: true, scale: 'css' })
  assert.deepEqual(failures, [])
  observations.push('复制、960px布局、实际页面截图 → 正常')
  await writeFile('artifacts/color-verification.json', JSON.stringify({ verdict: 'PASS', desktop, observations }, null, 2))
  console.log(JSON.stringify({ verdict: 'PASS', desktop, observations }, null, 2))
} catch (error) {
  await page.screenshot({ path: 'artifacts/color-failure.png', fullPage: true }).catch(() => {})
  throw error
} finally {
  if (cdp) await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {})
  await browser.close()
}
