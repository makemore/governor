// Command gov is the Governor command-line client.
//
// See `gov --help` and ../../README.md for usage. The canonical 6-command
// flow lives in the top-level governor/README.md.
package main

import (
	"fmt"
	"os"

	"github.com/makemore/governor/cli/go/internal/commands"
	"github.com/makemore/governor/cli/go/internal/ui"
)

func main() {
	if err := commands.NewRoot().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, ui.Bad.Render("✗ ")+err.Error())
		os.Exit(1)
	}
}
