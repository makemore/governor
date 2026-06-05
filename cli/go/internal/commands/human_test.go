package commands

import (
	"testing"
	"time"

	"github.com/makemore/governor/cli/go/internal/api"
)

func TestRunSummaryLabel(t *testing.T) {
	now := time.Now()
	cases := []struct {
		name string
		r    api.RunSummary
		want string
	}{
		{
			name: "allow uses tick and label, truncates id",
			r: api.RunSummary{
				ID:        "198041d8-cafe-4000-9000-000000000000",
				Subject:   api.RunSubject{Label: "release v2.3.1"},
				CreatedAt: now.Add(-3 * time.Hour),
				Decision:  "allow",
				Summary:   api.GateSummary{ItemsTotal: 7, ItemsSatisfied: 7},
			},
			want: "✓ release v2.3.1 · 7/7 · 3h · 198041d8",
		},
		{
			name: "non-allow uses cross and falls back to subject id",
			r: api.RunSummary{
				ID:        "a1b2c3d4",
				Subject:   api.RunSubject{ID: "deploy-prod"},
				CreatedAt: now.Add(-26 * time.Hour),
				Decision:  "deny",
				Summary:   api.GateSummary{ItemsTotal: 6, ItemsSatisfied: 4},
			},
			want: "✗ deploy-prod · 4/6 · 1d · a1b2c3d4",
		},
		{
			name: "falls back to checklist title when subject empty",
			r: api.RunSummary{
				ID:             "short",
				ChecklistTitle: "baseline",
				CreatedAt:      now.Add(-30 * time.Second),
				Decision:       "allow",
				Summary:        api.GateSummary{ItemsTotal: 2, ItemsSatisfied: 1},
			},
			want: "✓ baseline · 1/2 · just now · short",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := runSummaryLabel(tc.r); got != tc.want {
				t.Errorf("runSummaryLabel() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestHumanizeAge(t *testing.T) {
	cases := []struct {
		name string
		in   time.Time
		want string
	}{
		{"zero", time.Time{}, "?"},
		{"seconds", time.Now().Add(-10 * time.Second), "just now"},
		{"minutes", time.Now().Add(-5 * time.Minute), "5m"},
		{"hours", time.Now().Add(-3 * time.Hour), "3h"},
		{"days", time.Now().Add(-48 * time.Hour), "2d"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := humanizeAge(tc.in); got != tc.want {
				t.Errorf("humanizeAge() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestRuleNeedsHuman(t *testing.T) {
	cases := []struct {
		name string
		rule map[string]any
		want bool
	}{
		{"direct human leaf", map[string]any{"actor_with_kind": "human"}, true},
		{"non-human leaf", map[string]any{"actor_with_kind": "agent"}, false},
		{"open actor", map[string]any{"actor": true}, false},
		{"empty", map[string]any{}, false},
		{
			"human nested in all_of",
			map[string]any{"all_of": []any{
				map[string]any{"actor_with_role": "owner"},
				map[string]any{"actor_with_kind": "human"},
			}},
			true,
		},
		{
			"human nested in any_of",
			map[string]any{"any_of": []any{
				map[string]any{"actor_with_kind": "agent"},
			}},
			false,
		},
		{
			"human nested in n_of",
			map[string]any{"n_of": map[string]any{
				"count": 1,
				"of":    []any{map[string]any{"actor_with_kind": "human"}},
			}},
			true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ruleNeedsHuman(tc.rule); got != tc.want {
				t.Errorf("ruleNeedsHuman() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestDescribeRule(t *testing.T) {
	cases := []struct {
		name string
		rule map[string]any
		want string
	}{
		{"open", map[string]any{"actor": true}, "anyone may sign"},
		{"kind", map[string]any{"actor_with_kind": "human"}, "a human must sign"},
		{"role", map[string]any{"actor_with_role": "owner"}, `someone with role "owner" must sign`},
		{"is", map[string]any{"actor_is": "abc123"}, "one specific actor (abc123) must sign"},
		{"unknown", map[string]any{"mystery": 1}, "(custom rule)"},
		{
			"all_of",
			map[string]any{"all_of": []any{map[string]any{"actor": true}}},
			"all of — anyone may sign",
		},
		{
			"n_of",
			map[string]any{"n_of": map[string]any{
				"count": 2,
				"of":    []any{map[string]any{"actor_with_kind": "human"}},
			}},
			"at least 2 of — a human must sign",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := describeRule(tc.rule); got != tc.want {
				t.Errorf("describeRule() = %q, want %q", got, tc.want)
			}
		})
	}
}
