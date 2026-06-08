package api

import "time"

type Actor struct {
	ID          string    `json:"id"`
	Kind        string    `json:"kind"`
	DisplayName string    `json:"display_name"`
	Roles       []string  `json:"roles"`
	CreatedAt   time.Time `json:"created_at"`
}

type ActorCreate struct {
	Kind        string   `json:"kind"`
	DisplayName string   `json:"display_name"`
	Roles       []string `json:"roles,omitempty"`
}

type TokenMint struct {
	Token     string    `json:"token"`
	ActorID   string    `json:"actor_id"`
	CreatedAt time.Time `json:"created_at"`
}

type ChecklistItemDef struct {
	Key         string         `json:"key"`
	Description string         `json:"description,omitempty"`
	Rule        map[string]any `json:"rule"`
}

type ChecklistDef struct {
	Key   string             `json:"key"`
	Title string             `json:"title,omitempty"`
	Items []ChecklistItemDef `json:"items"`
}

type RunSubject struct {
	ID    string `json:"id"`
	Label string `json:"label,omitempty"`
	Kind  string `json:"kind,omitempty"`
}

type RunCreate struct {
	Checklist ChecklistDef `json:"checklist"`
	Subject   RunSubject   `json:"subject"`
}

type Run struct {
	ID        string     `json:"id"`
	Subject   RunSubject `json:"subject"`
	CreatedAt time.Time  `json:"created_at"`
	Items     []RunItem  `json:"items"`
}

// RunSummary is a lightweight run entry returned by GET /v1/runs, carrying
// the gate decision and item counts so a picker can show progress without a
// follow-up request per run.
type RunSummary struct {
	ID             string      `json:"id"`
	Subject        RunSubject  `json:"subject"`
	ChecklistTitle string      `json:"checklist_title,omitempty"`
	CreatedAt      time.Time   `json:"created_at"`
	Decision       string      `json:"decision"`
	Summary        GateSummary `json:"summary"`
}

// RunListOptions controls a GET /v1/runs request: page size, page offset, and
// a substring search over subject id/label and checklist title.
type RunListOptions struct {
	Limit  int
	Offset int
	Search string
}

// RunListPage is the paginated response from GET /v1/runs. Total is the count
// of matching runs ignoring Limit/Offset.
type RunListPage struct {
	Runs   []RunSummary `json:"runs"`
	Total  int          `json:"total"`
	Limit  int          `json:"limit"`
	Offset int          `json:"offset"`
}

type RunItem struct {
	Key          string         `json:"key"`
	Description  string         `json:"description,omitempty"`
	Rule         map[string]any `json:"rule"`
	Attestations []Attestation  `json:"attestations"`
}

// Evidence is one structured piece of proof attached to an attestation.
// Kind is one of "url", "hash", or "inline"; the other fields are populated
// according to the kind.
type Evidence struct {
	Kind           string         `json:"kind"`
	URL            string         `json:"url,omitempty"`
	ContentHash    string         `json:"content_hash,omitempty"`
	MediaType      string         `json:"media_type,omitempty"`
	InlineMetadata map[string]any `json:"inline_metadata,omitempty"`
}

type AttestationCreate struct {
	ItemKey  string     `json:"item_key"`
	Outcome  string     `json:"outcome,omitempty"`
	Severity string     `json:"severity,omitempty"`
	Note     string     `json:"note,omitempty"`
	Detail   string     `json:"detail,omitempty"`
	Evidence []Evidence `json:"evidence,omitempty"`
}

type Attestation struct {
	ID         string     `json:"id"`
	RunID      string     `json:"run_id"`
	ItemKey    string     `json:"item_key"`
	Actor      ActorRef   `json:"actor"`
	AttestedAt time.Time  `json:"attested_at"`
	Outcome    string     `json:"outcome,omitempty"`
	Severity   string     `json:"severity,omitempty"`
	Note       string     `json:"note,omitempty"`
	Detail     string     `json:"detail,omitempty"`
	Evidence   []Evidence `json:"evidence,omitempty"`
}

type ActorRef struct {
	ID          string `json:"id"`
	Kind        string `json:"kind"`
	DisplayName string `json:"display_name"`
}

type GateDecision struct {
	Decision string      `json:"decision"`
	Summary  GateSummary `json:"summary"`
	Items    []GateItem  `json:"items"`
}

type GateSummary struct {
	ItemsTotal     int `json:"items_total"`
	ItemsSatisfied int `json:"items_satisfied"`
}

type GateItem struct {
	Key       string `json:"key"`
	Satisfied bool   `json:"satisfied"`
	Reason    string `json:"reason,omitempty"`
}

type APIError struct {
	Status  int            `json:"-"`
	Code    string         `json:"error"`
	Message string         `json:"message,omitempty"`
	Detail  map[string]any `json:"detail,omitempty"`
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return e.Code + ": " + e.Message
	}
	return e.Code
}
