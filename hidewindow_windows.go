package main

import (
	"os/exec"
	"syscall"
)

// hideWindow prevents Windows from showing a console window for the subprocess.
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
