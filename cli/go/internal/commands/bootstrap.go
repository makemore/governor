package commands

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/user"
	"strings"

	"github.com/charmbracelet/huh"
	"github.com/makemore/governor/cli/go/internal/api"
	"github.com/makemore/governor/cli/go/internal/ui"
	"github.com/spf13/cobra"
)

func newBootstrapCmd() *cobra.Command {
	var (
		baseURL           string
		bootstrap         string
		displayName       string
		personaName       string
		iapAudience       string
		iapServiceAccount string
	)
	c := &cobra.Command{
		Use:   "bootstrap",
		Short: "Exchange a bootstrap token for an admin persona",
		Long: "Walks through the one-time setup for a fresh Governor:\n" +
			"  1. verify the bootstrap token with /v1/whoami\n" +
			"  2. create your first admin actor\n" +
			"  3. mint that actor's first token\n" +
			"  4. save it as a local persona\n\n" +
			"The bootstrap token is NOT persisted. After this completes, rotate it on\n" +
			"the server (delete the GOVERNOR_BOOTSTRAP_TOKEN secret).",
		RunE: func(cmd *cobra.Command, _ []string) error {
			if baseURL == "" {
				baseURL = os.Getenv("GOVERNOR_BASE_URL")
			}
			if bootstrap == "" {
				bootstrap = os.Getenv("GOVERNOR_BOOTSTRAP_TOKEN")
			}
			if displayName == "" {
				if u, err := user.Current(); err == nil {
					displayName = u.Username
				}
			}
			if personaName == "" {
				personaName = "admin"
			}

			if err := promptBootstrap(&baseURL, &bootstrap, &displayName, &personaName); err != nil {
				return err
			}

			if iapAudience == "" {
				iapAudience = os.Getenv("GOVERNOR_IAP_AUDIENCE")
			}
			if iapServiceAccount == "" {
				iapServiceAccount = os.Getenv("GOVERNOR_IAP_SERVICE_ACCOUNT")
			}

			baseURL, err := api.NormalizeBaseURL(baseURL)
			if err != nil {
				return err
			}

			ctx := context.Background()
			boot := api.New(baseURL, bootstrap)
			proxyTok, err := api.ResolveIAPToken(iapAudience, iapServiceAccount)
			if err != nil {
				return err
			}
			boot.ProxyToken = proxyTok

			var actor *api.Actor
			var token *api.TokenMint

			if err := ui.WithSpinner("verifying bootstrap token", func() error {
				me, err := boot.Whoami(ctx)
				if err != nil {
					return err
				}
				if !hasRole(me.Roles, "admin") {
					return fmt.Errorf("bootstrap token authenticates as %q with roles %v; expected admin",
						me.DisplayName, me.Roles)
				}
				return nil
			}); err != nil {
				return err
			}

			if err := ui.WithSpinner("creating admin actor", func() error {
				a, err := boot.CreateActor(ctx, api.ActorCreate{
					Kind: "human", DisplayName: displayName, Roles: []string{"admin"},
				})
				if err != nil {
					return err
				}
				actor = a
				return nil
			}); err != nil {
				return err
			}

			if err := ui.WithSpinner("minting first token", func() error {
				t, err := boot.MintToken(ctx, actor.ID)
				if err != nil {
					return err
				}
				token = t
				return nil
			}); err != nil {
				return err
			}

			if err := savePersona(personaName, baseURL, token.Token, iapAudience, iapServiceAccount, true, false); err != nil {
				return err
			}

			fmt.Fprintln(os.Stderr)
			fmt.Fprintln(os.Stderr, ui.OK.Render("✓ done"))
			fmt.Fprintln(os.Stderr, ui.Sub.Render("  actor:   ")+actor.DisplayName+ui.Sub.Render(" ("+actor.ID+")"))
			fmt.Fprintln(os.Stderr, ui.Sub.Render("  persona: ")+personaName+ui.Sub.Render(" (now default)"))
			fmt.Fprintln(os.Stderr)
			fmt.Fprintln(os.Stderr, ui.Note.Render("→ rotate the bootstrap token now: it can still create admins."))
			fmt.Fprintln(os.Stderr, ui.Sub.Render("   on Cloudflare:  npx wrangler secret delete GOVERNOR_BOOTSTRAP_TOKEN"))
			fmt.Fprintln(os.Stderr, ui.Sub.Render("   on Render/Fly:  unset GOVERNOR_BOOTSTRAP_TOKEN in the dashboard"))
			return nil
		},
	}
	c.Flags().StringVar(&baseURL, "base-url", "", "Governor API base URL (default: $GOVERNOR_BASE_URL)")
	c.Flags().StringVar(&bootstrap, "bootstrap-token", "", "value of GOVERNOR_BOOTSTRAP_TOKEN (default: $GOVERNOR_BOOTSTRAP_TOKEN)")
	c.Flags().StringVar(&displayName, "display-name", "", "name for the first admin actor (default: $USER)")
	c.Flags().StringVar(&personaName, "persona", "admin", "name to save the resulting persona under")
	c.Flags().StringVar(&iapAudience, "iap-audience", "", "IAP OAuth client ID, if the deployment is behind Identity-Aware Proxy (default: $GOVERNOR_IAP_AUDIENCE)")
	c.Flags().StringVar(&iapServiceAccount, "iap-service-account", "", "service account to impersonate when minting the IAP token (default: $GOVERNOR_IAP_SERVICE_ACCOUNT)")
	return c
}

func promptBootstrap(baseURL, token, name, persona *string) error {
	fields := []huh.Field{}
	if *baseURL == "" {
		fields = append(fields, huh.NewInput().
			Title("Governor base URL").
			Placeholder("https://governor.<your>.workers.dev").
			Value(baseURL).
			Validate(nonEmpty))
	}
	if *token == "" {
		fields = append(fields, huh.NewInput().
			Title("Bootstrap token").
			Description("The GOVERNOR_BOOTSTRAP_TOKEN you set when deploying.").
			EchoMode(huh.EchoModePassword).
			Value(token).
			Validate(nonEmpty))
	}
	if *name == "" {
		fields = append(fields, huh.NewInput().
			Title("First admin display name").Value(name).Validate(nonEmpty))
	}
	if *persona == "" {
		fields = append(fields, huh.NewInput().
			Title("Save as persona").Value(persona).Validate(nonEmpty))
	}
	if len(fields) == 0 {
		return nil
	}
	return huh.NewForm(huh.NewGroup(fields...)).Run()
}

func nonEmpty(s string) error {
	if strings.TrimSpace(s) == "" {
		return errors.New("required")
	}
	return nil
}

func hasRole(roles []string, want string) bool {
	for _, r := range roles {
		if r == want {
			return true
		}
	}
	return false
}
