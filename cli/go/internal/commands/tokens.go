package commands

import (
	"context"
	"fmt"
	"os"

	"github.com/makemore/governor/cli/go/internal/api"
	"github.com/makemore/governor/cli/go/internal/config"
	"github.com/makemore/governor/cli/go/internal/ui"
	"github.com/spf13/cobra"
)

func newTokensCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "tokens",
		Short: "Mint bearer tokens for actors",
	}
	c.AddCommand(tokensMint())
	return c
}

func tokensMint() *cobra.Command {
	var saveAs string
	c := &cobra.Command{
		Use:   "mint <actor-id>",
		Short: "Mint a new bearer token (shown ONCE)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runWith(func(ctx context.Context, c *api.Client) error {
				var tok *api.TokenMint
				if err := ui.WithSpinner("minting token", func() error {
					t, err := c.MintToken(ctx, args[0])
					if err != nil {
						return err
					}
					tok = t
					return nil
				}); err != nil {
					return err
				}
				if saveAs != "" {
					if err := savePersona(saveAs, c.BaseURL, tok.Token, c.IAPAudience, c.IAPServiceAccount, false, false); err != nil {
						return err
					}
					path, _ := config.Path()
					fmt.Fprintln(os.Stderr)
					fmt.Fprintln(os.Stderr, ui.OK.Render("✓ token saved"))
					fmt.Fprintln(os.Stderr, ui.Sub.Render("  actor:   ")+tok.ActorID)
					fmt.Fprintln(os.Stderr, ui.Sub.Render("  persona: ")+saveAs+ui.Sub.Render("  ("+path+")"))
					fmt.Fprintln(os.Stderr, ui.Sub.Render("  use:     ")+"GOVERNOR_PERSONA="+saveAs+" gov whoami")
					return nil
				}
				fmt.Fprintln(os.Stderr, ui.Note.Render("⚠ token shown once; copy now"))
				fmt.Println(tok.Token)
				return nil
			})
		},
	}
	c.Flags().StringVar(&saveAs, "save-as", "",
		"save the resulting token as a new persona instead of printing it")
	return c
}
