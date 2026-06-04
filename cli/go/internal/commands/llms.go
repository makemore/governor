package commands

import (
	_ "embed"
	"fmt"

	"github.com/spf13/cobra"
)

// llmsDoc is a self-contained Governor reference, embedded at build time.
// It is the source of truth an LLM agent ingests to refresh its context
// about the tool; keep it in sync with the protocol and the command tree.
//
//go:embed llms.md
var llmsDoc string

func newLLMsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "llms",
		Short: "Print a self-contained Governor reference for LLM agents to ingest",
		Long: "Writes a complete, self-contained description of Governor — the mental\n" +
			"model, the rule DSL, the command surface, and rules of engagement — to\n" +
			"stdout. Pipe it into an agent's context to (re)teach it how to use gov:\n\n" +
			"  gov llms                 # read it yourself\n" +
			"  gov llms > GOVERNOR.md   # drop it into a repo for your agent\n\n" +
			"The document is purely local; no server or persona is required.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			fmt.Print(llmsDoc)
			return nil
		},
	}
}
