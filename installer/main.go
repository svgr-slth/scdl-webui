package main

import (
	"fmt"
	"os"
)

const version = "1.0.0"

func main() {
	if len(os.Args) < 2 {
		cmdHelp()
		os.Exit(0)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "install":
		cmdInstall(args)
	case "start":
		cmdStart()
	case "stop":
		cmdStop()
	case "restart":
		cmdRestart()
	case "status":
		cmdStatus()
	case "logs":
		cmdLogs(args)
	case "open":
		cmdOpen()
	case "uninstall":
		cmdUninstall()
	case "help", "--help", "-h":
		cmdHelp()
	case "version", "--version", "-v":
		fmt.Printf("scdl-web v%s\n", version)
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", cmd)
		cmdHelp()
		os.Exit(1)
	}
}

func cmdHelp() {
	fmt.Printf(`scdl-web v%s - SoundCloud Downloader Web UI

Usage: scdl-web <command> [options]

Commands:
  install     Install scdl-web (Docker, images, services, hosts)
  start       Start the application
  stop        Stop the application
  restart     Restart the application
  status      Show application status
  logs        Show application logs (use -f to follow)
  open        Open the web UI in a browser
  uninstall   Remove scdl-web (preserves data by default)
  help        Show this help message
  version     Show version

Web UI: http://scdl.local
`, version)
}
