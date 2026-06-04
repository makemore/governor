package commands

import (
	"errors"
	"fmt"
	"os"

	"github.com/makemore/governor/cli/go/internal/config"
	"github.com/makemore/governor/cli/go/internal/ui"
	"github.com/spf13/cobra"
)

func newPersonasCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "personas",
		Short: "Manage local connection profiles (no API calls)",
	}
	c.AddCommand(personasAdd(), personasList(), personasUse(), personasShow(), personasRemove())
	return c
}

func personasList() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List configured personas",
		RunE: func(cmd *cobra.Command, _ []string) error {
			f, err := config.Load()
			if err != nil {
				return err
			}
			if len(f.Personas) == 0 {
				fmt.Fprintln(os.Stderr, ui.Sub.Render("no personas configured. try `gov bootstrap`."))
				return nil
			}
			for _, name := range f.Names() {
				marker := "  "
				if name == f.Default {
					marker = ui.OK.Render("* ")
				}
				fmt.Printf("%s%s %s\n", marker, ui.Key.Render(name),
					ui.Sub.Render(f.Personas[name].BaseURL))
			}
			return nil
		},
	}
}

func personasShow() *cobra.Command {
	return &cobra.Command{
		Use:   "show <name>",
		Short: "Show one persona (api_key redacted)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			f, err := config.Load()
			if err != nil {
				return err
			}
			p, ok := f.Personas[args[0]]
			if !ok {
				return fmt.Errorf("no such persona: %s", args[0])
			}
			fmt.Println(ui.Key.Render("name:    ") + args[0])
			fmt.Println(ui.Key.Render("base_url:") + " " + p.BaseURL)
			fmt.Println(ui.Key.Render("api_key: ") + redact(p.APIKey))
			if p.IAPAudience != "" {
				fmt.Println(ui.Key.Render("iap_audience: ") + p.IAPAudience)
			}
			if p.IAPServiceAccount != "" {
				fmt.Println(ui.Key.Render("iap_service_account: ") + p.IAPServiceAccount)
			}
			if f.Default == args[0] {
				fmt.Println(ui.OK.Render("(default)"))
			}
			return nil
		},
	}
}

func personasUse() *cobra.Command {
	return &cobra.Command{
		Use:   "use <name>",
		Short: "Set the default persona",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			f, err := config.Load()
			if err != nil {
				return err
			}
			if _, ok := f.Personas[args[0]]; !ok {
				return fmt.Errorf("no such persona: %s", args[0])
			}
			f.Default = args[0]
			if err := f.Save(); err != nil {
				return err
			}
			fmt.Fprintln(os.Stderr, ui.OK.Render("default persona: ")+args[0])
			return nil
		},
	}
}

func personasRemove() *cobra.Command {
	return &cobra.Command{
		Use:     "remove <name>",
		Aliases: []string{"rm"},
		Short:   "Delete a persona from the local config",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			f, err := config.Load()
			if err != nil {
				return err
			}
			if _, ok := f.Personas[args[0]]; !ok {
				return fmt.Errorf("no such persona: %s", args[0])
			}
			delete(f.Personas, args[0])
			if f.Default == args[0] {
				f.Default = ""
			}
			if err := f.Save(); err != nil {
				return err
			}
			fmt.Fprintln(os.Stderr, ui.Note.Render("removed persona: ")+args[0])
			return nil
		},
	}
}

func personasAdd() *cobra.Command {
	var name, baseURL, apiKey, iapAudience, iapServiceAccount string
	var setDefault bool
	c := &cobra.Command{
		Use:   "add",
		Short: "Add or update a persona",
		RunE: func(cmd *cobra.Command, _ []string) error {
			if name == "" || baseURL == "" || apiKey == "" {
				return errors.New("--name, --base-url and --api-key are required")
			}
			return savePersona(name, baseURL, apiKey, iapAudience, iapServiceAccount, setDefault, true)
		},
	}
	c.Flags().StringVar(&name, "name", "", "persona name (e.g. prod)")
	c.Flags().StringVar(&baseURL, "base-url", "", "Governor API base URL")
	c.Flags().StringVar(&apiKey, "api-key", "", "bearer token issued by gov tokens mint")
	c.Flags().StringVar(&iapAudience, "iap-audience", "", "IAP OAuth client ID, if the deployment is behind Identity-Aware Proxy")
	c.Flags().StringVar(&iapServiceAccount, "iap-service-account", "", "service account to impersonate when minting the IAP token")
	c.Flags().BoolVar(&setDefault, "default", false, "make this the default persona")
	return c
}
