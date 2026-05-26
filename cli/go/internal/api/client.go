package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const userAgent = "gov-cli/0.1.0 (+https://github.com/makemore/governor)"

type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

func New(baseURL, token string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Token:   token,
		HTTP:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) do(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		buf, err := json.Marshal(in)
		if err != nil {
			return fmt.Errorf("encode request: %w", err)
		}
		body = bytes.NewReader(buf)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json")
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		apiErr := &APIError{Status: resp.StatusCode}
		_ = json.Unmarshal(raw, apiErr)
		if apiErr.Code == "" {
			apiErr.Code = fmt.Sprintf("http-%d", resp.StatusCode)
		}
		if apiErr.Message == "" && len(raw) > 0 && len(raw) < 512 {
			apiErr.Message = strings.TrimSpace(string(raw))
		}
		return apiErr
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}

func (c *Client) Whoami(ctx context.Context) (*Actor, error) {
	var a Actor
	if err := c.do(ctx, http.MethodGet, "/v1/whoami", nil, &a); err != nil {
		return nil, err
	}
	return &a, nil
}

func (c *Client) CreateActor(ctx context.Context, in ActorCreate) (*Actor, error) {
	var a Actor
	if err := c.do(ctx, http.MethodPost, "/v1/actors", in, &a); err != nil {
		return nil, err
	}
	return &a, nil
}

func (c *Client) MintToken(ctx context.Context, actorID string) (*TokenMint, error) {
	var t TokenMint
	if err := c.do(ctx, http.MethodPost, "/v1/actors/"+actorID+"/tokens", nil, &t); err != nil {
		return nil, err
	}
	return &t, nil
}

func (c *Client) CreateRun(ctx context.Context, in RunCreate) (*Run, error) {
	var r Run
	if err := c.do(ctx, http.MethodPost, "/v1/runs", in, &r); err != nil {
		return nil, err
	}
	return &r, nil
}

func (c *Client) GetRun(ctx context.Context, id string) (*Run, error) {
	var r Run
	if err := c.do(ctx, http.MethodGet, "/v1/runs/"+id, nil, &r); err != nil {
		return nil, err
	}
	return &r, nil
}

func (c *Client) Attest(ctx context.Context, runID string, in AttestationCreate) (*Attestation, error) {
	var a Attestation
	if err := c.do(ctx, http.MethodPost, "/v1/runs/"+runID+"/attestations", in, &a); err != nil {
		return nil, err
	}
	return &a, nil
}

func (c *Client) Gate(ctx context.Context, runID string) (*GateDecision, error) {
	var g GateDecision
	if err := c.do(ctx, http.MethodGet, "/v1/runs/"+runID+"/gate", nil, &g); err != nil {
		return nil, err
	}
	return &g, nil
}
