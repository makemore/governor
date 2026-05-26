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

type RunItem struct {
	Key          string         `json:"key"`
	Description  string         `json:"description,omitempty"`
	Rule         map[string]any `json:"rule"`
	Attestations []Attestation  `json:"attestations"`
}

type AttestationCreate struct {
	ItemKey string `json:"item_key"`
	Note    string `json:"note,omitempty"`
}

type Attestation struct {
	ID         string    `json:"id"`
	RunID      string    `json:"run_id"`
	ItemKey    string    `json:"item_key"`
	Actor      ActorRef  `json:"actor"`
	AttestedAt time.Time `json:"attested_at"`
	Note       string    `json:"note,omitempty"`
}

type ActorRef struct {
	ID          string `json:"id"`
	Kind        string `json:"kind"`
	DisplayName string `json:"display_name"`
}

type GateDecision struct {
	Decision string        `json:"decision"`
	Summary  GateSummary   `json:"summary"`
	Items    []GateItem    `json:"items"`
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
