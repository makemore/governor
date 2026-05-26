package commands

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/makemore/governor/cli/go/internal/api"
	"github.com/makemore/governor/cli/go/internal/ui"
	"github.com/spf13/cobra"
)

func newRunsCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "runs",
		Short: "Create and inspect runs",
	}
	c.AddCommand(runsNew(), runsShow())
	return c
}

func runsNew() *cobra.Command {
	var (
		file       string
		subjectID  string
		subjectLbl string
		subjectK   string
	)
	c := &cobra.Command{
		Use:   "new <file.json>",
		Short: "Open a run from a checklist file (- for stdin)",
		Long: "The file can be one of:\n" +
			"  • a full RunCreate object {\"checklist\":…, \"subject\":…}\n" +
			"  • a bare ChecklistDef {\"key\":…, \"items\":[…]} (subject supplied via flags)\n" +
			"  • a JSON array of items (key inferred from filename)",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			file = args[0]
			raw, err := readFileOrStdin(file)
			if err != nil {
				return err
			}
			runIn, err := parseRunCreate(raw, file, subjectID, subjectLbl, subjectK)
			if err != nil {
				return err
			}
			return runWith(func(ctx context.Context, c *api.Client) error {
				var r *api.Run
				if err := ui.WithSpinner("opening run", func() error {
					rr, err := c.CreateRun(ctx, *runIn)
					if err != nil {
						return err
					}
					r = rr
					return nil
				}); err != nil {
					return err
				}
				fmt.Println(ui.OK.Render("✓ run opened"))
				fmt.Println(ui.Sub.Render("id:      ") + r.ID)
				fmt.Println(ui.Sub.Render("subject: ") + r.Subject.ID)
				fmt.Println(ui.Sub.Render("items:   ") + fmt.Sprintf("%d", len(r.Items)))
				return nil
			})
		},
	}
	c.Flags().StringVar(&subjectID, "subject", "", "subject id (required when the file omits it)")
	c.Flags().StringVar(&subjectLbl, "subject-label", "", "human label for the subject")
	c.Flags().StringVar(&subjectK, "subject-kind", "", "subject kind, e.g. release, deploy")
	return c
}

func runsShow() *cobra.Command {
	return &cobra.Command{
		Use:   "show <run-id>",
		Short: "Print a run as JSON",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runWith(func(ctx context.Context, c *api.Client) error {
				var r *api.Run
				if err := ui.WithSpinner("fetching run", func() error {
					rr, err := c.GetRun(ctx, args[0])
					if err != nil {
						return err
					}
					r = rr
					return nil
				}); err != nil {
					return err
				}
				out, _ := json.MarshalIndent(r, "", "  ")
				fmt.Println(string(out))
				return nil
			})
		},
	}
}

func readFileOrStdin(path string) ([]byte, error) {
	if path == "-" {
		return io.ReadAll(os.Stdin)
	}
	return os.ReadFile(path)
}

func parseRunCreate(raw []byte, hintName, subID, subLbl, subKind string) (*api.RunCreate, error) {
	var maybe map[string]json.RawMessage
	if err := json.Unmarshal(raw, &maybe); err == nil {
		if _, ok := maybe["checklist"]; ok {
			var rc api.RunCreate
			if err := json.Unmarshal(raw, &rc); err != nil {
				return nil, fmt.Errorf("decode RunCreate: %w", err)
			}
			if subID != "" {
				rc.Subject.ID = subID
			}
			if rc.Subject.ID == "" {
				return nil, fmt.Errorf("missing subject.id (set in file or pass --subject)")
			}
			return &rc, nil
		}
		if _, ok := maybe["items"]; ok {
			var cd api.ChecklistDef
			if err := json.Unmarshal(raw, &cd); err != nil {
				return nil, fmt.Errorf("decode ChecklistDef: %w", err)
			}
			if subID == "" {
				return nil, fmt.Errorf("checklist-only file: --subject is required")
			}
			return &api.RunCreate{
				Checklist: cd,
				Subject:   api.RunSubject{ID: subID, Label: subLbl, Kind: subKind},
			}, nil
		}
	}
	return nil, fmt.Errorf("could not parse %s as RunCreate or ChecklistDef", hintName)
}
