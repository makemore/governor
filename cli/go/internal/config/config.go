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
type Persona struct {
	BaseURL string `toml:"base_url"`
	APIKey  string `toml:"api_key"`
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
// GOVERNOR_API_KEY) -> the file's default. Returns the resolved name (or
// "(env)" / "(flag)") so callers can report what they used.
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
	if f.Default != "" {
		p, ok := f.Personas[f.Default]
		if ok {
			return p, f.Default, nil
		}
	}
	return Persona{}, "", errors.New("no persona configured: run `gov bootstrap` or `gov personas add`")
}
