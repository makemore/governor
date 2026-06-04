package commands

import (
	"context"
	"fmt"
	"strings"

	"github.com/makemore/governor/cli/go/internal/api"
	"github.com/makemore/governor/cli/go/internal/ui"
	"github.com/spf13/cobra"
)

func newAttestCmd() *cobra.Command {
	var (
		outcome  string
		severity string
		note     string
		detail   string
		evidence []string
	)
	c := &cobra.Command{
		Use:   "attest <run-id> <item-key>",
		Short: "Sign off on a run item (append-only)",
		Long: "Record an attestation against a run item. Attestations are append-only,\n" +
			"so each call adds a timestamped, actor-signed entry.\n\n" +
			"Outcome is one of pass (default), fail, or waived. A 'fail' never\n" +
			"satisfies the gate. Attach structured proof with repeated --evidence:\n\n" +
			"  --evidence https://ci.example/run/42         (a URL)\n" +
			"  --evidence kind=hash,content_hash=sha256:ab…,media_type=application/zip\n" +
			"  --evidence kind=url,url=https://…,media_type=text/html",
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			runID, itemKey := args[0], args[1]
			ev, err := parseEvidenceSpecs(evidence)
			if err != nil {
				return err
			}
			return runWith(func(ctx context.Context, c *api.Client) error {
				var a *api.Attestation
				if err := ui.WithSpinner("recording attestation", func() error {
					at, err := c.Attest(ctx, runID, api.AttestationCreate{
						ItemKey:  itemKey,
						Outcome:  outcome,
						Severity: severity,
						Note:     note,
						Detail:   detail,
						Evidence: ev,
					})
					if err != nil {
						return err
					}
					a = at
					return nil
				}); err != nil {
					return err
				}
				printAttestation(itemKey, a)
				return nil
			})
		},
	}
	c.Flags().StringVarP(&outcome, "outcome", "o", "", "outcome: pass (default), fail, or waived")
	c.Flags().StringVar(&severity, "severity", "", "severity: info, low, medium, high, or critical")
	c.Flags().StringVarP(&note, "note", "n", "", "short human note recorded with the attestation")
	c.Flags().StringVarP(&detail, "detail", "d", "", "long-form findings (free text, preserved verbatim)")
	c.Flags().StringArrayVarP(&evidence, "evidence", "e", nil, "structured evidence; repeatable (see --help)")
	return c
}

func printAttestation(itemKey string, a *api.Attestation) {
	oc := a.Outcome
	if oc == "" {
		oc = "pass"
	}
	fmt.Println(ui.OK.Render("✓ attested ") + ui.Key.Render(itemKey) +
		ui.Sub.Render("  ["+oc+"]"))
	fmt.Println(ui.Sub.Render("id:      ") + a.ID)
	fmt.Println(ui.Sub.Render("by:      ") + a.Actor.DisplayName +
		ui.Sub.Render(" ("+a.Actor.Kind+")"))
	fmt.Println(ui.Sub.Render("at:      ") + a.AttestedAt.Format("2006-01-02 15:04:05 MST"))
	if a.Severity != "" {
		fmt.Println(ui.Sub.Render("severity:") + " " + a.Severity)
	}
	if a.Note != "" {
		fmt.Println(ui.Sub.Render("note:    ") + a.Note)
	}
	if a.Detail != "" {
		fmt.Println(ui.Sub.Render("detail:  ") + a.Detail)
	}
	for _, e := range a.Evidence {
		fmt.Println(ui.Sub.Render("evidence:") + " " + describeEvidence(e))
	}
}

func describeEvidence(e api.Evidence) string {
	switch e.Kind {
	case "url":
		return "url " + e.URL
	case "hash":
		s := "hash " + e.ContentHash
		if e.MediaType != "" {
			s += " (" + e.MediaType + ")"
		}
		return s
	default:
		s := "inline"
		if e.MediaType != "" {
			s += " " + e.MediaType
		}
		if e.URL != "" {
			s += " " + e.URL
		}
		return s
	}
}

// parseEvidenceSpecs turns repeated --evidence values into structured entries.
// A bare http(s) URL is shorthand for kind=url. Otherwise the value is a
// comma-separated list of key=value pairs (kind, url, content_hash/hash,
// media_type/media); kind is inferred from the populated fields when omitted.
func parseEvidenceSpecs(specs []string) ([]api.Evidence, error) {
	out := make([]api.Evidence, 0, len(specs))
	for _, raw := range specs {
		s := strings.TrimSpace(raw)
		if s == "" {
			continue
		}
		var e api.Evidence
		if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") {
			e = api.Evidence{Kind: "url", URL: s}
		} else {
			for _, pair := range strings.Split(s, ",") {
				k, v, ok := strings.Cut(strings.TrimSpace(pair), "=")
				if !ok {
					return nil, fmt.Errorf("evidence %q: expected key=value (or a bare URL)", raw)
				}
				k, v = strings.TrimSpace(k), strings.TrimSpace(v)
				switch k {
				case "kind":
					e.Kind = v
				case "url":
					e.URL = v
				case "hash", "content_hash":
					e.ContentHash = v
				case "media", "media_type":
					e.MediaType = v
				default:
					return nil, fmt.Errorf("evidence %q: unknown field %q", raw, k)
				}
			}
		}
		if e.Kind == "" {
			switch {
			case e.URL != "":
				e.Kind = "url"
			case e.ContentHash != "":
				e.Kind = "hash"
			default:
				e.Kind = "inline"
			}
		}
		out = append(out, e)
	}
	return out, nil
}
