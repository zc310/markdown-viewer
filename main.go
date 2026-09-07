package main

import (
	"embed"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:                    "Markdown Viewer",
		Width:                    1180,
		Height:                   820,
		MinWidth:                 760,
		MinHeight:                520,
		Frameless:                false,
		EnableDefaultContextMenu: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 246, G: 244, B: 239, A: 255},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Mac: &mac.Options{
			OnFileOpen: func(path string) {
				app.emitOpenPath(path)
			},
		},
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: "markdown-viewer-zc310-tech",
			OnSecondInstanceLaunch: func(data options.SecondInstanceData) {
				for _, arg := range data.Args {
					if isMarkdownPath(arg) {
						app.emitOpenPath(arg)
						break
					}
				}
			},
		},
		DragAndDrop: &options.DragAndDrop{EnableFileDrop: true},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		_, _ = os.Stderr.WriteString("Error: " + err.Error() + "\n")
	}
}
