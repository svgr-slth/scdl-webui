package main

import (
	"fmt"
	"os"
	"runtime"
)

var (
	colorReset  = "\033[0m"
	colorRed    = "\033[0;31m"
	colorGreen  = "\033[0;32m"
	colorYellow = "\033[1;33m"
	colorBlue   = "\033[0;34m"
	colorCyan   = "\033[0;36m"
)

func init() {
	// Disable colors on Windows (unless WT_SESSION is set, i.e. Windows Terminal)
	if runtime.GOOS == "windows" && os.Getenv("WT_SESSION") == "" {
		colorReset = ""
		colorRed = ""
		colorGreen = ""
		colorYellow = ""
		colorBlue = ""
		colorCyan = ""
	}
}

func printStep(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	fmt.Printf("%s=> %s%s\n", colorBlue, msg, colorReset)
}

func printOK(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	fmt.Printf("%s[OK] %s%s\n", colorGreen, msg, colorReset)
}

func printInfo(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	fmt.Printf("%s[i] %s%s\n", colorCyan, msg, colorReset)
}

func printWarn(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	fmt.Fprintf(os.Stderr, "%s[!] %s%s\n", colorYellow, msg, colorReset)
}

func printError(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	fmt.Fprintf(os.Stderr, "%s[ERROR] %s%s\n", colorRed, msg, colorReset)
}

func fatal(format string, args ...interface{}) {
	printError(format, args...)
	os.Exit(1)
}
