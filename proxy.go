package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

// apiMiddleware returns a Wails AssetServer middleware that proxies /api/* requests
// to the Python backend running on 127.0.0.1:8000.
func (a *App) apiMiddleware() func(next http.Handler) http.Handler {
	backendURL, _ := url.Parse("http://127.0.0.1:8000")
	proxy := httputil.NewSingleHostReverseProxy(backendURL)

	// Custom error handler to avoid panics if backend is down
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("Proxy error: %v", err)
		http.Error(w, "Backend unavailable", http.StatusBadGateway)
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				proxy.ServeHTTP(w, r)
				return
			}
			// Everything else goes to the default Wails asset handler (frontend)
			next.ServeHTTP(w, r)
		})
	}
}

// waitForBackend polls the backend health endpoint until it responds.
func waitForBackend(timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 2 * time.Second}

	for time.Now().Before(deadline) {
		resp, err := client.Get("http://127.0.0.1:8000/api/health")
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			return true
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(500 * time.Millisecond)
	}
	return false
}
