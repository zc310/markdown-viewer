package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	maxDocumentSize  = 10 * 1024 * 1024
	fileOpenedEvent  = "document:opened"
	fileChangedEvent = "document:changed"
	fileErrorEvent   = "document:error"
)

type Document struct {
	Path       string `json:"path"`
	Name       string `json:"name"`
	Content    string `json:"content"`
	Size       int64  `json:"size"`
	ModifiedAt string `json:"modifiedAt"`
}

type Asset struct {
	DataURI string `json:"dataURI"`
	Path    string `json:"path"`
}

type App struct {
	ctx       context.Context
	watchStop chan struct{}
	watchDone chan struct{}
	watchMu   sync.Mutex
	openMu    sync.Mutex
	openQueue []string
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(ctx context.Context) {
	a.stopWatcher()
}

func (a *App) InitialPath() string {
	for _, arg := range os.Args[1:] {
		if isMarkdownPath(arg) {
			return arg
		}
	}
	return ""
}

func (a *App) PendingPaths() []string {
	a.openMu.Lock()
	defer a.openMu.Unlock()
	paths := append([]string(nil), a.openQueue...)
	a.openQueue = nil
	return paths
}

func (a *App) emitOpenPath(path string) {
	if !isMarkdownPath(path) {
		return
	}
	a.restoreWindow()
	a.openMu.Lock()
	a.openQueue = append(a.openQueue, path)
	a.openMu.Unlock()
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, fileOpenedEvent, path)
	}
}

func (a *App) restoreWindow() {
	if a.ctx == nil {
		return
	}
	// Bring the existing reader back before the new document event reaches the frontend.
	runtime.WindowUnminimise(a.ctx)
	runtime.WindowShow(a.ctx)
}

func (a *App) OpenFile() (string, error) {
	options := runtime.OpenDialogOptions{
		Title: "打开 Markdown 文件",
		Filters: []runtime.FileFilter{
			{DisplayName: "Markdown 文件 (*.md, *.markdown)", Pattern: "*.md;*.markdown"},
			{DisplayName: "所有文件 (*.*)", Pattern: "*.*"},
		},
	}
	return runtime.OpenFileDialog(a.ctx, options)
}

func (a *App) ReadDocument(path string) (Document, error) {
	path, err := normalizeMarkdownPath(path)
	if err != nil {
		return Document{}, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return Document{}, fmt.Errorf("无法读取文件: %w", err)
	}
	if info.IsDir() {
		return Document{}, fmt.Errorf("路径是目录，不是 Markdown 文件")
	}
	if info.Size() > maxDocumentSize {
		return Document{}, fmt.Errorf("文件过大，当前版本最多支持 10 MB")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return Document{}, fmt.Errorf("读取文件失败: %w", err)
	}
	content = bytesWithoutUTF8BOM(content)
	return Document{
		Path:       path,
		Name:       filepath.Base(path),
		Content:    string(content),
		Size:       info.Size(),
		ModifiedAt: info.ModTime().UTC().Format(time.RFC3339Nano),
	}, nil
}

func (a *App) ReadAsset(documentPath string, assetPath string) (Asset, error) {
	documentPath, err := normalizeMarkdownPath(documentPath)
	if err != nil {
		return Asset{}, err
	}
	if filepath.IsAbs(assetPath) {
		return Asset{}, fmt.Errorf("资源路径必须是相对路径")
	}
	assetPath = strings.TrimSpace(assetPath)
	if assetPath == "" || strings.HasPrefix(assetPath, "#") {
		return Asset{}, fmt.Errorf("资源路径为空")
	}
	assetPath = strings.SplitN(assetPath, "?", 2)[0]
	assetPath = strings.SplitN(assetPath, "#", 2)[0]
	if decodedPath, decodeErr := url.PathUnescape(assetPath); decodeErr == nil {
		assetPath = decodedPath
	}
	if filepath.IsAbs(assetPath) {
		return Asset{}, fmt.Errorf("资源路径必须是相对路径")
	}
	fullPath := filepath.Clean(filepath.Join(filepath.Dir(documentPath), filepath.FromSlash(assetPath)))
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return Asset{}, fmt.Errorf("读取资源失败: %w", err)
	}
	if len(data) > maxDocumentSize {
		return Asset{}, fmt.Errorf("资源文件过大")
	}
	return Asset{
		DataURI: "data:" + mimeForPath(fullPath, data) + ";base64," + base64.StdEncoding.EncodeToString(data),
		Path:    fullPath,
	}, nil
}

func (a *App) ResolveDocumentLink(documentPath string, target string) (string, error) {
	documentPath, err := normalizeMarkdownPath(documentPath)
	if err != nil {
		return "", err
	}
	target = strings.TrimSpace(target)
	target = strings.SplitN(target, "?", 2)[0]
	target = strings.SplitN(target, "#", 2)[0]
	if target == "" || filepath.IsAbs(target) {
		return "", fmt.Errorf("链接不是相对 Markdown 文件")
	}
	resolved, err := normalizeMarkdownPath(filepath.Join(filepath.Dir(documentPath), filepath.FromSlash(target)))
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(filepath.Dir(documentPath), resolved)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("链接超出文档目录")
	}
	return resolved, nil
}

func (a *App) StartWatching(path string) error {
	path, err := normalizeMarkdownPath(path)
	if err != nil {
		return err
	}
	a.stopWatcher()
	stop := make(chan struct{})
	done := make(chan struct{})
	a.watchMu.Lock()
	a.watchStop = stop
	a.watchDone = done
	a.watchMu.Unlock()
	go func() {
		defer close(done)
		info, _ := os.Stat(path)
		var lastModified time.Time
		var lastSize int64
		if info != nil {
			lastModified = info.ModTime()
			lastSize = info.Size()
		}
		ticker := time.NewTicker(800 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				info, statErr := os.Stat(path)
				if statErr != nil {
					runtime.EventsEmit(a.ctx, fileErrorEvent, "文件已被删除或无法访问")
					continue
				}
				if info.ModTime().Equal(lastModified) && info.Size() == lastSize {
					continue
				}
				lastModified = info.ModTime()
				lastSize = info.Size()
				runtime.EventsEmit(a.ctx, fileChangedEvent, path)
			}
		}
	}()
	return nil
}

func (a *App) StopWatching() {
	a.stopWatcher()
}

func (a *App) stopWatcher() {
	a.watchMu.Lock()
	stop, done := a.watchStop, a.watchDone
	a.watchStop, a.watchDone = nil, nil
	a.watchMu.Unlock()
	if stop != nil {
		close(stop)
		<-done
	}
}

func (a *App) OpenExternal(url string) error {
	if !strings.HasPrefix(url, "https://") && !strings.HasPrefix(url, "http://") {
		return fmt.Errorf("只允许打开 http 或 https 链接")
	}
	runtime.BrowserOpenURL(a.ctx, url)
	return nil
}

func (a *App) ExportPDF() error {
	if a.ctx == nil {
		return fmt.Errorf("应用尚未准备完成")
	}
	runtime.WindowPrint(a.ctx)
	return nil
}

func normalizeMarkdownPath(path string) (string, error) {
	path = strings.Trim(strings.TrimSpace(path), `"`)
	if path == "" {
		return "", fmt.Errorf("文件路径为空")
	}
	if !isMarkdownPath(path) {
		return "", fmt.Errorf("只支持 .md 或 .markdown 文件")
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("无效文件路径: %w", err)
	}
	return filepath.Clean(absPath), nil
}

func isMarkdownPath(path string) bool {
	ext := strings.ToLower(filepath.Ext(strings.Trim(path, `"`)))
	return ext == ".md" || ext == ".markdown"
}

func bytesWithoutUTF8BOM(data []byte) []byte {
	if len(data) >= 3 && data[0] == 0xef && data[1] == 0xbb && data[2] == 0xbf {
		return data[3:]
	}
	return data
}

func mimeForPath(path string, data []byte) string {
	if contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(path))); strings.HasPrefix(contentType, "image/") {
		return contentType
	}
	if contentType := http.DetectContentType(data); strings.HasPrefix(contentType, "image/") {
		return strings.SplitN(contentType, ";", 2)[0]
	}
	return "application/octet-stream"
}
