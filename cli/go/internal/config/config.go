package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/BurntSushi/toml"
)

// Persona holds the connection info for a single Governor deployment.
// The api_key is written to a 0600 file; the field is intentionally not
// printed by any of the gov commands.
//
// IAPAudience / IAPServiceAccount are optional. When the deployment sits
// behind Identity-Aware Proxy, the CLI mints a Google OIDC ID token for
// IAPAudience (the IAP OAuth client ID), optionally by impersonating
// IAPServiceAccount, and sends it in Authorization (which IAP consumes and
// strips); the Governor bearer then travels in X-Governor-Authorization so
// the app still receives it untouched.
type Persona struct {
	BaseURL           string `toml:"base_url"`
	APIKey            string `toml:"api_key"`
	IAPAudience       string `toml:"iap_audience,omitempty"`
	IAPServiceAccount string `toml:"iap_service_account,omitempty"`
}

type File struct {
	Default  string             `toml:"default,omitempty"`
	Personas map[string]Persona `toml:"personas"`
}

// Path returns the on-disk location of the config file, respecting
// $XDG_CONFIG_HOME and falling back to ~/.config.
func Path() (string, error) {
	if p := os.Getenv("GOVERNOR_CONFIG"); p != "" {
		return p, nil
	}
	base := os.Getenv("XDG_CONFIG_HOME")
	if base == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		base = filepath.Join(home, ".config")
	}
	return filepath.Join(base, "governor", "config.toml"), nil
}

func Load() (*File, error) {
	p, err := Path()
	if err != nil {
		return nil, err
	}
	f := &File{Personas: map[string]Persona{}}
	data, err := os.ReadFile(p)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return f, nil
		}
		return nil, err
	}
	if err := toml.Unmarshal(data, f); err != nil {
		return nil, fmt.Errorf("parse %s: %w", p, err)
	}
	if f.Personas == nil {
		f.Personas = map[string]Persona{}
	}
	return f, nil
}

func (f *File) Save() error {
	p, err := Path()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(p), ".config.toml.*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	enc := toml.NewEncoder(tmp)
	if err := enc.Encode(f); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), p)
}

func (f *File) Names() []string {
	out := make([]string, 0, len(f.Personas))
	for k := range f.Personas {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// Resolve returns the persona that should be used for an invocation.
// Priority: explicit name -> $GOVERNOR_PERSONA -> env-only (GOVERNOR_BASE_URL +
// GOVERNOR_API_KEY) -> nearest .govrc (project-local identity) -> the file's
// default. Returns the resolved name (or "(env)" / "(flag)" / a ".govrc"
// annotation) so callers can report what they used.
func (f *File) Resolve(explicit string) (Persona, string, error) {
	if explicit != "" {
		p, ok := f.Personas[explicit]
		if !ok {
			return Persona{}, "", fmt.Errorf("persona %q not found (gov personas list)", explicit)
		}
		return p, explicit, nil
	}
	if envName := os.Getenv("GOVERNOR_PERSONA"); envName != "" {
		p, ok := f.Personas[envName]
		if !ok {
			return Persona{}, "", fmt.Errorf("$GOVERNOR_PERSONA=%q but no such persona configured", envName)
		}
		return p, envName, nil
	}
	if url := os.Getenv("GOVERNOR_BASE_URL"); url != "" {
		key := os.Getenv("GOVERNOR_API_KEY")
		if key == "" {
			return Persona{}, "", errors.New("$GOVERNOR_BASE_URL set without $GOVERNOR_API_KEY")
		}
		return Persona{BaseURL: url, APIKey: key}, "(env)", nil
	}
	if p, name, ok, err := f.resolveProjectRC(); err != nil {
		return Persona{}, "", err
	} else if ok {
		return p, name, nil
	}
	if f.Default != "" {
		p, ok := f.Personas[f.Default]
		if ok {
			return p, f.Default, nil
		}
	}
	return Persona{}, "", errors.New("no persona configured: run `gov bootstrap` or `gov personas add`")
}

// resolveProjectRC discovers the nearest .govrc (walking up from the working
// directory) and turns it into a Persona. A .govrc may either reference a
// named persona from the central config or carry an inline identity. The
// returned bool is false (with no error) when no .govrc is found, so callers
// fall through to the file default.
func (f *File) resolveProjectRC() (Persona, string, bool, error) {
	rc, err := FindProjectRC()
	if err != nil {
		return Persona{}, "", false, err
	}
	if rc == nil {
		return Persona{}, "", false, nil
	}
	if rc.Persona != "" {
		p, ok := f.Personas[rc.Persona]
		if !ok {
			return Persona{}, "", false, fmt.Errorf(
				".govrc in %s references persona %q, which is not configured (gov personas list)",
				rc.Dir(), rc.Persona)
		}
		return p, rc.Persona + " (.govrc)", true, nil
	}
	if rc.BaseURL == "" || rc.APIKey == "" {
		return Persona{}, "", false, fmt.Errorf(
			".govrc in %s must set either persona or both base_url and api_key", rc.Dir())
	}
	return Persona{
		BaseURL:           rc.BaseURL,
		APIKey:            rc.APIKey,
		IAPAudience:       rc.IAPAudience,
		IAPServiceAccount: rc.IAPServiceAccount,
	}, "(.govrc)", true, nil
}
