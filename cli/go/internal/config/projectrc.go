package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
)

// ProjectRCName is the per-directory identity file the CLI discovers by
// walking up from the working directory. It lets several agents share one
// machine, each acting as a different Governor identity depending on the
// project folder they run in.
const ProjectRCName = ".govrc"

// ProjectRC selects which Governor identity to use when gov runs inside a
// project tree. It either references a named persona from the central config
// (Persona) or carries an inline identity (BaseURL + APIKey [+ IAP fields]).
//
// Referencing a persona is preferred: the api_key then lives only in the
// 0600 central config. Inline mode makes a directory self-contained but
// writes a secret into the project tree — keep .govrc out of version control.
type ProjectRC struct {
	Persona           string `toml:"persona,omitempty"`
	BaseURL           string `toml:"base_url,omitempty"`
	APIKey            string `toml:"api_key,omitempty"`
	IAPAudience       string `toml:"iap_audience,omitempty"`
	IAPServiceAccount string `toml:"iap_service_account,omitempty"`

	dir string // directory the file was found in (for reporting)
}

// FindProjectRC walks up from the current working directory looking for the
// nearest .govrc, stopping at the filesystem root. It returns (nil, nil) when
// none is found. Set $GOVERNOR_NO_RC to disable discovery entirely.
func FindProjectRC() (*ProjectRC, error) {
	if os.Getenv("GOVERNOR_NO_RC") != "" {
		return nil, nil
	}
	dir, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	for {
		p := filepath.Join(dir, ProjectRCName)
		data, err := os.ReadFile(p)
		if err == nil {
			rc := &ProjectRC{dir: dir}
			if err := toml.Unmarshal(data, rc); err != nil {
				return nil, fmt.Errorf("parse %s: %w", p, err)
			}
			return rc, nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return nil, nil
		}
		dir = parent
	}
}

// Dir reports the directory the .govrc was discovered in.
func (r *ProjectRC) Dir() string { return r.dir }

// Save writes the .govrc into dir at 0600 (it may carry an api_key) using a
// temp-file + rename so a partial write never clobbers an existing file.
// Only the set (non-empty) fields are written.
func (r *ProjectRC) Save(dir string) (string, error) {
	p := filepath.Join(dir, ProjectRCName)
	tmp, err := os.CreateTemp(dir, ".govrc.*")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return "", err
	}
	if err := toml.NewEncoder(tmp).Encode(r); err != nil {
		_ = tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(tmp.Name(), p); err != nil {
		return "", err
	}
	return p, nil
}
