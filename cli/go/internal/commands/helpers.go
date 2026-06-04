package commands

import (
	"fmt"
	"os"

	"github.com/makemore/governor/cli/go/internal/api"
	"github.com/makemore/governor/cli/go/internal/config"
	"github.com/makemore/governor/cli/go/internal/ui"
)

// redact returns a fixed-length placeholder revealing only the prefix of a
// secret. The first four characters of a Governor token are non-secret
// ("gv_x") so they are kept; everything after is hidden.
func redact(s string) string {
	if len(s) <= 4 {
		return "****"
	}
	return s[:4] + "…(redacted, " + fmt.Sprintf("%d chars", len(s)) + ")"
}

// savePersona writes (or replaces) a persona in the config file.
// iapAudience/iapServiceAccount may be empty for non-IAP deployments.
// If announce is true, a one-line confirmation is printed to stderr.
func savePersona(name, baseURL, apiKey, iapAudience, iapServiceAccount string, setDefault, announce bool) error {
	baseURL, err := api.NormalizeBaseURL(baseURL)
	if err != nil {
		return err
	}
	f, err := config.Load()
	if err != nil {
		return err
	}
	if f.Personas == nil {
		f.Personas = map[string]config.Persona{}
	}
	f.Personas[name] = config.Persona{
		BaseURL:           baseURL,
		APIKey:            apiKey,
		IAPAudience:       iapAudience,
		IAPServiceAccount: iapServiceAccount,
	}
	if setDefault || f.Default == "" {
		f.Default = name
	}
	if err := f.Save(); err != nil {
		return err
	}
	if announce {
		path, _ := config.Path()
		fmt.Fprintln(os.Stderr, ui.OK.Render("saved persona: ")+name+ui.Sub.Render("  ("+path+")"))
	}
	return nil
}
