# LaTeX Copy

[English](#english) | [中文说明](#中文说明)

## English

A browser extension for copying, editing, and re-rendering mathematical formulas on web pages.

### Features

* **Click to Copy**: Left-click any rendered formula to copy its raw LaTeX source to the clipboard.
* **In-Place Editing**: Right-click (or long-press on touch devices) to open a floating editor, modify the LaTeX source, and re-render the formula directly on the page. Original formulas can be restored at any time via **Restore**.
* **Selection Copy as Markdown**: Selecting page text that includes formulas and pressing `Ctrl+C` / `Cmd+C` converts the formulas into inline (`$...$`) or block (`$$...$$`) LaTeX format.
* **Theme Adaptation**: Automatically adapts to the light or dark color scheme of the host page.

### Usage & Shortcuts

| Action                         | Mouse / Touch                            | Keyboard Shortcut                |
| :----------------------------- | :--------------------------------------- | :------------------------------- |
| **Copy LaTeX**                 | Left-click formula                       | —                                |
| **Edit Formula**               | Right-click / Long-press                 | —                                |
| **Copy Selection as Markdown** | Select text containing formulas and copy | `Ctrl+C` / `Cmd+C`               |
| **Close Editor**               | Click the close button                   | `Esc`                            |
| **Apply Render**               | Click **Render** *(MathJax)*             | `Ctrl+Enter` / `Cmd+Enter`       |
| **Restore Original**           | Click **Restore**                        | —                                |

> **Note**: KaTeX formulas support real-time rendering during input. MathJax formulas require pressing `Ctrl+Enter` (`Cmd+Enter`) or clicking **Render** to apply changes.

### Compatibility

* **Rendering Engines**: KaTeX, MathJax (v2, v3, v4), MediaWiki Math (`.mwe-math-element`), MathML, and SVG math elements.
* **Page Types**: Static HTML documents and dynamic single-page applications (SPAs).
* **Browsers**: Chromium-based browsers (v111+) and Firefox (v128+).

### Installation

1. Download the packaged extension from the [Releases](../../releases) page. (Both unsigned actually)
2. Open the extension management page in your browser:
    * **Chromium**: Open `chrome://extensions/`, enable **Developer mode**, unzip the package, and load the unpacked directory. You can drag that directory onto the page.
    * **Firefox**: Open `about:debugging#/runtime/this-firefox` and load the `.xpi` as a temporary add-on. Release Firefox will not install this unsigned package from `about:addons`.

---

## 中文说明

用于在网页中复制、编辑及重新渲染数学公式的浏览器扩展。

### 功能特性

* **单击复制**：左键单击网页中的数学公式，即可将其原始 LaTeX 源码复制到剪贴板。
* **就地编辑与渲染**：右键单击公式（触控设备为长按）可打开悬浮编辑器，修改 LaTeX 源码并在原位置重新渲染。点击 **Restore** 即可恢复初始状态。
* **选中文本复制为 Markdown**：框选包含数学公式的网页内容并执行复制（`Ctrl+C` / `Cmd+C`）时，扩展会自动将其中的公式转换为行内（`$...$`）或块级（`$$...$$`）LaTeX 格式。
* **主题自适应**：根据当前网页的配色方案自动切换浅色或深色界面。

### 操作说明与快捷键

| 操作                | 鼠标 / 触控操作                | 键盘快捷键                             |
| :------------------ | :----------------------------- | :------------------------------------- |
| **复制 LaTeX 源码** | 左键单击公式                   | —                                      |
| **打开编辑器**      | 右键单击 / 长按公式            | —                                      |
| **复制为 Markdown** | 划选包含公式的文本并复制       | `Ctrl+C` / `Cmd+C`                     |
| **关闭编辑器**      | 点击关闭按钮                   | `Esc`                                  |
| **提交渲染**        | 点击 **Render** *(仅 MathJax)* | `Ctrl+Enter` / `Cmd+Enter`             |
| **恢复初始公式**    | 点击 **Restore**               | —                                      |

> **说明**：使用 KaTeX 渲染的公式在输入时支持实时预览渲染；使用 MathJax 渲染的公式在修改后需按 `Ctrl+Enter`（`Cmd+Enter`）或点击 **Render** 按钮应用更改。

### 兼容性

* **公式引擎**：KaTeX、MathJax (v2, v3, v4)、MediaWiki 数学公式 (`.mwe-math-element`)、原生 MathML 及常见 SVG 数学公式。
* **网页类型**：支持静态网页及基于前端框架构建的动态单页应用（SPA）。
* **浏览器版本**：Chromium 内核浏览器 (111+) 与 Firefox (128+)。

### 安装方法

1. 前往本仓库的 [Releases](../../releases) 页面下载打包好的扩展文件。（都是未签名的）
2. 在浏览器中加载扩展：
    * **Chromium 内核浏览器**：打开 `chrome://extensions/`，开启**开发者模式**，解压压缩包后加载该目录。也可以把解压后的目录拖进这个页面。
    * **Firefox**：打开 `about:debugging#/runtime/this-firefox`，把 `.xpi` 作为临时附加组件加载。

## License

[MIT](LICENSE)

---

---

## Contributing?

It's just another AI-slop program, so use your AI Agent to improve it as well (yep).

这只是又一个 AI-slop 项目，所以你也可以直接让你的 AI 助手去改进它。
