# Markdown Viewer

一个使用 Wails v2 开发的本地 Markdown 阅读器。Go 负责文件系统和桌面能力，前端负责文档排版。

## 功能

- 双击 `.md` 和 `.markdown` 文件打开
- 单实例运行，应用已打开时双击其他 Markdown 文件会切换文档
- 多个文件使用 Tab 管理，可切换和关闭
- 导出当前 Markdown 文档为 PDF
- 拖放文件、`Ctrl/Cmd+O` 打开文件
- 标题、列表、任务列表、表格、引用、代码块和行内格式
- 相对路径图片和 Markdown 文档链接
- 支持跨父级目录的相对图片路径，例如 `../../docs/screenshots/viewer/linux.png`
- 外部 HTTP/HTTPS 链接使用系统浏览器打开
- 文件变化自动刷新
- 浅色/深色主题和字号调整
- 默认限制文档和图片资源为 10 MB

## 环境要求

- Go 1.25+
- Wails CLI v2.15+
- 使用 `wails dev` 开发前端需要 Node.js/npm
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

当前仓库同时提供 `frontend/static` 作为无 Node 环境下的生产前端副本。Wails 构建前会运行 `frontend/build.go`，把它复制到 `frontend/dist`，然后由 Go 的 `embed.FS` 打包进应用。这样生产构建不依赖 npm；`frontend/src` 保留给需要 Vite 热更新的开发流程。

## 构建

```bash
wails build
```

项目配置已经默认加入 `webkit2_41` 标签，Linux 构建等价于：

```bash
wails build --platform linux/amd64 --tags webkit2_41
```

也可以使用 Makefile 编译并制作 ZIP 包：

```bash
# 编译 Linux 和 Windows amd64 程序
make build

# 编译 Linux、Windows、Windows Installer，并生成 ZIP 包
make package
```

生成文件：

```text
dist/markdown-viewer-linux-amd64.zip
dist/markdown-viewer-windows-amd64.zip
dist/markdown-viewer-windows-amd64-installer.zip
```

直接执行 `make` 与 `make package` 相同，会默认编译两个平台、制作 Windows NSIS 安装程序，并生成以上三个 ZIP 包。

如果 `wails` 不在 PATH 中，可以指定 CLI 路径：

```bash
make WAILS=/path/to/wails package
```

Linux 版本使用 `webkit2_41`，运行目标系统需要安装 WebKitGTK 4.1 和 libsoup 3；Windows 版本需要 WebView2 Runtime。Windows Installer 构建还需要安装 NSIS，并确保 `makensis` 位于 PATH 中。

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

Windows 安装程序已经配置 `.md` 和 `.markdown` 文件关联；macOS 的 App 包含对应的文档类型元数据。Linux 目前提供可执行文件和启动参数支持，桌面环境的 `.desktop` 注册需要随发行版安装方式补充。

打开文档后点击工具栏中的 `PDF` 按钮，会打开系统打印对话框。选择 `Print to PDF` 或 `另存为 PDF` 即可导出当前文档。
