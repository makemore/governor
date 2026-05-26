package ui

import (
	"os"

	"github.com/charmbracelet/huh/spinner"
)

// WithSpinner runs fn while a Charm spinner is showing. If the terminal is
// non-interactive (CI, pipes) the spinner is skipped and fn just runs.
// The returned error is whatever fn produced.
func WithSpinner(title string, fn func() error) error {
	if !isTTY() {
		return fn()
	}
	var outerErr error
	work := func() {
		outerErr = fn()
	}
	_ = spinner.New().Title(title).Action(work).Run()
	return outerErr
}

func isTTY() bool {
	fi, err := os.Stdout.Stat()
	if err != nil {
		return false
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}
