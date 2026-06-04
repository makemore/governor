package commands

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/makemore/governor/cli/go/internal/api"
	"github.com/makemore/governor/cli/go/internal/ui"
	"github.com/spf13/cobra"
)

func newReportCmd() *cobra.Command {
	var (
		format  string
		history string
		out     string
		chrome  string
	)
	c := &cobra.Command{
		Use:   "report [run-id]",
		Short: "Download a signed-off report (md/html/pdf) for one run or all runs",
		Long: "Fetches a Governor report using the active persona — including its IAP\n" +
			"token — so authenticated, IAP-protected deployments work with no manual\n" +
			"token minting or redirect handling.\n\n" +
			"With a run-id, the report covers that single run; without one, it covers\n" +
			"all recent runs. Choose the whole audit trail or just the clean record\n" +
			"with --history, and the format with -f.\n\n" +
			"  gov report <run-id>                 # full-chain PDF for one run\n" +
			"  gov report <run-id> --history passing\n" +
			"  gov report -f md <run-id> -o -      # markdown to stdout\n" +
			"  gov report                          # everything, as one PDF\n\n" +
			"PDF is rendered locally via headless Chrome/Chromium, auto-detected on\n" +
			"PATH (override with --chrome or $GOV_CHROME).",
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if format != "md" && format != "html" && format != "pdf" {
				return fmt.Errorf("invalid -f %q: want md, html, or pdf", format)
			}
			if history != "full" && history != "passing" {
				return fmt.Errorf("invalid --history %q: want full or passing", history)
			}
			runID := ""
			if len(args) == 1 {
				runID = args[0]
			}
			return runWith(func(ctx context.Context, c *api.Client) error {
				// PDF is HTML rendered locally, so fetch HTML for it.
				wire := format
				if format == "pdf" {
					wire = "html"
				}
				path, accept := reportRequest(runID, wire, history)

				var doc *api.RawDoc
				if err := ui.WithSpinner("fetching report", func() error {
					d, err := c.GetRaw(ctx, path, accept)
					if err != nil {
						return err
					}
					doc = d
					return nil
				}); err != nil {
					return err
				}

				name := doc.Filename
				if name == "" {
					name = fallbackReportName(runID, format, history)
				} else if format == "pdf" {
					name = swapExt(name, "pdf")
				}

				if format == "pdf" {
					return writePDF(doc.Body, chrome, out, name)
				}
				return writeDoc(doc.Body, out, name)
			})
		},
	}
	c.Flags().StringVarP(&format, "format", "f", "pdf", "output format: md, html, or pdf")
	c.Flags().StringVar(&history, "history", "full",
		"full = whole attestation chain; passing = pass/waived only")
	c.Flags().StringVarP(&out, "out", "o", "",
		"output file ('-' for stdout, md/html only); defaults to the report's own name")
	c.Flags().StringVar(&chrome, "chrome", "",
		"path to a Chrome/Chromium binary for PDF (else $GOV_CHROME or PATH)")
	return c
}

// reportRequest builds the server path and Accept header for a report.
func reportRequest(runID, format, history string) (path, accept string) {
	switch {
	case runID != "" && format == "md":
		path, accept = "/r/"+runID+"/report.md", "text/markdown"
	case runID != "":
		path, accept = "/r/"+runID+"/report", "text/html"
	case format == "md":
		path, accept = "/report.md", "text/markdown"
	default:
		path, accept = "/report", "text/html"
	}
	if history == "passing" {
		path += "?history=passing"
	}
	return path, accept
}

// fallbackReportName is used when the server sends no Content-Disposition
// (the HTML routes). It mirrors the server's naming for consistency.
func fallbackReportName(runID, format, history string) string {
	suffix := ""
	if history == "passing" {
		suffix = "-passing"
	}
	scope := "full"
	if runID != "" {
		scope = runID
	}
	return fmt.Sprintf("governor-%s-report%s.%s", scope, suffix, format)
}

// writeDoc writes a text document to stdout ('-') or a file, announcing the
// path on stderr so stdout stays clean for piping.
func writeDoc(body []byte, out, name string) error {
	if out == "-" {
		_, err := os.Stdout.Write(body)
		return err
	}
	dest := out
	if dest == "" {
		dest = name
	}
	if err := os.WriteFile(dest, body, 0o644); err != nil {
		return err
	}
	fmt.Fprintln(os.Stderr, ui.OK.Render("✓ wrote ")+dest+
		ui.Sub.Render(fmt.Sprintf("  (%d bytes)", len(body))))
	return nil
}

// writePDF renders HTML to a PDF locally using headless Chrome/Chromium,
// sparing the agent the temp-file + browser-flag dance. out overrides name;
// '-' (stdout) is rejected because the renderer must write to a real path.
func writePDF(html []byte, chrome, out, name string) error {
	if out == "-" {
		return fmt.Errorf("cannot write a PDF to stdout; use -o <file> or omit -o")
	}
	dest := out
	if dest == "" {
		dest = name
	}
	bin, err := findChrome(chrome)
	if err != nil {
		return err
	}

	tmp, err := os.CreateTemp("", "gov-report-*.html")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(html); err != nil {
		tmp.Close()
		return err
	}
	tmp.Close()

	absDest, err := filepath.Abs(dest)
	if err != nil {
		return err
	}
	args := []string{
		"--headless", "--disable-gpu", "--no-sandbox",
		"--no-pdf-header-footer",
		"--print-to-pdf=" + absDest,
		"file://" + tmp.Name(),
	}
	var run func() error
	run = func() error {
		cmd := exec.Command(bin, args...)
		cmd.Stderr = nil
		cmd.Stdout = nil
		return cmd.Run()
	}
	if err := ui.WithSpinner("rendering pdf", run); err != nil {
		return fmt.Errorf("headless Chrome failed (%s): %w", bin, err)
	}
	fi, err := os.Stat(absDest)
	if err != nil || fi.Size() == 0 {
		return fmt.Errorf("Chrome produced no PDF at %s", dest)
	}
	fmt.Fprintln(os.Stderr, ui.OK.Render("✓ wrote ")+dest+
		ui.Sub.Render(fmt.Sprintf("  (%d bytes, via %s)", fi.Size(), filepath.Base(bin))))
	return nil
}

// findChrome locates a Chrome/Chromium binary: explicit flag, then
// $GOV_CHROME, then PATH, then well-known install locations.
func findChrome(explicit string) (string, error) {
	cands := []string{}
	if explicit != "" {
		cands = append(cands, explicit)
	}
	if env := os.Getenv("GOV_CHROME"); env != "" {
		cands = append(cands, env)
	}
	cands = append(cands,
		"google-chrome", "google-chrome-stable", "chromium",
		"chromium-browser", "chrome", "msedge",
	)
	if runtime.GOOS == "darwin" {
		cands = append(cands,
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		)
	}
	for _, c := range cands {
		if strings.ContainsAny(c, "/\\") {
			if fi, err := os.Stat(c); err == nil && !fi.IsDir() {
				return c, nil
			}
			continue
		}
		if p, err := exec.LookPath(c); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf(
		"no Chrome/Chromium found for PDF rendering; install Chrome, set $GOV_CHROME, " +
			"or pass --chrome <path> (or fetch -f html and convert it yourself)")
}

// swapExt replaces a filename's extension with ext (no leading dot).
func swapExt(name, ext string) string {
	old := filepath.Ext(name)
	return strings.TrimSuffix(name, old) + "." + ext
}
