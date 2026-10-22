# Kikyo · 程序员计算器

基于 **Tauri 2 + Vue 3 + TypeScript + Rust** 的桌面计算器。界面采用深色主题，提供表达式输入、分组按键、历史记录、变量和进制转换。Vue 负责界面交互，Rust 负责表达式解析与数值运算，计算过程不需要联网。

## 功能

- 算术运算、64 位整数位运算和科学函数。
- 十进制、十六进制、八进制、二进制输入与转换。
- 多行表达式、变量赋值、上一条结果 `ans`。
- DEG / RAD 角度模式切换。
- Float32 / Float64 数值转换，ASCII、Unicode 及 EBCDIC IBM037 字符显示。
- 主结果区只显示数值；各进制表示独立显示在下方结果栏和右侧转换栏。
- 历史回填、变量点击插入、结果复制、键盘快捷键。
- 历史记录、变量和角度模式保存在本地，历史最多保留 100 条。

## 开发环境

Windows 开发需要：

- **Node.js 22.11+** 和 npm；本工程使用 Vite 6。
- **Rust stable（MSVC 工具链，建议最新版本）**，支持 Rust 2024 edition。
- **Visual Studio 2022 Build Tools** 或 Visual Studio，安装“使用 C++ 的桌面开发”及 Windows SDK。
- **Microsoft Edge WebView2 Runtime**。

其他平台需安装对应的 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。当前工程的打包配置针对 Windows NSIS 安装包；其他平台尚未验证。

## 安装与启动

在项目根目录执行：

```powershell
npm install
npm run tauri dev
```

Tauri 会自动启动 Vite 开发服务器并打开桌面窗口。首次编译 Rust 依赖需要较长时间。

如果终端提示找不到 `cargo`，请检查 Rust 是否已安装并将用户目录下的 `.cargo\bin` 加入 PATH，或重新打开终端。若 PowerShell 的执行策略阻止 `npm.ps1`，可以改用：

```powershell
npm.cmd install
npm.cmd run tauri dev
```

仅预览前端界面：

```powershell
npm run dev
```

浏览器地址为 `http://127.0.0.1:1420`。浏览器预览会显示提示；表达式和进制计算需要在 Tauri 桌面窗口中执行。

## 构建

前端类型检查与生产构建：

```powershell
npm run build
```

构建 Windows 应用和 NSIS 安装包：

```powershell
npm run tauri build
```

产物默认位于：

```text
src-tauri/target/release/kikyo-calculator.exe
src-tauri/target/release/bundle/nsis/
```

只构建可执行文件：

```powershell
npm run tauri build -- --no-bundle
```

## 表达式语法

### 数值

| 格式 | 示例 |
| --- | --- |
| 十进制整数 | `1235`、`-42` |
| 十进制小数与科学计数法 | `2.5`、`.5`、`1e3` |
| 十六进制 | `0x4D3`、`4D3h`、`FFh` |
| 八进制 | `0o2323` |
| 二进制 | `0b10011010011` |

### 运算符

优先级从高到低：

| 运算符 | 含义 |
| --- | --- |
| `()` | 分组、函数调用 |
| 一元 `+`、`-`、`~` | 正号、负号、按位取反 |
| `*`、`/`、`%` | 乘、除、取余 |
| `+`、`-` | 加、减 |
| `<<`、`>>` | 左移、算术右移 |
| `&` | 按位与 |
| `^` | 按位异或 |
| `\|` | 按位或 |

`^` 表示异或。乘方使用 `pow(x, y)`。

### 函数与常量

- 三角函数：`sin(x)`、`cos(x)`、`tan(x)`，按界面 DEG / RAD 设置解释角度。
- 指数与对数：`exp(x)`、`log(x)`（以 10 为底）、`ln(x)`（自然对数）。
- 其他：`abs(x)`、`sqrt(x)`、`pow(x, y)`、`min(...)`、`max(...)`、`floor(x)`、`ceil(x)`、`round(x)`。
- 常量：`pi`、`e`。函数与常量名称不区分大小写。

### 变量与多行执行

```text
x = 0x44
y = x >> 2
x + y
```

结果为 `85`，变量列表保存 `x = 68`、`y = 17`。也可以用分号分隔表达式。变量名由英文字母、数字和下划线组成，不能以数字开头；名称区分大小写。形如 `FFh` 的名称会被识别为十六进制字面量，常量 `pi`、`e` 不能赋值。

`ans` 在每一条成功执行的语句后更新。多行批次中任一语句失败时，该批变量、历史和 `ans` 不会保存，之前的成功状态保持可用。

示例：

```text
0x44 >> 2            → 17
9007199254740993 + 1 → 9007199254740994
pow(2, 8)           → 256
sin(90)             → 1.0（DEG 模式）
5 / 2               → 2.5
```

## 数值规则

- 整数使用有符号 64 位，范围为 `-9223372036854775808` 到 `9223372036854775807`。纯整数运算保留完整精度，前后端通过字符串传递数值。
- 加、减、乘、整数乘方等发生溢出时提示错误。整数除法能够整除时返回整数，否则返回双精度浮点数。
- 位运算要求数值为 64 位范围内的整数；移位数为 `0..63`。右移保留符号，左移按 64 位补码丢弃高位。
- 非十进制支持完整 64 位位模式，例如 `FFFFFFFFFFFFFFFFh` 表示 `-1`。负数的进制输出显示补码。
- 浮点数采用 IEEE 754 双精度；与浮点数混合计算遵循浮点精度规则。无穷值、NaN、除零和函数定义域错误会显示中文提示。
- Float32 / Float64 字段进行数值转换，Float32 编辑会先舍入为单精度。对于大整数，浮点显示可能舍入，十进制整数结果保持精确。
- 小数或超出整数范围的浮点值不提供整数进制及字符表示，对应字段显示 `—`。
- ASCII 显示范围为 `0..127`，EBCDIC 使用 IBM037 的 `0..255` 字节映射，Unicode 按码点转换；控制字符使用名称或转义表示。

## 操作说明

| 操作 | 行为 |
| --- | --- |
| Enter / Ctrl+Enter | 执行整个表达式区 |
| Shift+Enter | 插入新行 |
| Esc（表达式区） | 清空输入 |
| 退格按钮 | 删除选中内容或光标前一个字符 |
| 函数按钮 | 插入函数括号，光标定位到括号内；选中文字时将其包入函数 |
| `=` 按钮 | 插入赋值符号 |
| 复制按钮 | 复制最近计算结果的十进制文本 |
| 点击历史 | 恢复当时的表达式与结果，不自动重算、不回滚当前变量 |
| 点击变量 | 在表达式光标位置插入变量名 |
| 转换框 Enter / 失焦 | 校验并转换数值；转换不改变 `ans`、变量或历史 |
| 转换框 Esc | 撤回草稿，恢复有效值 |

转换栏中的十进制、十六进制、八进制、二进制和浮点字段可以编辑；字符字段只读。历史和变量保存在 WebView 的本地存储中，开发窗口与打包应用使用的来源不同，记录可能独立保存。

## 验证

Rust 单元测试、格式和静态检查：

```powershell
npm run test:rust
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

如果缺少检查组件：

```powershell
rustup component add rustfmt clippy
```

真实桌面 UI 验证使用 Playwright 连接 WebView2。先在一个终端启动带调试端口的桌面应用：

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9223'
npm run tauri dev
```

在另一个终端执行：

```powershell
npm run test:ui
```

可通过 `CDP_URL` 环境变量指定其他地址。脚本通过真实界面验证大整数、变量、错误处理、角度模式、按键、进制和字符转换、页面重载后的持久化及较小窗口布局。截图和 JSON 报告写入 `artifacts/`，该目录不纳入版本控制。脚本执行期间会操作桌面窗口；如果开始前存在本地记录，结束时恢复原记录。

## 项目结构

```text
public/calculator.svg             应用图标源文件
src/App.vue                       主窗口布局与编辑操作
src/style.css                     深色主题与响应式样式
src/components/                   分组键盘、转换面板
src/composables/useCalculator.ts  计算、历史、变量和持久化状态
src/services/calculator.ts        Tauri 命令调用
src/types/calculator.ts           前后端数据类型
src-tauri/src/calculator.rs        Rust 表达式引擎与单元测试
src-tauri/src/lib.rs               Tauri 命令注册
src-tauri/tauri.conf.json          窗口、构建和安装包配置
scripts/verify-ui.mjs              实际桌面 UI 验证
```

## 许可证

沿用仓库现有 [LICENSE](LICENSE)。
