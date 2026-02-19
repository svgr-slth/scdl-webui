package main

// Version is injected at build time via -ldflags "-X main.Version=v3.x.x".
// Defaults to "dev" when building locally without ldflags.
var Version = "dev"

// LinuxAssetName selects the correct AppImage download for the running variant.
// Overridden to "scdl-web-linux-amd64-webkit4.1.AppImage" for the webkit2_41 build
// via -ldflags "-X main.LinuxAssetName=...".
var LinuxAssetName = "scdl-web-linux-amd64.AppImage"
