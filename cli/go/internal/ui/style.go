package ui

import "github.com/charmbracelet/lipgloss"

// Palette is deliberately small. Governor is about hard yes/no decisions, so
// the colour vocabulary is: brand for headers, success/danger for the gate,
// muted for chrome, warn for "this is a footgun".
var (
	Brand   = lipgloss.Color("#7C5CFF")
	Success = lipgloss.Color("#22C55E")
	Danger  = lipgloss.Color("#EF4444")
	Warn    = lipgloss.Color("#F59E0B")
	Muted   = lipgloss.Color("#6B7280")
	Fg      = lipgloss.Color("#E5E7EB")
)

var (
	Title = lipgloss.NewStyle().
		Bold(true).
		Foreground(Brand).
		MarginBottom(1)

	Sub = lipgloss.NewStyle().Foreground(Muted)

	OK   = lipgloss.NewStyle().Foreground(Success).Bold(true)
	Bad  = lipgloss.NewStyle().Foreground(Danger).Bold(true)
	Note = lipgloss.NewStyle().Foreground(Warn).Bold(true)
	Key  = lipgloss.NewStyle().Foreground(Fg).Bold(true)

	Box = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(Muted).
		Padding(0, 1)

	BoxAllow = Box.BorderForeground(Success)
	BoxDeny  = Box.BorderForeground(Danger)
)

// CheckMark / Cross are kept as separate constants so the gate renderer
// stays a one-line lookup.
const (
	CheckMark = "✓"
	Cross     = "✗"
)
