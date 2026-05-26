package commands

import (
	"context"
	"fmt"
	"strings"

	"github.com/makemore/governor/cli/go/internal/api"
	"github.com/makemore/governor/cli/go/internal/ui"
	"github.com/spf13/cobra"
)

func newWhoamiCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "whoami",
		Short: "Show the actor the current persona authenticates as",
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runWith(func(ctx context.Context, c *api.Client) error {
				var me *api.Actor
				if err := ui.WithSpinner("contacting server", func() error {
					a, err := c.Whoami(ctx)
					if err != nil {
						return err
					}
					me = a
					return nil
				}); err != nil {
					return err
				}
				fmt.Println(ui.Key.Render(me.DisplayName) +
					ui.Sub.Render("  ("+me.Kind+")"))
				fmt.Println(ui.Sub.Render("id:    ") + me.ID)
				roles := "none"
				if len(me.Roles) > 0 {
					roles = strings.Join(me.Roles, ", ")
				}
				fmt.Println(ui.Sub.Render("roles: ") + roles)
				return nil
			})
		},
	}
}
