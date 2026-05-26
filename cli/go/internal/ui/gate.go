package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/makemore/governor/cli/go/internal/api"
)

// RenderGate produces a multi-line, framed summary of a gate decision.
// The frame colour matches the decision so the result is recognisable at a
// glance even when log lines scroll past.
func RenderGate(g *api.GateDecision) string {
	header := OK.Render(CheckMark + " ALLOW")
	box := BoxAllow
	if g.Decision != "allow" {
		header = Bad.Render(Cross + " " + strings.ToUpper(g.Decision))
		box = BoxDeny
	}

	summary := Sub.Render(fmt.Sprintf("%d of %d items satisfied",
		g.Summary.ItemsSatisfied, g.Summary.ItemsTotal))

	keyW := 0
	for _, it := range g.Items {
		if len(it.Key) > keyW {
			keyW = len(it.Key)
		}
	}
	rows := make([]string, 0, len(g.Items))
	for _, it := range g.Items {
		mark, markStyle := CheckMark, OK
		if !it.Satisfied {
			mark, markStyle = Cross, Bad
		}
		reason := it.Reason
		if reason == "" {
			if it.Satisfied {
				reason = "rule satisfied"
			} else {
				reason = "rule not satisfied"
			}
		}
		rows = append(rows, fmt.Sprintf("%s  %s  %s",
			markStyle.Render(mark),
			Key.Render(padRight(it.Key, keyW)),
			Sub.Render(reason),
		))
	}

	body := lipgloss.JoinVertical(lipgloss.Left,
		header,
		summary,
		Sub.Render(strings.Repeat("─", maxLineWidth(rows, keyW+24))),
	)
	if len(rows) > 0 {
		body = lipgloss.JoinVertical(lipgloss.Left,
			body,
			lipgloss.JoinVertical(lipgloss.Left, rows...),
		)
	}
	return box.Render(body)
}

func padRight(s string, w int) string {
	if len(s) >= w {
		return s
	}
	return s + strings.Repeat(" ", w-len(s))
}

func maxLineWidth(lines []string, fallback int) int {
	w := fallback
	for _, l := range lines {
		if lipgloss.Width(l) > w {
			w = lipgloss.Width(l)
		}
	}
	return w
}
