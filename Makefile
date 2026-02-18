.PHONY: build bundle clean build-linux build-windows build-darwin

VERSION := 1.0.0
BINARY := scdl-web
INSTALLER_DIR := installer
BUNDLE_DIR := $(INSTALLER_DIR)/bundle
DIST_DIR := dist

# Default: build for current platform
build: bundle
	cd $(INSTALLER_DIR) && go build -ldflags="-s -w" -o ../$(DIST_DIR)/$(BINARY) .

# Build for all platforms
build-all: build-linux build-windows build-darwin

build-linux: bundle
	cd $(INSTALLER_DIR) && GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o ../$(DIST_DIR)/$(BINARY)-linux-amd64 .
	cd $(INSTALLER_DIR) && GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o ../$(DIST_DIR)/$(BINARY)-linux-arm64 .

build-windows: bundle
	cd $(INSTALLER_DIR) && GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o ../$(DIST_DIR)/$(BINARY)-windows-amd64.exe .

build-darwin: bundle
	cd $(INSTALLER_DIR) && GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o ../$(DIST_DIR)/$(BINARY)-darwin-amd64 .
	cd $(INSTALLER_DIR) && GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o ../$(DIST_DIR)/$(BINARY)-darwin-arm64 .

# Bundle project files for embedding
bundle:
	rm -rf $(BUNDLE_DIR)
	mkdir -p $(BUNDLE_DIR)
	cp -r backend $(BUNDLE_DIR)/
	cp -r frontend $(BUNDLE_DIR)/
	rm -rf $(BUNDLE_DIR)/frontend/node_modules
	cp docker-compose.yml $(BUNDLE_DIR)/
	cp .env.example $(BUNDLE_DIR)/
	@# Clean up unnecessary files
	find $(BUNDLE_DIR) -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
	find $(BUNDLE_DIR) -name '*.pyc' -delete 2>/dev/null || true
	find $(BUNDLE_DIR) -name '.git' -type d -exec rm -rf {} + 2>/dev/null || true

clean:
	rm -rf $(BUNDLE_DIR) $(DIST_DIR)
