package main

import (
	"embed"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()
	tray := NewTray(app)

	// Initialise the system tray without blocking the main thread.
	// Wails keeps ownership of the main thread; systray hooks into the same
	// native event loop via RunWithExternalLoop (non-blocking).
	// Register initializes the tray without blocking (caller owns the event loop).
	systray.Register(tray.setup, tray.teardown)

	err := wails.Run(&options.App{
		Title:            "scdl-web",
		Width:            1200,
		Height:           800,
		MinWidth:         800,
		MinHeight:        600,
		DisableResize:    false,
		Frameless:        false,
		StartHidden:      false,
		AlwaysOnTop:      false,
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 44, A: 1},
		AssetServer: &assetserver.Options{
			Assets:     assets,
			Middleware: app.apiMiddleware(),
		},
		OnStartup:     app.startup,
		OnShutdown:    app.shutdown,
		OnBeforeClose: app.beforeClose,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		panic(err)
	}
}
