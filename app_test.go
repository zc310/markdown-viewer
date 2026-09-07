package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestIsMarkdownPath(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{"README.md", true},
		{"guide.MARKDOWN", true},
		{`"notes.md"`, true},
		{"README.txt", false},
		{"README", false},
	}
	for _, test := range tests {
		if got := isMarkdownPath(test.path); got != test.want {
			t.Errorf("isMarkdownPath(%q) = %v, want %v", test.path, got, test.want)
		}
	}
}

func TestReadDocumentRemovesBOM(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notes.md")
	if err := os.WriteFile(path, append([]byte{0xef, 0xbb, 0xbf}, []byte("# Notes")...), 0o644); err != nil {
		t.Fatal(err)
	}
	document, err := NewApp().ReadDocument(path)
	if err != nil {
		t.Fatal(err)
	}
	if document.Content != "# Notes" {
		t.Fatalf("content = %q, want BOM-free Markdown", document.Content)
	}
}

func TestResolveDocumentLinkStaysInDocumentDirectory(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "docs", "README.md")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("# README"), 0o644); err != nil {
		t.Fatal(err)
	}
	app := NewApp()
	resolved, err := app.ResolveDocumentLink(path, "./guide.md#install")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(resolved, filepath.Join("docs", "guide.md")) {
		t.Fatalf("resolved path = %q", resolved)
	}
	if _, err := app.ResolveDocumentLink(path, "../../outside.md"); err == nil {
		t.Fatal("expected links outside the document directory to fail")
	}
}

func TestReadAssetAllowsParentDirectory(t *testing.T) {
	dir := t.TempDir()
	documentPath := filepath.Join(dir, "docs", "README.md")
	assetPath := filepath.Join(dir, "images", "diagram.png")
	if err := os.MkdirAll(filepath.Dir(documentPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(assetPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(documentPath, []byte("# README"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(assetPath, []byte("diagram"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := NewApp().ReadAsset(documentPath, "../images/diagram.png"); err != nil {
		t.Fatal(err)
	}
	if _, err := NewApp().ReadAsset(documentPath, assetPath); err == nil {
		t.Fatal("expected absolute asset paths to fail")
	}
}

func TestReadAssetDecodesEscapedPath(t *testing.T) {
	dir := t.TempDir()
	documentPath := filepath.Join(dir, "README.md")
	assetPath := filepath.Join(dir, "images", "封面 image.png")
	if err := os.MkdirAll(filepath.Dir(assetPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(documentPath, []byte("# README"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(assetPath, []byte("not a real png"), 0o644); err != nil {
		t.Fatal(err)
	}
	asset, err := NewApp().ReadAsset(documentPath, "images/%E5%B0%81%E9%9D%A2%20image.png")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(asset.DataURI, "data:image/png;base64,") {
		t.Fatalf("data URI = %q, want image/png", asset.DataURI[:min(len(asset.DataURI), 32)])
	}
}
