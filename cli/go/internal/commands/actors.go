package commands

import (
	"context"
	"fmt"
	"strings"

	"github.com/makemore/governor/cli/go/internal/api"
	"github.com/makemore/governor/cli/go/internal/ui"
	"github.com/spf13/cobra"
)

func newActorsCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "actors",
		Short: "Create actors (humans, agents, services)",
	}
	c.AddCommand(actorsCreate())
	return c
}

func actorsCreate() *cobra.Command {
	var kind, name, rolesRaw string
	c := &cobra.Command{
		Use:   "create",
		Short: "Create a new actor (admin role required)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			if name == "" {
				return fmt.Errorf("--name is required")
			}
			if kind != "human" && kind != "agent" && kind != "service" {
				return fmt.Errorf("--kind must be one of: human, agent, service")
			}
			var roles []string
			for _, r := range strings.Split(rolesRaw, ",") {
				r = strings.TrimSpace(r)
				if r != "" {
					roles = append(roles, r)
				}
			}
			return runWith(func(ctx context.Context, c *api.Client) error {
				var actor *api.Actor
				if err := ui.WithSpinner("creating actor", func() error {
					a, err := c.CreateActor(ctx, api.ActorCreate{
						Kind: kind, DisplayName: name, Roles: roles,
					})
					if err != nil {
						return err
					}
					actor = a
					return nil
				}); err != nil {
					return err
				}
				fmt.Println(ui.OK.Render("✓ created"))
				fmt.Println(ui.Sub.Render("id:    ") + actor.ID)
				fmt.Println(ui.Sub.Render("kind:  ") + actor.Kind)
				fmt.Println(ui.Sub.Render("name:  ") + actor.DisplayName)
				if len(actor.Roles) > 0 {
					fmt.Println(ui.Sub.Render("roles: ") + strings.Join(actor.Roles, ", "))
				}
				return nil
			})
		},
	}
	c.Flags().StringVar(&kind, "kind", "human", "human | agent | service")
	c.Flags().StringVar(&name, "name", "", "display name")
	c.Flags().StringVar(&rolesRaw, "roles", "", "comma-separated roles, e.g. ci,reviewer")
	return c
}
