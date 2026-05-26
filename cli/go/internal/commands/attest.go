package commands

import (
	"context"
	"fmt"

	"github.com/makemore/governor/cli/go/internal/api"
	"github.com/makemore/governor/cli/go/internal/ui"
	"github.com/spf13/cobra"
)

func newAttestCmd() *cobra.Command {
	var note string
	c := &cobra.Command{
		Use:   "attest <run-id> <item-key>",
		Short: "Sign off on a run item (append-only)",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			runID, itemKey := args[0], args[1]
			return runWith(func(ctx context.Context, c *api.Client) error {
				var a *api.Attestation
				if err := ui.WithSpinner("recording attestation", func() error {
					at, err := c.Attest(ctx, runID, api.AttestationCreate{
						ItemKey: itemKey, Note: note,
					})
					if err != nil {
						return err
					}
					a = at
					return nil
				}); err != nil {
					return err
				}
				fmt.Println(ui.OK.Render("✓ attested ") + ui.Key.Render(itemKey))
				fmt.Println(ui.Sub.Render("by:      ") + a.Actor.DisplayName +
					ui.Sub.Render(" ("+a.Actor.Kind+")"))
				fmt.Println(ui.Sub.Render("at:      ") + a.AttestedAt.Format("2006-01-02 15:04:05 MST"))
				if a.Note != "" {
					fmt.Println(ui.Sub.Render("note:    ") + a.Note)
				}
				return nil
			})
		},
	}
	c.Flags().StringVarP(&note, "note", "n", "", "optional human note recorded with the attestation")
	return c
}
