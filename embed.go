package main

import "embed"

//go:embed all:bundle
var backendFS embed.FS
