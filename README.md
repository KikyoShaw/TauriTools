# KikyoTools · 开发工具

基于 **Tauri 2 + Vue 3 + TypeScript + Rust** 的本地工具箱，包含可切换的“计算器”“编码工具”“颜色转换”“JSON 工具”“二维码”“开发辅助”和“图片工具”七个页面。界面采用深色主题，页面切换保留各自输入。Rust 负责计算器的表达式运算，其他工具在本地浏览器环境处理，均不需要联网。

## 界面预览

以下截图来自实际运行的应用界面。

### 程序员计算器

支持表达式、位运算、历史记录、变量和多进制转换。

![程序员计算器：表达式计算、分组键盘和右侧进制转换](docs/images/calculator.png)

### 编码工具

Unicode、UTF-8、URL、ASCII / Native、Hex、HTML、Base64 等工具通过分类 Tab 切换。

![编码工具：Unicode 编码示例与左右输入结果区域](docs/images/encoding-tools.png)

### Unix 时间戳

支持时间戳和日期双向转换，以及秒/毫秒、本地时区/UTC 切换。

![Unix 时间戳：时间戳与日期双向转换](docs/images/timestamp.png)

### 颜色转换

RGB 与 HEX 双向转换、ARGB/RGBA 与 32 位整数互转、透明度预览、取色器，以及可搜索的 CSS 命名颜色表。

![颜色转换：RGB 与 HEX 转换面板、颜色预览和标准颜色对照表](docs/images/color-converter.png)

#### ARGB ↔ int 与透明度

![ARGB 与整数转换：RGBA 通道、两种 HEX 顺序、32 位整数和棋盘格透明预览](docs/images/argb-converter.png)

### JSON 工具

JSON 格式化、压缩、字符串转义和可展开的树形解析，保留大整数与重复键。

![JSON 工具：格式化输入、树形解析、大整数和类型展示](docs/images/json-tools.png)

### 二维码

文本或网址生成静态二维码，支持 PNG/SVG 下载；上传、拖入或粘贴图片即可解析内容。

![二维码生成：文本网址输入、纠错等级与 PNG/SVG 下载](docs/images/qrcode-generate.png)

![二维码解析：本地图片识别与原始文本结果](docs/images/qrcode-decode.png)

### 开发辅助

文本与 JSON 差异对比、文本和文件的哈希校验，以及 JavaScript 正则匹配与替换调试。

![文本与 JSON 差异对比](docs/images/debug-diff.png)

![文本和文件哈希校验](docs/images/debug-hash.png)

![正则匹配、捕获组与替换预览](docs/images/debug-regex.png)

### 图片工具

导入或粘贴图片，本地进行 PNG/JPEG/WebP 格式转换、质量压缩和尺寸缩放，支持透明图片对照预览及 JPEG 背景色。

![图片工具：格式质量设置、缩放和原图结果对照](docs/images/image-tools.png)

## 功能

- 算术运算、64 位整数位运算和科学函数。
- 十进制、十六进制、八进制、二进制输入与转换。
- 多行表达式、变量赋值、上一条结果 `ans`。
- DEG / RAD 角度模式切换。
- Float32 / Float64 数值转换，ASCII、Unicode 及 EBCDIC IBM037 字符显示。
- 主结果区只显示数值；各进制表示独立显示在下方结果栏和右侧转换栏。
- 历史回填、变量点击插入、结果复制、键盘快捷键。
- 历史记录、变量和角度模式保存在本地，历史最多保留 100 条。

## 编码工具

顶部选择“编码工具”，再切换分类。每个分类分别保留输入、结果和错误信息；左侧输入内容，右侧显示纯文本结果，支持复制、交换和清空。编码内容仅保存在当前窗口内存中，关闭应用后清除。

| 工具 | 功能与格式 |
| --- | --- |
| Unicode 编码 | 文本与 `\uXXXX` / `\u{...}` 转义互转，支持中文和 Emoji；“中文转 Unicode”保留 ASCII 字符 |
| UTF-8 编码 | UTF-8 字节转十六进制，如 `中` → `E4 B8 AD`；解码支持空格、`0x` 和 `\x` 格式 |
| URL 编码/解码 | URL 参数、完整 URL、表单三种模式；表单模式用 `+` 表示空格 |
| Unix 时间戳 | 时间戳与日期双向转换，秒/毫秒、本地时间/UTC、当前时间、ISO 8601 带时区日期 |
| ASCII / Native | 类似 `native2ascii`：仅将非 ASCII 字符转为 Unicode 转义，反向恢复文本 |
| Hex 编码/解码 | UTF-8 文本与连续十六进制字节互转 |
| HTML 编码/解码 | HTML 特殊字符转义及命名/数字实体解码，结果不作为 HTML 执行 |
| Base64 | UTF-8 文本的标准或 URL 安全 Base64 编码与解码 |
| Base 编码/解码 | Base16、RFC 4648 Base32、Bitcoin 字符集 Base58 |

文本框中 `Ctrl+Enter` 编码，`Ctrl+Shift+Enter` 解码。二进制解码使用严格 UTF-8，非法字节或无效转义会显示错误。Base58 为避免大文本转换阻塞窗口，输入有单独的长度限制。

时间戳单位需要明确选择；无时区日期按选择的本地时区或 UTC 解释，ISO 日期的 `Z` / 时区偏移优先。无效日期（如 2 月 30 日）会报错。秒级输出向下取整，本地夏令时重复时段采用较早一次；需要消除歧义时输入带偏移的 ISO 日期。

## 颜色转换

顶部选择“颜色转换”，页面内提供 **RGB / HEX** 和 **ARGB / int** 两种模式。

### RGB / HEX

- **RGB → HEX**：三个通道均为 `0..255` 的整数，例如 `255, 180, 0` → `#FFB400`。
- **HEX → RGB**：支持 `#RRGGBB` 和 `#RGB`，可省略 `#`，不区分大小写。例如 `#CC00FF` → `204, 0, 255`，`#F80` → `255, 136, 0`。
- 转换结果使用规范的大写 HEX，支持复制 HEX、RGB 及 CSS `rgb(...)`。

### ARGB / int

编辑 RGBA 通道、ARGB、RGBA 或十进制整数时，其他格式自动联动：

| 格式 | 规则 |
| --- | --- |
| A / R / G / B | 每个通道为 `0..255` 的整数；A=0 全透明，A=255 不透明 |
| ARGB | `#AARRGGBB`，Alpha 在前，支持 `#ARGB` 四位简写 |
| RGBA | `#RRGGBBAA`，Alpha 在后，支持 `#RGBA` 四位简写；这是 CSS 八位 HEX 的顺序 |
| int32 | 有符号 32 位整数，范围 `-2147483648..2147483647` |
| uint32 | 无符号 32 位整数，范围 `0..4294967295` |

整数统一按 `0xAARRGGBB` 打包，计算式为 `A × 16777216 + R × 65536 + G × 256 + B`。int32 与 uint32 表示同一组 32 位位模式。HEX 及整数都是标准化结果，不对 RGB 做预乘 Alpha。

示例：`A=25, R=G=B=255` → ARGB `#19FFFFFF`、RGBA `#FFFFFF19`、整数 `436207615`；不透明白色为 int32 `-1` / uint32 `4294967295`。

提供棋盘格透明预览、Alpha 滑块和取色器，可复制两种 HEX、有符号/无符号整数及 CSS `rgba(...)`。Alpha 的 CSS 小数显示保留最多六位；整数和 HEX 保留精确的八位通道值。输入不完整或无效时显示错误，其他字段及预览保留最近有效值。

### 颜色对照表

- 对照表包含 **148 个 CSS 标准命名颜色**，支持英文名、中文描述、HEX 和 RGB 搜索，保留 Aqua/Cyan、Gray/Grey 等同色别名。
- 取色器及对照表色块会填入颜色。ARGB 模式下更改 RGB 时保留最近有效的 Alpha。
- 无效通道、小数、越界整数等输入会显示错误，不会自动截断或取整。切换模式和 Tab 均保留输入和结果。

交互参考 [RGB 与十六进制颜色转换工具](https://www.sioe.cn/yingyong/yanse-rgb-16/)，颜色名称和数值采用 CSS 标准。

## JSON 工具

顶部选择“JSON 工具”，在左侧粘贴内容，右侧切换文本结果或树形视图。数据完全在本地处理，桌面端及浏览器预览均可使用。

| 操作 | 行为 |
| --- | --- |
| 解析 / 格式化 | 严格校验 JSON，按 2 空格、4 空格或 Tab 缩进输出 |
| 压缩 | 去除字符串外的无用空白，保留原始数字写法和键顺序 |
| 转义 | 将整段输入转为 JSON 字符串，包含外层双引号，支持任意文本 |
| 反转义 | 解码一层 JSON 字符串；也支持不带外层引号的转义文本 |
| 压缩并转义 | 先校验并压缩 JSON，再将其转为 JSON 字符串 |
| 树形 | 显示对象、数组及标量类型，可逐项或全部展开/折叠 |
| 结果作为输入 | 将结果回填左侧，方便连续处理 |

- 支持对象、数组以及字符串、数字、布尔值、`null` 根节点。
- 数值不经过 JavaScript `Number` 转换，`9007199254740993`、`-0`、`1e+03` 等原文在格式化与压缩后保持不变。
- 重复键会提示并按原顺序保留；格式化不会排序、合并或覆盖成员。
- 严格 JSON 不接受注释、单引号、尾逗号、`NaN` 等扩展语法。错误提供行列及“定位错误”按钮。
- 输入修改后会提示结果尚未更新。转义和反转义输出为文本，需要解析时将结果回填再格式化。
- `Ctrl+Enter` 格式化，`Ctrl+Shift+Enter` 压缩。切换页面保留内容，关闭窗口后不保存 JSON 数据。
- 单次输入最多 2 Mi 个 UTF-16 代码单元，最大深度 128 层、最多 50,000 个值节点。树形视图分批显示展开节点，每批 1,000 项；长字符串在树形中省略显示，完整内容保留在文本结果中。

## 二维码

顶部选择“二维码”，通过“生成二维码”和“解析二维码”切换模式。内容、生成图片和解析结果只保存在当前窗口内存中，切换 Tab 不会丢失，关闭窗口后清除。

### 生成二维码

- 支持文本、网址、中文、Emoji 和多行内容，按 UTF-8 编码；保留首尾空格及换行。网址建议包含 `https://`。
- 提供 256、384、512、768、1024 px 五种 PNG 尺寸，以及 L / M / Q / H 纠错等级，默认 512 px / M。
- 支持 PNG 图片和 SVG 矢量文件下载，并可直接“解析此二维码”核对内容。
- 输入或设置修改后需重新生成，过期结果不能下载。`Ctrl+Enter` 生成。
- 单次最多 2953 个 UTF-8 字节，不同字符类型和纠错等级的实际容量不同，容量不足会提示减少内容或降低纠错等级。
- 生成的是内容直接写入图片的静态二维码，无服务端有效期，也不提供动态码、访问统计或短链接托管。

### 解析二维码

- 上传、拖入图片，或在当前页按 `Ctrl+V` 粘贴图片自动识别。支持 PNG、JPEG、WebP、BMP、GIF 首帧。
- 支持复制解析内容和将内容回填到生成页。网址按纯文本显示，不自动访问或执行。
- 图片限 20 MiB，单边不超过 8192 px、总像素不超过 2400 万；识别时会按不同分辨率处理，扫描尺寸最大单边 3200 px。
- 一张图返回首个识别到的二维码，不支持相机、条形码或批量多码识别。模糊、遮挡严重或过小的二维码可能无法读取，请使用清晰完整并留有白色边框的图片。
- 生成和解析使用 `qrcode`、`jsQR`，均在本地完成，二维码内容与上传图片不会发送到外部服务。

## 开发辅助

顶部选择“开发辅助”，再切换“文本 / JSON 对比”“哈希与文件校验”或“正则调试”。各工具的输入和已完成结果在页面切换时保留，文本和文件均不上传。

### 文本 / JSON 对比

- 文本按行比较，展示新增、删除及行号，支持忽略行内空白差异、上一处/下一处差异跳转。
- JSON 按结构比较，按路径列出字段新增、删除、类型和值变化；可忽略对象键顺序，数组仍按位置比较。
- JSON 使用现有精确解析器，保留大整数精度。重复键会报错，避免结构比较产生歧义。
- 输入和结果自动换行。修改内容或选项后提示重新比较，展示上次结果时会明确标记。
- 单侧最多 2 Mi 个 UTF-16 代码单元，文本模式两侧合计最多 10,000 行，文本差异计算限制 1 秒。支持导入不超过 2 MiB 的 UTF-8 文件。结果每批显示 1,000 行/项，差异导航会自动展开目标所在批次。

### 哈希与文件校验

- 同时计算 MD5、SHA-1、SHA-256、SHA-512 和 CRC32，结果为十六进制摘要。
- 文本按 UTF-8 原样处理，空文本也可计算。文件按原始字节分块计算，支持拖入、进度显示和取消，不会一次性读取整个文件。
- 可输入预期校验值并选择算法，自动比较是否一致；忽略摘要字母大小写及首尾空白。
- 计算在后台 Worker 中执行，文件内容只在本地读取；更改输入后需要重新计算。

### 正则调试

- 使用 JavaScript 正则语法，表达式不包含外层 `/.../`；支持 g、i、m、s、u、y 标志。
- 展示匹配高亮、位置、捕获组和命名捕获组，并提供替换预览及复制结果。
- 支持 JavaScript 替换语法，例如 `$&`、`$1`、`$<name>`、`$$`。
- 正则在独立 Worker 中运行，超过 1 秒会终止计算，页面可继续操作。零宽匹配也会推进位置，避免无限循环。
- 测试文本最多 200,000 个 UTF-16 代码单元、表达式最多 8,192 个。匹配最多显示 1,000 处，超限会明确提示并停止提供替换结果，避免把部分结果误作完整结果。
- 替换输出最多 1 Mi 个 UTF-16 代码单元；超出后仍可查看匹配详情，但不提供截断的替换文本。

## 图片工具

顶部选择“图片工具”，通过选图、拖拽或 `Ctrl+V` 粘贴截图导入单张图片。图片和处理结果只保存在当前窗口内存中，切换 Tab 保留，关闭后清除。

- **格式转换**：导入 PNG、JPEG、WebP、BMP 或 GIF 首帧，导出 PNG、JPEG、WebP。依赖本机 WebView/浏览器的图像编解码能力。
- **质量压缩**：JPEG/WebP 可选择 1–100 的质量；PNG 为无损编码，不使用质量参数。展示原图、结果大小及体积变化，文件并不保证一定变小。
- **尺寸调整**：按宽高或百分比缩放，默认锁定原始比例。百分比可保留两位小数，范围大于 0 到 1000%；尺寸按像素取整。
- **透明通道**：PNG/WebP 保留透明度；JPEG 会把透明区域合成到所选背景色，默认白色。棋盘格仅用于预览，不会加入导出图片。
- **图片信息**：显示尺寸、输入格式、文件大小，以及是否存在非完全不透明的像素。
- **导出**：点击“处理并预览”后下载，文件名包含目标尺寸，原文件不会被覆盖。设置改变后需重新处理，防止下载过期结果。
- **限制**：输入不超过 30 MiB，输入与输出单边最大 8192 px、总像素最大 2400 万。动画只处理首帧，导出会重新编码像素，不保留 EXIF 等元数据。

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

浏览器地址为 `http://127.0.0.1:1420`。编码工具、颜色转换、JSON、二维码、开发辅助和图片工具可直接使用；计算器预览会显示提示，表达式和数值进制计算需要在 Tauri 桌面窗口中执行。

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
src-tauri/target/release/KikyoTools.exe
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

编码工具可直接进行浏览器界面验证。先运行 `npm run dev`，再在另一个终端执行：

```powershell
npm run test:encoding
```

该脚本默认使用本机 Microsoft Edge；可用 `BROWSER_PATH` 指定浏览器路径，或设置 `CDP_URL` 连接已开启调试端口的 Tauri 窗口。覆盖各编码往返、非法输入、Tab 状态保留、时间戳和日期校验，并保存截图到 `artifacts/`。

颜色转换界面验证同样支持浏览器或 `CDP_URL` 指定的桌面窗口：

```powershell
npm run test:colors
```

覆盖 RGB/HEX、ARGB/RGBA/整数双向转换、Alpha 与有符号/无符号边界、非法输入、148 个命名颜色与浏览器 CSS 标准比对、搜索、取色器、Tab 状态和窄窗口布局。

JSON 工具的界面验证：

```powershell
npm run test:json
```

默认连接 `http://127.0.0.1:1420`，可通过 `APP_URL` 指定其他开发地址，或通过 `CDP_URL` 接入桌面窗口。覆盖格式化缩进、树形展开、数值原文与重复键保留、转义往返、错误定位、Tab 状态和窄窗口布局；截图与报告写入 `artifacts/`，示例截图同步到 `docs/images/json-tools.png`。

二维码工具界面验证：先启动 `npm run dev`，再执行：

```powershell
npm run test:qrcode
```

同样支持 `APP_URL` 指定开发地址、`CDP_URL` 连接桌面窗口和 `BROWSER_PATH` 指定本机浏览器。覆盖 PNG/SVG 下载、中文和多行内容往返、图片上传/拖拽/粘贴事件、非法图片、设置更新和 Tab 状态保留。该脚本使用 PNG、JPEG 识别样例；其他支持格式的识别效果取决于图片内容和清晰度。

开发辅助工具界面验证：先运行 `npm run dev`，再执行：

```powershell
npm run test:debug
```

可用 `APP_URL` 指定页面地址、`CDP_URL` 连接实际桌面窗口、`BROWSER_PATH` 指定本机浏览器。验证包含 JSON 大整数与数值等价、差异导航、已知哈希值、文件分块和取消、正则捕获组与替换、零宽匹配及超时恢复，并保存截图和观察结果。

图片工具界面验证：先启动 `npm run dev`，再执行：

```powershell
npm run test:image
```

同样支持 `APP_URL`、`CDP_URL` 和 `BROWSER_PATH`。通过实际界面导入透明 PNG、转换并下载 PNG/JPEG/WebP，核对导出尺寸和像素透明度、JPEG 背景、比例缩放、错误输入、拖拽/粘贴事件及 Tab 状态。截图和观察结果保存在 `artifacts/`，预览图同步到 `docs/images/image-tools.png`。

## 项目结构

```text
public/calculator.svg             应用图标源文件
src/App.vue                       七个一级 Tab 的页面容器
src/views/ImagePage.vue            图片导入、缩放、格式设置和导出页面
src/image.css                     图片工具设置、预览和窄窗口样式
src/utils/image.ts                本地图片校验、透明度扫描和 Canvas 编解码
scripts/verify-image.mjs           图片工具实际界面与下载验证
src/views/DebugPage.vue            开发辅助分类和子工具切换
src/components/debug/             文本对比、哈希校验和正则调试界面
src/utils/diff.ts                 文本行差异与精确 JSON 结构比较
src/utils/hash.ts                 分块摘要计算和 Worker 生命周期
src/utils/regex.ts                正则 Worker 请求、取消和超时控制
src/workers/                      后台哈希与正则计算
src/styles/                       三项开发辅助工具的样式
src/debug.css                     开发辅助导航与窄窗口适配
src/views/CalculatorPage.vue       计算器页面
src/views/EncodingPage.vue         编码工具页面及二级分类
src/views/ColorPage.vue            RGB/HEX 转换、颜色预览和对照表
src/style.css                     计算器深色主题与响应式样式
src/encoding.css                  工具导航、编码与时间戳样式
src/color.css                     颜色转换页面样式
src/data/namedColors.ts            148 个 CSS 标准命名颜色
src/components/                   分组键盘、转换面板、时间戳与 ARGB 工具
src/utils/encoding.ts              本地文本编码转换
src/utils/timestamp.ts             日期校验和时间戳转换
src/views/JsonPage.vue             JSON 解析、压缩和转义页面
src/json.css                      JSON 编辑区与树形视图样式
src/components/JsonTree.vue        分批渲染的可折叠 JSON 树
src/utils/json.ts                 保留数字原文与重复键的 JSON 解析器
src/utils/color.ts                 RGB/ARGB/RGBA/整数校验与转换
src/views/QrPage.vue               二维码生成与图片解析页面
src/qrcode.css                    二维码输入、预览和上传区域样式
src/utils/qrcode.ts                本地二维码编码、图片识别和输入校验
scripts/verify-qrcode.mjs           二维码实际界面验证
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
