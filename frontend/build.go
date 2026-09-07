package main

import (
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	root, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	source := filepath.Join(root, "static")
	destination := filepath.Join(root, "dist")
	if err := syncStaticFrontend(root, source); err != nil {
		panic(err)
	}
	if err := os.RemoveAll(destination); err != nil {
		panic(err)
	}
	if err := fs.WalkDir(os.DirFS(source), ".", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		target := filepath.Join(destination, filepath.FromSlash(path))
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		input, err := os.Open(filepath.Join(source, filepath.FromSlash(path)))
		if err != nil {
			return err
		}
		defer input.Close()
		output, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
		if err != nil {
			return err
		}
		if _, err := io.Copy(output, input); err != nil {
			output.Close()
			return err
		}
		return output.Close()
	}); err != nil {
		panic(err)
	}
}

func syncStaticFrontend(root, destination string) error {
	sourceMain, err := os.ReadFile(filepath.Join(root, "src", "main.js"))
	if err != nil {
		return err
	}
	var javascript []string
	for _, line := range strings.Split(string(sourceMain), "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "import ") {
			continue
		}
		javascript = append(javascript, line)
	}
	const bridge = `const {ExportPDF, InitialPath, OpenFile, OpenExternal, PendingPaths, ReadAsset, ReadDocument, ResolveDocumentLink, StartWatching, StopWatching} = window.go.main.App;
const {EventsOn, OnFileDrop, BrowserOpenURL, WindowSetTitle} = window.runtime;
`
	if err := os.WriteFile(filepath.Join(destination, "main.js"), []byte(bridge+strings.Join(javascript, "\n")), 0o644); err != nil {
		return err
	}
	baseStyles, err := os.ReadFile(filepath.Join(root, "src", "style.css"))
	if err != nil {
		return err
	}
	appStyles, err := os.ReadFile(filepath.Join(root, "src", "app.css"))
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(destination, "style.css"), append(append(baseStyles, '\n'), appStyles...), 0o644)
}
