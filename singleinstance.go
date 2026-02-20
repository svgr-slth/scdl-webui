package main

import (
	"bufio"
	"fmt"
	"log"
	"net"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	instanceAddr  = "127.0.0.1:47200"
	instanceMagic = "scdl-web:show"
	instanceAck   = "scdl-web:ack"
)

// tryBecomeFirstInstance attempts to listen on the single-instance port.
// If the port is already held by another scdl-web instance, it performs a
// handshake and relays the user's choice.
//
// Returns:
//   - listener: non-nil when we successfully became the first instance.
//   - shouldExit: true when the existing instance chose "Continuer" and we must exit.
func tryBecomeFirstInstance() (listener net.Listener, shouldExit bool) {
	ln, err := net.Listen("tcp", instanceAddr)
	if err == nil {
		return ln, false
	}

	log.Println("Single-instance port busy, contacting existing instance…")

	for attempt := 0; attempt < 3; attempt++ {
		action, err := signalExistingInstance()
		if err != nil {
			log.Printf("Handshake attempt %d failed: %v", attempt+1, err)
			time.Sleep(500 * time.Millisecond)
			ln, err = net.Listen("tcp", instanceAddr)
			if err == nil {
				return ln, false
			}
			continue
		}

		switch action {
		case "continue":
			log.Println("Existing instance chose Continuer. Exiting.")
			return nil, true
		case "relaunch":
			log.Println("Existing instance chose Relancer. Waiting for port…")
			ln = waitForPort(10 * time.Second)
			if ln != nil {
				return ln, false
			}
			log.Println("Timeout waiting for port after relaunch. Exiting.")
			return nil, true
		}
	}

	log.Println("Warning: port 47200 occupied by unknown process, starting without single-instance guard")
	return nil, false
}

// signalExistingInstance connects to the single-instance port, performs the
// handshake and returns the action chosen by the user ("continue" or "relaunch").
func signalExistingInstance() (string, error) {
	conn, err := net.DialTimeout("tcp", instanceAddr, 2*time.Second)
	if err != nil {
		return "", fmt.Errorf("connect: %w", err)
	}
	defer conn.Close()

	// Generous deadline — the user dialog may take time.
	conn.SetDeadline(time.Now().Add(60 * time.Second))

	fmt.Fprintf(conn, "%s\n", instanceMagic)

	reader := bufio.NewReader(conn)

	ack, err := reader.ReadString('\n')
	if err != nil {
		return "", fmt.Errorf("read ack: %w", err)
	}
	if strings.TrimSpace(ack) != instanceAck {
		return "", fmt.Errorf("invalid ack %q (not scdl-web)", ack)
	}

	action, err := reader.ReadString('\n')
	if err != nil {
		return "", fmt.Errorf("read action: %w", err)
	}
	return strings.TrimSpace(action), nil
}

// waitForPort retries net.Listen until it succeeds or the timeout elapses.
func waitForPort(timeout time.Duration) net.Listener {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		ln, err := net.Listen("tcp", instanceAddr)
		if err == nil {
			return ln
		}
		time.Sleep(250 * time.Millisecond)
	}
	return nil
}

// startSingleInstanceListener accepts connections on ln and handles incoming
// "show" commands. Must be called after app.ctx is set.
func (a *App) startSingleInstanceListener(ln net.Listener) {
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return // listener closed
			}
			go a.handleSingleInstanceConn(conn)
		}
	}()
}

// handleSingleInstanceConn processes one connection from a second instance.
func (a *App) handleSingleInstanceConn(conn net.Conn) {
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Second))

	reader := bufio.NewReader(conn)
	line, err := reader.ReadString('\n')
	if err != nil {
		return
	}
	if strings.TrimSpace(line) != instanceMagic {
		return
	}

	// Confirm identity.
	fmt.Fprintf(conn, "%s\n", instanceAck)

	// Remove deadline — dialog may take a while.
	conn.SetDeadline(time.Time{})

	a.showWindow()

	result, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.QuestionDialog,
		Title:   "Instance existante",
		Message: "L'application est déjà en cours d'exécution.\n\nVoulez-vous la relancer ?",
	})

	if err != nil {
		log.Printf("Single-instance dialog error: %v", err)
		fmt.Fprintf(conn, "continue\n")
		return
	}

	if result == "Yes" {
		log.Println("User chose Relancer — shutting down for relaunch")
		fmt.Fprintf(conn, "relaunch\n")
		time.Sleep(200 * time.Millisecond)
		a.quit()
		return
	}

	log.Println("User chose Continuer — keeping existing instance")
	fmt.Fprintf(conn, "continue\n")
}
