package commands

import (
	"context"
	"fmt"
	"os"

	"github.com/makemore/governor/cli/go/internal/api"
	"github.com/makemore/governor/cli/go/internal/ui"
	"github.com/spf13/cobra"
)

func newGateCmd() *cobra.Command {
	var quiet bool
	c := &cobra.Command{
		Use:   "gate <run-id>",
		Short: "Evaluate the gate for a run and print allow/deny",
		Long: "Exits 0 when the gate decision is `allow`, 1 when `deny`.\n" +
			"Suitable for use in CI as the final step before deploy.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runWith(func(ctx context.Context, c *api.Client) error {
				var g *api.GateDecision
				if err := ui.WithSpinner("evaluating gate", func() error {
					gg, err := c.Gate(ctx, args[0])
					if err != nil {
						return err
					}
					g = gg
					return nil
				}); err != nil {
					return err
				}
				if !quiet {
					fmt.Println(ui.RenderGate(g))
				} else {
					fmt.Println(g.Decision)
				}
				if g.Decision != "allow" {
					os.Exit(1)
				}
				return nil
			})
		},
	}
	c.Flags().BoolVarP(&quiet, "quiet", "q", false, "print only the decision word; no frame")
	return c
}
