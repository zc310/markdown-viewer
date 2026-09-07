SHELL := /bin/sh

APP      := markdown-viewer
VERSION  ?= 0.0.3
WAILS    ?= wails
DIST     := dist
BIN      := build/bin
LINUX    := $(BIN)/$(APP)
WINDOWS  := $(BIN)/$(APP).exe
WINDOWS_INSTALLER := $(BIN)/$(APP)-amd64-installer.exe
WINDOWS_BUILD_STAMP := $(BIN)/.$(APP)-windows-amd64-built
WINDOWS_INSTALLER_STAMP := $(BIN)/.$(APP)-windows-amd64-installer-built
LINUX_PKG   := $(DIST)/$(APP)-linux-amd64
WINDOWS_PKG := $(DIST)/$(APP)-windows-amd64
WINDOWS_INSTALLER_PKG := $(DIST)/$(APP)-windows-amd64-installer

.PHONY: all build build-linux build-windows build-windows-installer package package-linux package-windows package-windows-installer clean test help FORCE

all: package

build: build-linux build-windows

build-linux:
	$(WAILS) build --platform linux/amd64 --tags webkit2_41 -m -nopackage

build-windows:
	$(MAKE) $(WINDOWS_BUILD_STAMP)

$(WINDOWS_BUILD_STAMP): FORCE
	$(WAILS) build --platform windows/amd64 -m -nopackage
	@touch "$@"

build-windows-installer:
	$(MAKE) $(WINDOWS_INSTALLER_STAMP)

$(WINDOWS_INSTALLER_STAMP): FORCE
	@rm -f "$(WINDOWS_INSTALLER)"
	$(WAILS) build --platform windows/amd64 --nsis -m
	@test -f "$(WINDOWS_INSTALLER)" || (printf 'Windows installer was not created. Install NSIS (makensis) and try again.\n' >&2; exit 1)
	@touch "$@"

package: package-linux package-windows package-windows-installer

package-linux: build-linux
	@rm -rf "$(LINUX_PKG)" "$(LINUX_PKG).zip"
	@mkdir -p "$(LINUX_PKG)"
	@cp "$(LINUX)" "$(LINUX_PKG)/$(APP)"
	@cp README.md "$(LINUX_PKG)/README.md"
	@cd "$(DIST)" && zip -qr "$(APP)-linux-amd64.zip" "$(APP)-linux-amd64"
	@printf 'Created %s\n' "$(DIST)/$(APP)-linux-amd64.zip"

package-windows: build-windows-installer
	@rm -rf "$(WINDOWS_PKG)" "$(WINDOWS_PKG).zip"
	@mkdir -p "$(WINDOWS_PKG)"
	@cp "$(WINDOWS)" "$(WINDOWS_PKG)/$(APP).exe"
	@cp README.md "$(WINDOWS_PKG)/README.md"
	@cd "$(DIST)" && zip -qr "$(APP)-windows-amd64.zip" "$(APP)-windows-amd64"
	@printf 'Created %s\n' "$(DIST)/$(APP)-windows-amd64.zip"

package-windows-installer: build-windows-installer
	@rm -rf "$(WINDOWS_INSTALLER_PKG)" "$(WINDOWS_INSTALLER_PKG).zip"
	@mkdir -p "$(WINDOWS_INSTALLER_PKG)"
	@cp "$(WINDOWS_INSTALLER)" "$(WINDOWS_INSTALLER_PKG)/$(APP)-installer.exe"
	@cp README.md "$(WINDOWS_INSTALLER_PKG)/README.md"
	@cd "$(DIST)" && zip -qr "$(APP)-windows-amd64-installer.zip" "$(APP)-windows-amd64-installer"
	@printf 'Created %s\n' "$(DIST)/$(APP)-windows-amd64-installer.zip"

test:
	go test ./...
	go vet ./...

clean:
	rm -rf "$(DIST)"
	rm -f "$(WINDOWS_BUILD_STAMP)" "$(WINDOWS_INSTALLER_STAMP)"

FORCE:

help:
	@printf '%s\n' \
	  'make build            Build Linux and Windows executables' \
	  'make build-linux      Build Linux amd64 executable' \
	  'make build-windows    Build Windows amd64 executable' \
	  'make build-windows-installer  Build Windows NSIS installer' \
	  'make package          Build both platforms, installer, and ZIP files' \
	  'make package-linux    Create the Linux ZIP package' \
	  'make package-windows  Create the Windows ZIP package' \
	  'make package-windows-installer  Create the Windows installer ZIP package' \
	  'make test             Run Go tests and vet' \
	  'make clean            Remove generated ZIP packages' \
	  'WAILS=/path/to/wails make package'
