import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const desktop = !!process.env.CDP_URL
const browser = desktop
  ? await chromium.connectOverCDP(process.env.CDP_URL)
  : await chromium.launch({ executablePath: process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = desktop ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = desktop ? context.pages()[0] : await context.newPage()
if (!desktop) await page.goto(process.env.APP_URL ?? 'http://127.0.0.1:1420')
const failures = []
const observations = []
page.on('pageerror', error => failures.push(error.message))
await mkdir('artifacts', { recursive: true })
const input = page.getByLabel('JSON 输入内容', { exact: true })
const output = page.getByLabel('JSON 文本结果', { exact: true })
const button = name => page.getByRole('button', { name, exact: true }).click()
const tab = name => page.getByRole('tab', { name, exact: true }).click()
async function processJson(source, operation, expected) {
  await input.fill(source)
  await button(operation)
  assert.equal(await output.inputValue(), expected)
}
let cdp
try {
  await tab('JSON 工具')
  cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await processJson('{"name":"中文😀","list":[true,false,null,{},[]]}', '解析 / 格式化', JSON.stringify({ name: '中文😀', list: [true, false, null, {}, []] }, null, 2))
  await page.getByLabel('JSON 缩进', { exact: true }).selectOption('    ')
  assert.equal(await output.inputValue(), JSON.stringify({ name: '中文😀', list: [true, false, null, {}, []] }, null, 4))
  await page.getByLabel('JSON 缩进', { exact: true }).selectOption('\t')
  assert.equal(await output.inputValue(), JSON.stringify({ name: '中文😀', list: [true, false, null, {}, []] }, null, '\t'))
  await page.getByLabel('JSON 缩进', { exact: true }).selectOption('  ')
  const precise = '{"id":9007199254740993,"n":-0,"exp":1e+03,"decimal":1.2300,"big":1e999}'
  await processJson('  ' + precise + '\n', '压缩', precise)
  for (const literal of ['false', 'null', '0', '""', '[]', '{}']) await processJson(literal, '解析 / 格式化', literal)
  observations.push('格式化2/4/Tab缩进、压缩、中文Emoji、根节点标量、大整数/指数/-0原文 → 正确')

  const duplicate = '{"x":1,"x":2,"__proto__":{"safe":true}}'
  await processJson(duplicate, '压缩', duplicate)
  assert.match(await page.locator('.json-duplicate-warning').textContent(), /1 个重复键/)
  assert.equal(await page.evaluate(() => ({}).safe), undefined)
  await tab('树形')
  await button('全部展开')
  assert.equal(await page.locator('.json-tree-row').evaluateAll(rows => rows.filter(row => row.dataset.jsonPath === '$["x"]').length), 2)
  await button('全部折叠')
  assert.equal(await page.locator('.json-tree-row').count(), 1)
  await page.getByRole('button', { name: '展开 $', exact: true }).click()
  assert.equal(await page.locator('.json-tree-row').count(), 4)
  observations.push('树形逐项/全部展开折叠、重复键完整保留、__proto__安全呈现 → 正常')

  const text = '{"name":"中文😀","path":"C:\\temp"}\n第二行'
  await processJson(text, '转义', JSON.stringify(text))
  await processJson(JSON.stringify(text), '反转义', text)
  await processJson(JSON.stringify(text).slice(1, -1), '反转义', text)
  await processJson(' { "id": 9007199254740993, "ok": true } ', '压缩并转义', JSON.stringify('{"id":9007199254740993,"ok":true}'))
  await button('结果作为输入')
  await button('反转义')
  assert.equal(await output.inputValue(), '{"id":9007199254740993,"ok":true}')
  observations.push('转义/反转义（含或不含外层引号）、反斜杠/换行/Emoji、压缩并转义 → 正确')

  const malformed = '{\n  "a": 1,\n}'
  await input.fill(malformed)
  await button('解析 / 格式化')
  assert.match(await page.getByRole('alert').textContent(), /第 3 行/)
  await button('定位错误')
  assert.equal(await input.evaluate(element => element.selectionStart), malformed.lastIndexOf('}'))
  for (const value of ['{"a":}', '[1,]', '{a:1}', '01', 'NaN', '{"a":"\\q"}', 'true false', '', '['.repeat(129) + '0' + ']'.repeat(129)]) {
    await input.fill(value)
    await button('解析 / 格式化')
    assert(await page.getByRole('alert').isVisible(), `未拒绝非法JSON: ${value.slice(0, 40)}`)
    assert.equal(await output.inputValue(), '')
  }
  observations.push('错误行列及定位、尾逗号/缺值/非法数字/转义/深度上限 → 明确报错并清除失效结果')

  await processJson('["<img src=x onerror=alert(1)>"]', '解析 / 格式化', '[\n  "<img src=x onerror=alert(1)>"\n]')
  await tab('树形')
  assert.equal(await page.locator('.json-workspace img').count(), 0)
  await input.fill('[1,2]')
  assert.match(await page.locator('.json-stale').textContent(), /输入已修改/)
  await tab('树形')
  await tab('编码工具')
  await tab('JSON 工具')
  assert.equal(await input.inputValue(), '[1,2]')
  await tab('文本')
  assert.equal(await output.inputValue(), '[\n  1,\n  2\n]')
  await input.fill('{"keyboard":true}')
  await input.press('Control+Enter')
  assert.equal(await output.inputValue(), '{\n  "keyboard": true\n}')
  await input.press('Control+Shift+Enter')
  assert.equal(await output.inputValue(), '{"keyboard":true}')
  observations.push('HTML内容仅作文本、修改后提示重新处理、一级Tab状态、键盘快捷键 → 正常')

  await input.fill('[' + Array(1002).fill('0').join(',') + ']')
  await button('解析 / 格式化')
  await tab('树形')
  assert.equal(await page.locator('.json-tree-row').count(), 1000)
  await button('再显示 1000 项')
  assert.equal(await page.locator('.json-tree-row').count(), 1003)
  observations.push('大数组树形分批显示 → 明确提示并可查看完整节点')
  await button('填入示例')
  await button('结果作为输入')
  await tab('树形')
  await button('全部展开')
  await mkdir('docs/images', { recursive: true })
  await page.screenshot({ path: 'docs/images/json-tools.png', fullPage: true, scale: 'css' })
  await tab('文本')
  assert.match(await output.inputValue(), /9007199254740993/)
  await button('复制结果')
  assert.match(await page.locator('.toast-message').textContent(), /已复制/)
  await page.locator('.toast-message').waitFor({ state: 'hidden' })
  await page.screenshot({ path: 'artifacts/json-text-result.png', fullPage: true, scale: 'css' })
  if (desktop) await cdp.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 680, deviceScaleFactor: 1, mobile: false })
  else await page.setViewportSize({ width: 960, height: 680 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
  await page.screenshot({ path: 'artifacts/json-tools-960.png', fullPage: true, scale: 'css' })
  assert.deepEqual(failures, [])
  await writeFile('artifacts/json-verification.json', JSON.stringify({ verdict: 'PASS', desktop, observations }, null, 2))
  console.log(JSON.stringify({ verdict: 'PASS', desktop, observations }, null, 2))
} catch (error) {
  await page.screenshot({ path: 'artifacts/json-failure.png', fullPage: true }).catch(() => {})
  throw error
} finally {
  if (cdp) await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {})
  await browser.close()
}
