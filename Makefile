.PHONY: dev build build-production bundle clean

BUNDLE_DIR := bundle

# Development mode (hot reload)
dev: bundle
	wails dev

# Build for current platform
build: bundle
	wails build -clean

# Production build (optimized)
build-production: bundle
	wails build -clean -production

# Bundle backend files for embedding in the Go binary
bundle:
	rm -rf $(BUNDLE_DIR)
	mkdir -p $(BUNDLE_DIR)
	cp -r backend $(BUNDLE_DIR)/
	cp .env.example $(BUNDLE_DIR)/
	@# Clean up unnecessary files
	find $(BUNDLE_DIR) -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
	find $(BUNDLE_DIR) -name '*.pyc' -delete 2>/dev/null || true
	find $(BUNDLE_DIR) -name '.git' -type d -exec rm -rf {} + 2>/dev/null || true

clean:
	rm -rf $(BUNDLE_DIR) build/bin
