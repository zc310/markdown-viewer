# Markdown Viewer

一个使用 Wails v2 开发的本地 Markdown 阅读器。Go 负责文件系统和桌面能力，前端负责文档排版。

## 功能

- 双击 `.md` 和 `.markdown` 文件打开
- 单实例运行，应用已打开时双击其他 Markdown 文件会切换文档
- 多个文件使用 Tab 管理，可切换和关闭
- 导出当前 Markdown 文档为 PDF
- 拖放文件、`Ctrl/Cmd+O` 打开文件
- 标题、列表、任务列表、表格、引用、代码块和行内格式
- 使用 `markdown-it` 解析 Markdown，支持常用代码块语法高亮和复制代码
- 根据 Markdown 标题在左侧显示文档导航，可点击标题快速跳转，并可通过工具栏开关显示/隐藏
- 工具栏提供软件关于对话框，显示版本和技术信息
- 关于对话框中的版本号可点击打开项目网站
- 相对路径图片和 Markdown 文档链接
- 支持跨父级目录的相对图片路径，例如 `../../docs/screenshots/viewer/linux.png`
- 外部 HTTP/HTTPS 链接使用系统浏览器打开
- 文件变化自动刷新
- 浅色/深色主题和字号调整
- 默认限制文档和图片资源为 10 MB

## 环境要求

- Go 1.25+
- Wails CLI v2.15+
- 前端构建和 `wails dev` 需要 Node.js 20.19+ / npm
- Linux 构建使用 Wails 的 `webkit2_41` 构建标签，需要 GTK3、WebKitGTK 4.1 和 libsoup 3 开发包

Wails CLI 不在系统 PATH 时，可以直接使用：

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0
```

## 开发

标准前端开发命令：

```bash
cd frontend
npm install
npm run dev
```

Wails 应用开发：

```bash
wails dev
```

前端使用 Vite 构建，`markdown-it` 会被打包进应用。Wails 构建前会执行 `npm install` 和 `npm run build`，生成的 `frontend/dist` 随后由 Go 的 `embed.FS` 打包进应用。

## 构建

```bash
wails build
```

首次构建或依赖更新后，请先安装前端依赖：

```bash
cd frontend
npm install
```

项目配置已经默认加入 `webkit2_41` 标签，Linux 构建等价于：

```bash
wails build --platform linux/amd64 --tags webkit2_41
```

也可以使用 Makefile 编译并制作 ZIP 包：

```bash
# 编译 Linux amd64、Windows amd64/ARM64 程序
make build

# 编译默认平台和架构、Windows Installer，并生成 ZIP 包
make package

# 使用 aarch64-w64-mingw32-clang 编译 Windows ARM64 程序
make build-windows-arm64

# 编译 Windows ARM64 程序并生成 ZIP 包
make package-windows-arm64

# 编译 Windows ARM64 NSIS 安装程序并生成 ZIP 包
make package-windows-arm64-installer

# 使用 aarch64-linux-gnu-gcc 编译 Linux ARM64 程序
make build-linux-arm64

# 编译 Linux ARM64 程序并生成 ZIP 包
make package-linux-arm64
```

默认生成文件：

```text
dist/markdown-viewer-linux-amd64.zip
dist/markdown-viewer-windows-amd64.zip
dist/markdown-viewer-windows-arm64.zip
dist/markdown-viewer-windows-amd64-installer.zip
dist/markdown-viewer-windows-arm64-installer.zip
```

直接执行 `make` 与 `make package` 相同，会默认编译 Linux amd64、Windows amd64/ARM64 版本，制作两种架构的 Windows NSIS 安装程序，并生成默认 ZIP 包。Linux ARM64 使用独立目标，不会被默认构建触发。

单独执行以下目标可以只构建 Windows ARM64 产物：

```text
dist/markdown-viewer-windows-arm64.zip
dist/markdown-viewer-windows-arm64-installer.zip
```

单独执行以下目标可以只构建 Linux ARM64 产物：

```text
dist/markdown-viewer-linux-arm64.zip
```

如果 `wails` 不在 PATH 中，可以指定 CLI 路径：

```bash
make WAILS=/path/to/wails package
```

Linux 版本使用 `webkit2_41`，运行目标系统需要安装对应架构的 WebKitGTK 4.1 和 libsoup 3；Windows 版本需要 WebView2 Runtime。默认构建 ARM64 版本还需要对应的交叉编译器和 ARM64 目标库。Windows Installer 构建还需要安装 NSIS，并确保 `makensis` 位于 PATH 中。

构建 Windows 安装程序：

```bash
wails build --platform windows/amd64 --nsis
```

使用 Makefile 制作 Windows Installer：

```bash
make build-windows-installer
make package-windows-installer
```

安装程序输出为 `build/bin/markdown-viewer-amd64-installer.exe`，ZIP 包输出为 `dist/markdown-viewer-windows-amd64-installer.zip`。

Windows ARM64 交叉编译默认使用 `aarch64-w64-mingw32-clang` 和 `aarch64-w64-mingw32-clang++`。也可以直接覆盖编译器：

```bash
CC=aarch64-w64-mingw32-clang \
CXX=aarch64-w64-mingw32-clang++ \
make package-windows-arm64
```

或使用 Makefile 专用变量：

```bash
make WINDOWS_ARM64_CC=/path/to/clang \
     WINDOWS_ARM64_CXX=/path/to/clang++ \
     package-windows-arm64
```

ARM64 安装程序输出为 `build/bin/markdown-viewer-arm64-installer.exe`，ZIP 包输出为 `dist/markdown-viewer-windows-arm64-installer.zip`。

Linux ARM64 交叉编译默认使用 `aarch64-linux-gnu-gcc` 和 `aarch64-linux-gnu-g++`，并要求构建环境提供 ARM64 版本的 WebKitGTK 4.1、libsoup 3 及其开发文件。也可以覆盖编译器：

```bash
CC=aarch64-linux-gnu-gcc \
CXX=aarch64-linux-gnu-g++ \
make package-linux-arm64
```

或使用 Makefile 专用变量：

```bash
make LINUX_ARM64_CC=/path/to/aarch64-linux-gnu-gcc \
     LINUX_ARM64_CXX=/path/to/aarch64-linux-gnu-g++ \
     package-linux-arm64
```

Windows 安装程序已经配置 `.md` 和 `.markdown` 文件关联；macOS 的 App 包含对应的文档类型元数据。Linux 目前提供可执行文件和启动参数支持，桌面环境的 `.desktop` 注册需要随发行版安装方式补充。

代码块使用 fenced code 的语言标记进行高亮，例如 ```` ```go ````；未标记语言或不支持的语言会以普通代码显示。打开文档后点击代码块右上角的 `复制` 按钮即可复制代码。

点击工具栏的 `粘贴` 按钮，或使用 `Ctrl+Shift+V`，可以直接将系统剪贴板中的 Markdown 文本渲染为临时预览；该内容不会写入文件。

打开文档后点击工具栏中的 `PDF` 按钮，会打开系统打印对话框。选择 `Print to PDF` 或 `另存为 PDF` 即可导出当前文档。
