package commands

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/lipgloss"
	"github.com/makemore/governor/cli/go/internal/api"
	"github.com/makemore/governor/cli/go/internal/config"
	"github.com/makemore/governor/cli/go/internal/ui"
	"github.com/spf13/cobra"
)

func newHumanCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "human",
		Short: "Guided helpers for the parts only a person can do",
	}
	c.AddCommand(newHumanAttestCmd())
	return c
}

func newHumanAttestCmd() *cobra.Command {
	var all bool
	c := &cobra.Command{
		Use:   "attest [run-id]",
		Short: "Interactively sign off the items waiting on a human",
		Long: "Walks you through every unsatisfied item on a run that needs a human\n" +
			"signature — showing what each one asserts, then prompting for outcome,\n" +
			"note, and evidence — so you don't have to hand-write a `gov attest`\n" +
			"command per item. Re-evaluates the gate at the end.\n\n" +
			"Omit the run-id to pick from a list of recent runs. If your active\n" +
			"persona isn't a human, you'll be offered your configured human personas\n" +
			"to sign with — no need to re-flag. Use --all to include every\n" +
			"unsatisfied item, not just the human-only ones.",
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if !ui.IsTTY() {
				return fmt.Errorf("gov human attest is interactive and needs a terminal; use `gov attest` in scripts/CI")
			}
			runID := ""
			if len(args) == 1 {
				runID = args[0]
			}
			c, name, err := clientFor()
			if err != nil {
				return err
			}
			return runHumanAttest(context.Background(), c, name, runID, all)
		},
	}
	c.Flags().BoolVar(&all, "all", false, "include every unsatisfied item, not just those that require a human")
	return c
}

func runHumanAttest(ctx context.Context, c *api.Client, name, runID string, all bool) error {
	// The whole point of human sign-off is that a person made it. Rather than
	// erroring out when the active persona is an agent/service, help the user
	// switch to one of their configured human personas on the same machine.
	c, name, me, err := ensureHuman(ctx, c, name)
	if err != nil {
		if isBack(err) {
			return nil // esc while picking a persona just leaves.
		}
		return err
	}
	fmt.Fprintln(os.Stderr, ui.Sub.Render("→ "+name+" "+c.BaseURL))

	// The flow is a small state machine so esc can walk backwards a screen at a
	// time: item form → item list → run list → exit. Each huh form binds esc to
	// abort (see backKeyMap); we catch that here as a "go back" signal.
	argRun := strings.TrimSpace(runID)

runs:
	for {
		// STEP 1 — choose a run, unless one was given on the command line.
		selRun := argRun
		if selRun == "" {
			selRun, err = chooseRun(ctx, c)
			if isBack(err) {
				return nil // esc on the run list leaves the command.
			}
			if err != nil {
				return err
			}
			if selRun == "" {
				fmt.Println(ui.Sub.Render("no run selected — nothing to do."))
				return nil
			}
		}

		var run *api.Run
		var gate *api.GateDecision
		if err := ui.WithSpinner("loading run", func() error {
			r, err := c.GetRun(ctx, selRun)
			if err != nil {
				return err
			}
			g, err := c.Gate(ctx, selRun)
			if err != nil {
				return err
			}
			run, gate = r, g
			return nil
		}); err != nil {
			return err
		}

		satisfied := map[string]bool{}
		reason := map[string]string{}
		for _, gi := range gate.Items {
			satisfied[gi.Key] = gi.Satisfied
			reason[gi.Key] = gi.Reason
		}

		var cands []api.RunItem
		for _, it := range run.Items {
			if satisfied[it.Key] {
				continue
			}
			if all || ruleNeedsHuman(it.Rule) {
				cands = append(cands, it)
			}
		}

		subj := run.Subject.Label
		if subj == "" {
			subj = run.Subject.ID
		}
		fmt.Println()
		fmt.Println(ui.Title.Render("Human sign-off") + ui.Sub.Render("  "+subj))
		fmt.Println(ui.Sub.Render(fmt.Sprintf("%d of %d items satisfied · signing as %s",
			gate.Summary.ItemsSatisfied, gate.Summary.ItemsTotal, me.DisplayName)))

		if len(cands) == 0 {
			if gate.Decision == "allow" {
				fmt.Println(ui.OK.Render("✓ nothing waiting on you — the gate already allows this run."))
			} else {
				fmt.Println(ui.Note.Render("Nothing here needs a human signature.") +
					ui.Sub.Render(" Remaining items are for CI/agents/services. Use --all to sign anything unsatisfied."))
			}
			if argRun != "" {
				return nil
			}
			continue runs // back to the run list to pick another.
		}

		byKey := map[string]api.RunItem{}
		for _, it := range cands {
			byKey[it.Key] = it
		}

		signed := map[string]bool{}
		recorded, skipped := 0, 0

		// STEP 2 — pick items, then sign each. esc on the item list steps back
		// to the run list; esc inside an item form steps back to the item list.
	items:
		for {
			remaining := make([]api.RunItem, 0, len(cands))
			for _, it := range cands {
				if !signed[it.Key] {
					remaining = append(remaining, it)
				}
			}
			if len(remaining) == 0 {
				break items // everything offered has been signed.
			}

			chosen, err := pickItems(remaining)
			if isBack(err) {
				if argRun != "" {
					break items // no run list to fall back to; wrap up.
				}
				continue runs // back to the run list.
			}
			if err != nil {
				return err
			}
			if len(chosen) == 0 {
				if recorded == 0 && skipped == 0 {
					fmt.Println(ui.Sub.Render("nothing selected — no attestations recorded."))
				}
				break items
			}

			back := false
			for _, key := range chosen {
				it := byKey[key]
				ok, err := attestOneInteractive(ctx, c, selRun, it, reason[key])
				if isBack(err) {
					back = true // esc in the form: return to the item list.
					break
				}
				if err != nil {
					fmt.Println(ui.Bad.Render("✗ "+key+": ") + err.Error())
					continue
				}
				if ok {
					recorded++
					signed[key] = true
				} else {
					skipped++
					fmt.Println(ui.Sub.Render("– skipped " + key))
				}
			}
			if back {
				continue items // re-show the item list with what's left.
			}
			break items // batch finished.
		}

		// Finished with this run: re-evaluate the gate and report.
		fmt.Println()
		var g2 *api.GateDecision
		if err := ui.WithSpinner("re-evaluating gate", func() error {
			gg, err := c.Gate(ctx, selRun)
			g2 = gg
			return err
		}); err != nil {
			return err
		}
		fmt.Println(ui.RenderGate(g2))
		fmt.Fprintln(os.Stderr, ui.Sub.Render(fmt.Sprintf("recorded %d · skipped %d", recorded, skipped)))
		return nil
	}
}

// isBack reports whether a huh form returned because the user pressed esc (or
// ctrl+c) to abort the current step. The attest flow treats it as "go back".
func isBack(err error) bool {
	return errors.Is(err, huh.ErrUserAborted)
}

// ensureHuman guarantees the returned client signs as a human actor. If the
// active persona already is one, it's used as-is. Otherwise it probes the
// other configured personas for human actors and lets the user switch to one,
// so an operator working as their agent can still sign as themselves without
// re-flagging. Returns the (possibly swapped) client, its persona name, and
// the resolved human actor.
func ensureHuman(ctx context.Context, c *api.Client, name string) (*api.Client, string, *api.Actor, error) {
	var me *api.Actor
	if err := ui.WithSpinner("checking who you are", func() error {
		a, err := c.Whoami(ctx)
		me = a
		return err
	}); err != nil {
		return nil, "", nil, err
	}
	if me.Kind == "human" {
		return c, name, me, nil
	}

	var humans []string
	actors := map[string]*api.Actor{}
	if err := ui.WithSpinner("looking for a human persona", func() error {
		humans, actors = scanHumanPersonas(ctx, name)
		return nil
	}); err != nil {
		return nil, "", nil, err
	}

	if len(humans) == 0 {
		return nil, "", nil, fmt.Errorf(
			"persona %q signs as %s (kind %q), and no other configured persona is a human actor.\n"+
				"  Ask an admin to create one and mint you a persona:\n"+
				"    gov -p <admin> actors create --kind human --name \"Your Name\" --roles owner,reviewer\n"+
				"    gov -p <admin> tokens mint <actor-id> --save-as me\n"+
				"  then re-run:  gov human attest",
			name, me.DisplayName, me.Kind)
	}

	pick := humans[0]
	if len(humans) > 1 {
		opts := make([]huh.Option[string], 0, len(humans))
		for _, n := range humans {
			opts = append(opts, huh.NewOption(personaLabel(n, actors[n]), n))
		}
		if err := huh.NewSelect[string]().
			Title("Sign as which human?").
			Description(fmt.Sprintf("Active persona %q is a %s — pick a human persona to sign with.", name, me.Kind)).
			Options(opts...).
			Value(&pick).
			WithKeyMap(backKeyMap()).
			Run(); err != nil {
			return nil, "", nil, err
		}
	}

	nc, err := clientForPersona(pick)
	if err != nil {
		return nil, "", nil, err
	}
	return nc, pick, actors[pick], nil
}

// scanHumanPersonas probes every configured persona (skipping the already
// known non-human active one) and returns the names that resolve to a human
// actor, sorted, alongside the actor each one signs as. Personas that error
// (bad key, unreachable host) are silently skipped.
func scanHumanPersonas(ctx context.Context, active string) ([]string, map[string]*api.Actor) {
	f, err := config.Load()
	if err != nil {
		return nil, nil
	}
	actors := map[string]*api.Actor{}
	for _, n := range f.Names() {
		if n == active {
			continue
		}
		cl, err := clientForPersona(n)
		if err != nil {
			continue
		}
		a, err := cl.Whoami(ctx)
		if err != nil || a.Kind != "human" {
			continue
		}
		actors[n] = a
	}
	names := make([]string, 0, len(actors))
	for n := range actors {
		names = append(names, n)
	}
	sort.Strings(names)
	return names, actors
}

func personaLabel(name string, a *api.Actor) string {
	if a == nil {
		return name
	}
	return fmt.Sprintf("%s — %s", name, a.DisplayName)
}

// chooseRun fetches recent runs and presents a picker. It falls back to a
// free-text id prompt when the server has no listing endpoint or returns
// nothing, so the command still works against older deployments.
func chooseRun(ctx context.Context, c *api.Client) (string, error) {
	var runs []api.RunSummary
	if err := ui.WithSpinner("loading recent runs", func() error {
		r, err := c.ListRuns(ctx, 50)
		runs = r
		return err
	}); err != nil {
		// Older server without GET /v1/runs: fall back to manual entry.
		return promptRunID()
	}
	if len(runs) == 0 {
		return promptRunID()
	}

	const manual = "\x00manual"
	opts := make([]huh.Option[string], 0, len(runs)+1)
	for _, r := range runs {
		opts = append(opts, huh.NewOption(runSummaryLabel(r), r.ID))
	}
	opts = append(opts, huh.NewOption("Enter a run id manually…", manual))

	pick := runs[0].ID
	if err := huh.NewSelect[string]().
		Title("Which run do you want to sign off?").
		Description("Most recent first. ✗ marks runs the gate still denies. esc to quit.").
		Options(opts...).
		Value(&pick).
		WithKeyMap(backKeyMap()).
		Run(); err != nil {
		return "", err
	}
	if pick == manual {
		return promptRunID()
	}
	return pick, nil
}

func promptRunID() (string, error) {
	runID := ""
	if err := huh.NewInput().
		Title("Which run do you want to sign off?").
		Description("Paste the run id from your handoff (e.g. 198041d8-…).").
		Value(&runID).
		Validate(nonEmpty).
		WithKeyMap(backKeyMap()).
		Run(); err != nil {
		return "", err
	}
	return strings.TrimSpace(runID), nil
}

// runSummaryLabel renders one run as a single picker line: gate glyph, subject,
// item progress, age, and a short id.
func runSummaryLabel(r api.RunSummary) string {
	glyph := "✓"
	if r.Decision != "allow" {
		glyph = "✗"
	}
	subj := r.Subject.Label
	if subj == "" {
		subj = r.Subject.ID
	}
	if subj == "" {
		subj = r.ChecklistTitle
	}
	short := r.ID
	if len(short) > 8 {
		short = short[:8]
	}
	return fmt.Sprintf("%s %s · %d/%d · %s · %s",
		glyph, subj, r.Summary.ItemsSatisfied, r.Summary.ItemsTotal,
		humanizeAge(r.CreatedAt), short)
}

// humanizeAge renders a timestamp as a compact relative age (e.g. "3h", "2d").
func humanizeAge(t time.Time) string {
	if t.IsZero() {
		return "?"
	}
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
}

// pickItems shows a pre-checked multi-select of the candidate items and
// returns the keys the user kept selected.
func pickItems(cands []api.RunItem) ([]string, error) {
	opts := make([]huh.Option[string], 0, len(cands))
	for _, it := range cands {
		label := it.Key
		if d := strings.TrimSpace(it.Description); d != "" {
			label += " — " + truncate(d, 80)
		}
		opts = append(opts, huh.NewOption(label, it.Key).Selected(true))
	}
	chosen := []string{}
	err := huh.NewMultiSelect[string]().
		Title("Which items are you ready to sign now?").
		Description("Space toggles, Enter confirms, esc goes back. Only sign for work you actually verified.").
		Options(opts...).
		Value(&chosen).
		WithKeyMap(backKeyMap()).
		Run()
	return chosen, err
}

// attestOneInteractive collects outcome/note/detail/evidence for a single item,
// asks for an explicit confirmation, then records the attestation. The bool is
// false (with nil error) when the user chose to skip at the confirm step.
func attestOneInteractive(ctx context.Context, c *api.Client, runID string, it api.RunItem, reason string) (bool, error) {
	outcome := "pass"
	var note, detail, evidence string
	confirm := false
	form := huh.NewForm(
		huh.NewGroup(
			huh.NewNote().Title("● "+it.Key).Description(itemBriefing(it, reason)),
			huh.NewSelect[string]().
				Title("Outcome").
				Description("pass and waived satisfy the gate; fail is recorded but never satisfies it.").
				Options(huh.NewOptions("pass", "fail", "waived")...).
				Value(&outcome),
			huh.NewInput().
				Title("Note").
				Description("One line, recorded with your signature.").
				Value(&note).
				Validate(nonEmpty),
			huh.NewText().
				Title("Detail (optional)").
				Description("Longer findings, preserved verbatim.").
				Value(&detail),
			huh.NewInput().
				Title("Evidence (optional)").
				Description("A URL, or key=value pairs, e.g. kind=hash,content_hash=sha256:…").
				Value(&evidence),
			huh.NewConfirm().
				Title("Record this signature?").
				Description("Append-only and permanent — it can never be edited or deleted.").
				Affirmative("Sign it").
				Negative("Skip").
				Value(&confirm),
		),
	).WithKeyMap(backKeyMap())
	if err := form.Run(); err != nil {
		return false, err
	}
	if !confirm {
		return false, nil
	}

	ev, err := parseEvidenceSpecs([]string{evidence})
	if err != nil {
		return false, err
	}

	var a *api.Attestation
	if err := ui.WithSpinner("recording "+it.Key, func() error {
		at, err := c.Attest(ctx, runID, api.AttestationCreate{
			ItemKey:  it.Key,
			Outcome:  outcome,
			Note:     strings.TrimSpace(note),
			Detail:   strings.TrimSpace(detail),
			Evidence: ev,
		})
		a = at
		return err
	}); err != nil {
		return false, err
	}
	printAttestation(it.Key, a)
	return true, nil
}

// ruleNeedsHuman reports whether a rule tree contains an
// `actor_with_kind: human` leaf anywhere — i.e. an item only a person can
// help satisfy. It walks the all_of / any_of / n_of combinators.
func ruleNeedsHuman(rule map[string]any) bool {
	for k, v := range rule {
		switch k {
		case "actor_with_kind":
			if s, ok := v.(string); ok && s == "human" {
				return true
			}
		case "all_of", "any_of":
			if arr, ok := v.([]any); ok {
				for _, e := range arr {
					if m, ok := e.(map[string]any); ok && ruleNeedsHuman(m) {
						return true
					}
				}
			}
		case "n_of":
			if m, ok := v.(map[string]any); ok {
				if of, ok := m["of"].([]any); ok {
					for _, e := range of {
						if em, ok := e.(map[string]any); ok && ruleNeedsHuman(em) {
							return true
						}
					}
				}
			}
		}
	}
	return false
}

// describeRule renders a rule tree as a short plain-English phrase for display.
func describeRule(rule map[string]any) string {
	for k, v := range rule {
		switch k {
		case "actor":
			return "anyone may sign"
		case "actor_with_kind":
			return fmt.Sprintf("a %v must sign", v)
		case "actor_with_role":
			return fmt.Sprintf("someone with role %q must sign", v)
		case "actor_is":
			return fmt.Sprintf("one specific actor (%v) must sign", v)
		case "all_of":
			return "all of — " + joinRules(v)
		case "any_of":
			return "any of — " + joinRules(v)
		case "n_of":
			if m, ok := v.(map[string]any); ok {
				return fmt.Sprintf("at least %v of — %s", m["count"], joinRules(m["of"]))
			}
		}
	}
	return "(custom rule)"
}

func joinRules(v any) string {
	arr, ok := v.([]any)
	if !ok {
		return "…"
	}
	parts := make([]string, 0, len(arr))
	for _, e := range arr {
		if m, ok := e.(map[string]any); ok {
			parts = append(parts, describeRule(m))
		}
	}
	return strings.Join(parts, "; ")
}

// backKeyMap binds esc to the form-level Quit so it aborts the current step from
// any field — including the very first one, where huh disables the per-field
// Prev (shift+tab) binding. The attest flow catches that abort (isBack) and
// re-shows the previous screen, giving esc consistent "go back" behaviour:
// item form → item list → run list → exit. shift+tab still steps between fields
// within a form, and ctrl+c still aborts.
func backKeyMap() *huh.KeyMap {
	km := huh.NewDefaultKeyMap()
	km.Quit.SetKeys("ctrl+c", "esc")
	km.Quit.SetHelp("esc", "back")
	return km
}

// itemBriefing renders the context a signer sees before attesting one item:
// the human-written description (wrapped) up top, then a plain-English summary
// of what the rule requires and the gate's current reason for it being unmet.
func itemBriefing(it api.RunItem, reason string) string {
	wrap := lipgloss.NewStyle().Width(76)
	var b strings.Builder
	if d := strings.TrimSpace(it.Description); d != "" {
		b.WriteString(wrap.Render(d))
		b.WriteString("\n\n")
	}
	b.WriteString("What this asserts: " + describeRule(it.Rule))
	if r := strings.TrimSpace(reason); r != "" {
		b.WriteString("\nGate status: " + r)
	}
	b.WriteString("\n\nshift+tab moves between fields · esc goes back to the item list.")
	return b.String()
}

// truncate shortens a string to at most n characters (collapsing newlines to
// spaces) and appends an ellipsis when it had to cut.
func truncate(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if len(s) <= n {
		return s
	}
	if n <= 1 {
		return s[:n]
	}
	return strings.TrimSpace(s[:n-1]) + "…"
}
