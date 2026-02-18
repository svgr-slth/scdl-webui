package main

import (
	"context"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Tray manages the system tray icon and menu.
type Tray struct {
	app *App
}

// NewTray creates a Tray bound to the given App.
func NewTray(app *App) *Tray {
	return &Tray{app: app}
}

// setup is called by systray once it is ready (onReady callback).
// Must not block. Do NOT call runtime.* here — Wails context isn't set yet.
func (t *Tray) setup() {
	systray.SetIcon(iconBytes)
	systray.SetTooltip("scdl-web")

	mOpen := systray.AddMenuItem("Ouvrir", "Afficher la fenêtre scdl-web")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quitter", "Quitter scdl-web")

	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				t.app.showWindow()
			case <-mQuit.ClickedCh:
				t.app.quit()
				return
			}
		}
	}()
}

// teardown is called by systray just before it exits (onExit callback).
func (t *Tray) teardown() {}

// showWindow brings the Wails window to the foreground.
func (a *App) showWindow() {
	if a.ctx != nil {
		runtime.WindowShow(a.ctx)
	}
}

// quit performs a clean application exit triggered from the tray menu.
func (a *App) quit() {
	a.quitting = true
	systray.Quit()
	if a.ctx != nil {
		runtime.Quit(a.ctx)
	}
}

// beforeClose intercepts the window close button.
// Returning true cancels the close — the window is hidden instead of quitting.
func (a *App) beforeClose(ctx context.Context) bool {
	if a.quitting {
		// A real quit was requested from the tray menu — allow the close.
		return false
	}
	// Otherwise hide the window and keep the backend running.
	runtime.WindowHide(ctx)
	return true
}
