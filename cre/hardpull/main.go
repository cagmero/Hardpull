//go:build wasip1

// main.go is the only file in this package that is WASM-only. Everything else -- the handler,
// its wire DTOs, and verdict signing -- builds on the host too, so `go test ./hardpull/...`
// can exercise the real confidential handler through cre/testutils' TeeRuntime rather than
// only testing the pure logic in ../workflow (docs/plan.md T-011, T-013).
package main

import (
	"github.com/smartcontractkit/cre-sdk-go/cre"
	"github.com/smartcontractkit/cre-sdk-go/cre/wasm"
)

// main is the WASM entry point. The runner parses config.json into Config and calls InitWorkflow.
func main() {
	wasm.NewRunner(cre.ParseJSON[Config]).Run(InitWorkflow)
}
