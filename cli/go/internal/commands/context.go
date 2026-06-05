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
	c, err := buildClient(persona, name)
	if err != nil {
		return nil, "", err
	}
	return c, name, nil
}

// clientForPersona builds a client for a specific named persona, regardless of
// the active default or -p flag. Used by interactive commands (e.g.
// `gov human attest`) that need to switch persona mid-run.
func clientForPersona(name string) (*api.Client, error) {
	f, err := config.Load()
	if err != nil {
		return nil, err
	}
	persona, ok := f.Personas[name]
	if !ok {
		return nil, fmt.Errorf("no such persona: %s", name)
	}
	return buildClient(persona, name)
}

// buildClient turns a resolved persona into an api.Client, including any IAP
// OIDC token the deployment requires.
func buildClient(persona config.Persona, name string) (*api.Client, error) {
	if persona.BaseURL == "" {
		return nil, fmt.Errorf("persona %q has no base_url", name)
	}
	if persona.APIKey == "" {
		return nil, fmt.Errorf("persona %q has no api_key", name)
	}
	baseURL, err := api.NormalizeBaseURL(persona.BaseURL)
	if err != nil {
		return nil, fmt.Errorf("persona %q: %w", name, err)
	}
	c := api.New(baseURL, persona.APIKey)
	c.IAPAudience = persona.IAPAudience
	c.IAPServiceAccount = persona.IAPServiceAccount
	tok, err := api.ResolveIAPToken(persona.IAPAudience, persona.IAPServiceAccount)
	if err != nil {
		return nil, err
	}
	c.ProxyToken = tok
	return c, nil
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
