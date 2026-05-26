package commands

import (
	"context"
	"fmt"
	"os"

	"github.com/makemore/governor/cli/go/internal/api"
	"github.com/makemore/governor/cli/go/internal/config"
	"github.com/makemore/governor/cli/go/internal/ui"
)

// clientFor resolves the active persona and returns an api.Client plus the
// persona name that was selected. Used by every command except `personas`
// and `bootstrap` (those manage the config directly).
func clientFor() (*api.Client, string, error) {
	f, err := config.Load()
	if err != nil {
		return nil, "", err
	}
	persona, name, err := f.Resolve(flagPersona)
	if err != nil {
		return nil, "", err
	}
	if persona.BaseURL == "" {
		return nil, "", fmt.Errorf("persona %q has no base_url", name)
	}
	if persona.APIKey == "" {
		return nil, "", fmt.Errorf("persona %q has no api_key", name)
	}
	return api.New(persona.BaseURL, persona.APIKey), name, nil
}

// runWith runs fn with a fresh client and prints the selected persona on
// stderr so the user always sees which Governor they hit.
func runWith(fn func(ctx context.Context, c *api.Client) error) error {
	c, name, err := clientFor()
	if err != nil {
		return err
	}
	fmt.Fprintln(os.Stderr, ui.Sub.Render("→ "+name+" "+c.BaseURL))
	return fn(context.Background(), c)
}
