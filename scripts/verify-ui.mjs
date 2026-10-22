import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const endpoint = process.env.CDP_URL ?? 'http://127.0.0.1:9223'
const browser = await chromium.connectOverCDP(endpoint)
const context = browser.contexts()[0]
const page = context.pages().find(p => /127\.0\.0\.1:1420|tauri\.localhost|localhost/.test(p.url())) ?? context.pages()[0]
assert(page, '没有发现 Tauri 窗口，请先启动应用并开放 WebView2 调试端口')
await mkdir('artifacts', { recursive: true })
const observations = []
const failures = []
page.on('pageerror', error => failures.push(error.message))
const storageKey = 'kikyo.calculator.v1'
const original = await page.evaluate(key => localStorage.getItem(key), storageKey)
const editor = page.getByRole('textbox', { name: '计算表达式', exact: true })
const result = page.getByTestId('result-decimal')
const field = name => page.locator(`[data-conversion="${name}"]`)

async function waitUntil(predicate, message) {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(message)
}
async function run(expression, expected) {
  await editor.fill(expression)
  await editor.press('Enter')
  await waitUntil(async () => (await result.textContent().catch(() => '')) === expected, `${expression} 未得到 ${expected}: ${await page.locator('.expression-output').textContent()}`)
  assert.equal(await result.textContent(), expected)
  observations.push(`${expression.replaceAll('\n', '; ')} → ${expected}`)
}
async function conversion(name, value, expected) {
  await field(name).fill(value)
  await field(name).press('Enter')
  await waitUntil(async () => await page.locator('.conversion-panel').getAttribute('aria-busy') === 'false' && await field('decimal').inputValue() === expected, `${name}=${value} 未转换成 ${expected}`)
}

try {
  await page.evaluate(key => localStorage.removeItem(key), storageKey)
  await page.reload()
  await result.waitFor()
  assert.equal(await result.textContent(), '17')
  assert.equal((await page.locator('.expression-output').textContent()).trim(), '17')
  assert.equal(await page.locator('.hex-result strong').textContent(), '11h')
  assert.equal(await field('binary').inputValue(), '10001')
  assert.equal(await page.locator('.runtime-status').textContent(), 'Rust 计算引擎/64 位精确整数')
  observations.push('真实 Tauri 窗口首次启动 → 主结果仅显示17，HEX栏=11h，BIN=10001，Rust 引擎已连接')
  await page.screenshot({ path: 'artifacts/calculator-desktop.png', fullPage: true })

  await run('9007199254740993 + 1', '9007199254740994')
  await run('x = 0x44\ny = x >> 2\nx + y', '85')
  assert.equal(await page.locator('.variable-entry').count(), 2)
  await editor.fill('x = 99\nz = 1 / 0')
  await editor.press('Control+Enter')
  await page.locator('.error-output').waitFor()
  assert.match(await page.locator('.error-output').textContent(), /零/)
  assert.match(await page.locator('.variable-entry').filter({ hasText: 'x' }).textContent(), /68/)
  assert.equal(await page.locator('.variable-entry').filter({ hasText: 'z' }).count(), 0)
  observations.push('多行第二条除零 → 中文错误，x 保持68，失败批次未写入变量')
  await run('x + y', '85')
  await run('FFFFFFFFFFFFFFFFh', '-1')
  assert.equal((await page.locator('.expression-output').textContent()).trim(), '-1')
  await run('FFFFFFFFFFFFFFFFh & 0xFF', '255')
  await run('1 << 63', '-9223372036854775808')
  await editor.fill('1 >> 64')
  await editor.press('Enter')
  await page.locator('.error-output').waitFor()
  assert.match(await page.locator('.error-output').textContent(), /0 到 63/)
  observations.push('非法移位1 >> 64 → 范围错误，应用保持可用')
  await run('5 / 2', '2.5')
  assert.equal(await field('hex').inputValue(), '—')
  await run('pow(2, 8)', '256')
  await page.getByRole('button', { name: 'DEG', exact: true }).click()
  await run('sin(90)', '1.0')
  await page.getByRole('button', { name: 'RAD', exact: true }).click()
  await run('sin(pi / 2)', '1.0')

  await editor.fill('12 + 34')
  await editor.evaluate(input => { input.focus(); input.setSelectionRange(5, 7) })
  await page.getByRole('button', { name: '7', exact: true }).click()
  assert.equal(await editor.inputValue(), '12 + 7')
  await page.getByTitle('删除光标前的字符', { exact: true }).click()
  assert.equal(await editor.inputValue(), '12 + ')
  await page.getByRole('button', { name: 'Sin', exact: true }).click()
  await page.getByRole('button', { name: '9', exact: true }).click()
  await page.getByRole('button', { name: '0', exact: true }).click()
  assert.equal(await editor.inputValue(), '12 + sin(90)')
  observations.push('选择文本后按数字替换、退格、函数按钮光标定位 → 表达式正确')

  await run('17', '17')
  const historyCount = await page.locator('.history-entry').count()
  await conversion('decimal', '1235', '1235')
  assert.equal(await field('hex').inputValue(), '4D3')
  assert.equal(await field('octal').inputValue(), '2323')
  assert.equal(await field('binary').inputValue(), '10011010011')
  assert.equal(await result.textContent(), '17')
  assert.equal(await page.locator('.history-entry').count(), historyCount)
  await run('ans', '17')
  observations.push('转换1235 → HEX=4D3、OCT=2323、BIN=10011010011，未改变结果/ans/历史')

  await field('binary').fill('102')
  await field('binary').press('Enter')
  await page.locator('.conversion-error').waitFor()
  assert.equal(await field('binary').inputValue(), '102')
  await field('binary').press('Escape')
  assert.equal(await field('binary').inputValue(), '10001')
  observations.push('二进制输入102 → 字段报错并保留草稿；Esc恢复有效值')
  await conversion('float32', '0.1', '0.10000000149011612')
  assert.equal(await field('float32').inputValue(), '0.1')
  await conversion('hex', '4E2D', '20013')
  assert.equal(await field('unicode').inputValue(), '中')
  await field('unicode').focus()
  await run('65', '65')
  assert.equal(await field('unicode').inputValue(), 'A')
  assert.equal(await field('ascii').inputValue(), 'A')
  await run('193', '193')
  assert.equal(await field('ebcdic').inputValue(), 'A')
  observations.push('F32 0.1 量化、Unicode 中、ASCII A、IBM037 A → 正确')

  const savedCount = await page.locator('.history-entry').count()
  await page.reload()
  await result.waitFor()
  assert.equal(await result.textContent(), '193')
  assert.equal(await page.locator('.history-entry').count(), savedCount)
  assert.equal(await page.getByRole('button', { name: 'RAD', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('.variable-entry').count(), 2)
  await page.locator('.history-entry').filter({ hasText: '0x44 >> 2' }).last().click()
  assert.equal(await editor.inputValue(), '0x44 >> 2')
  assert.equal(await result.textContent(), '17')
  assert.equal(await page.locator('.variable-entry').count(), 2)
  observations.push('重载后历史、变量、RAD设置保留；历史回填不重算或回滚变量')

  await page.getByRole('button', { name: 'DEG', exact: true }).click()
  await conversion('decimal', '1235', '1235')
  await page.screenshot({ path: 'artifacts/calculator-verified.png', fullPage: true })
  // Resize the WebView viewport to the minimum supported window size.
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 680, deviceScaleFactor: 1, mobile: false })
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
  assert(dimensions.scroll <= dimensions.width, '最小窗口出现横向溢出')
  assert(await page.getByTitle('执行表达式 · Enter', { exact: true }).isVisible())
  await page.screenshot({ path: 'artifacts/calculator-960.png', fullPage: true })
  await cdp.send('Emulation.clearDeviceMetricsOverride')
  observations.push('960×680窗口 → 无页面横向溢出，四行按键和转换栏可用')

  await page.getByTitle('复制十进制结果', { exact: true }).click()
  await page.getByRole('status').waitFor()
  assert.match(await page.getByRole('status').textContent(), /已复制/)
  observations.push('复制按钮 → 已复制计算结果')
  assert.deepEqual(failures, [], '页面产生未处理异常')
  await writeFile('artifacts/verification.json', JSON.stringify({ verdict: 'PASS', url: page.url(), observations }, null, 2))
  console.log(JSON.stringify({ verdict: 'PASS', observations, screenshots: ['artifacts/calculator-verified.png', 'artifacts/calculator-960.png'] }, null, 2))
} catch (error) {
  await page.screenshot({ path: 'artifacts/calculator-failure.png', fullPage: true }).catch(() => {})
  await writeFile('artifacts/verification.json', JSON.stringify({ verdict: 'FAIL', observations, error: String(error), failures }, null, 2))
  throw error
} finally {
  const cleanupSession = await context.newCDPSession(page)
  await cleanupSession.send('Emulation.clearDeviceMetricsOverride').catch(() => {})
  await cleanupSession.detach()
  if (original !== null) {
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: original })
    await page.reload()
  }
  await browser.close()
}
