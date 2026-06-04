// Package commands wires the cobra command tree for the gov binary.
package commands

import (
	"github.com/spf13/cobra"
)

// Version is overridden at build time via -ldflags "-X .../commands.Version=...".
var Version = "dev"

var (
	flagPersona string
)

func NewRoot() *cobra.Command {
	root := &cobra.Command{
		Use:   "gov",
		Short: "Talk to a Governor attestation server",
		Long: "gov is the command-line client for Governor.\n" +
			"Configure a persona once (gov bootstrap), then create runs, attest items,\n" +
			"and check whether a run is allowed to ship.",
		SilenceUsage:  true,
		SilenceErrors: true,
		Version:       Version,
	}
	root.PersistentFlags().StringVarP(&flagPersona, "persona", "p", "",
		"persona to use (overrides $GOVERNOR_PERSONA and the configured default)")

	root.AddCommand(
		newBootstrapCmd(),
		newWhoamiCmd(),
		newPersonasCmd(),
		newActorsCmd(),
		newTokensCmd(),
		newRunsCmd(),
		newAttestCmd(),
		newGateCmd(),
		newLLMsCmd(),
	)
	return root
}
