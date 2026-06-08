package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const userAgent = "gov-cli/0.1.0 (+https://github.com/makemore/governor)"

type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client

	// ProxyToken, when set, is the IAP OIDC token sent in Authorization to
	// pass IAP (which strips it); the Governor bearer then travels in
	// X-Governor-Authorization. See do() for the exact placement.
	// IAPAudience/IAPServiceAccount are retained so derived personas (e.g.
	// `gov tokens mint --save-as`) can inherit the same IAP configuration.
	ProxyToken        string
	IAPAudience       string
	IAPServiceAccount string
}

func New(baseURL, token string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Token:   token,
		HTTP:    &http.Client{Timeout: 30 * time.Second},
	}
}

// NormalizeBaseURL upgrades a scheme-less base URL to https:// and rejects
// plaintext. A bare host such as "gov.rminds.app" becomes
// "https://gov.rminds.app"; an explicit http:// is refused because Governor
// bearer tokens must never traverse an unencrypted connection. The trailing
// slash is trimmed so callers can append paths directly.
func NormalizeBaseURL(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", fmt.Errorf("base URL is empty")
	}
	switch {
	case strings.HasPrefix(strings.ToLower(s), "https://"):
	case strings.HasPrefix(strings.ToLower(s), "http://"):
		return "", fmt.Errorf("refusing plaintext base URL %q: use https://", raw)
	case strings.Contains(s, "://"):
		scheme := s[:strings.Index(s, "://")]
		return "", fmt.Errorf("unsupported URL scheme %q: only https is allowed", scheme)
	default:
		s = "https://" + s
	}
	return strings.TrimRight(s, "/"), nil
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
	// Header placement depends on whether the deployment is behind IAP.
	//
	// IAP-for-Cloud-Run consumes the Authorization header for its own OIDC
	// check and strips it before the request reaches the app (it ignores
	// Proxy-Authorization entirely). So when an IAP token is present it goes
	// in Authorization, and the Governor bearer travels in a header IAP
	// forwards untouched (X-Governor-Authorization). With no IAP token the
	// Governor bearer uses Authorization as normal.
	if c.ProxyToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.ProxyToken)
		if c.Token != "" {
			req.Header.Set("X-Governor-Authorization", "Bearer "+c.Token)
		}
	} else if c.Token != "" {
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

// ListRuns returns recent runs (most recent first). A limit <= 0 lets the
// server apply its default.
func (c *Client) ListRuns(ctx context.Context, limit int) ([]RunSummary, error) {
	page, err := c.ListRunsPage(ctx, RunListOptions{Limit: limit})
	if err != nil {
		return nil, err
	}
	return page.Runs, nil
}

// ListRunsPage returns a page of runs (most recent first) plus the total count
// of matching runs, supporting pagination (Offset) and a substring Search over
// subject id/label and checklist title. A Limit <= 0 lets the server apply its
// default.
func (c *Client) ListRunsPage(ctx context.Context, opts RunListOptions) (*RunListPage, error) {
	q := url.Values{}
	if opts.Limit > 0 {
		q.Set("limit", strconv.Itoa(opts.Limit))
	}
	if opts.Offset > 0 {
		q.Set("offset", strconv.Itoa(opts.Offset))
	}
	if s := strings.TrimSpace(opts.Search); s != "" {
		q.Set("q", s)
	}
	path := "/v1/runs"
	if enc := q.Encode(); enc != "" {
		path += "?" + enc
	}
	var page RunListPage
	if err := c.do(ctx, http.MethodGet, path, nil, &page); err != nil {
		return nil, err
	}
	return &page, nil
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

// RawDoc is a non-JSON document fetched from the server (e.g. a Markdown or
// HTML report). Filename is the server's suggested name parsed from the
// Content-Disposition header; it is empty when the server sends none.
type RawDoc struct {
	Body        []byte
	ContentType string
	Filename    string
}

// GetRaw fetches a document at an absolute server path (e.g. "/report.md"),
// authenticating exactly like do() — IAP ProxyToken in Authorization with the
// Governor bearer in X-Governor-Authorization, or the bearer in Authorization
// when there is no IAP in front.
//
// Auto-redirects are disabled so an IAP/identity-provider sign-in bounce is
// caught and reported as an auth error rather than silently returning a Google
// login page with a 200 — the exact trap a naive curl falls into.
func (c *Client) GetRaw(ctx context.Context, path, accept string) (*RawDoc, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	if c.ProxyToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.ProxyToken)
		if c.Token != "" {
			req.Header.Set("X-Governor-Authorization", "Bearer "+c.Token)
		}
	} else if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	// Copy the client so we can stop redirects for this request only.
	cl := *c.HTTP
	cl.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}
	resp, err := cl.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	if loc := resp.Header.Get("Location"); resp.StatusCode >= 300 && resp.StatusCode < 400 && loc != "" {
		if isAuthRedirect(loc) {
			return nil, fmt.Errorf(
				"request was redirected to a sign-in page (%s) — the persona's IAP token is missing or invalid; check `iap_audience`/`iap_service_account` and that you can impersonate the service account",
				authHost(loc))
		}
		return nil, fmt.Errorf("unexpected redirect to %s (status %d)", loc, resp.StatusCode)
	}

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
		return nil, apiErr
	}
	return &RawDoc{
		Body:        raw,
		ContentType: resp.Header.Get("Content-Type"),
		Filename:    filenameFromDisposition(resp.Header.Get("Content-Disposition")),
	}, nil
}

// filenameFromDisposition extracts the filename from a Content-Disposition
// header, returning "" when absent or unparseable.
func filenameFromDisposition(cd string) string {
	if cd == "" {
		return ""
	}
	if _, params, err := mime.ParseMediaType(cd); err == nil {
		if fn := params["filename"]; fn != "" {
			return fn
		}
	}
	return ""
}

// isAuthRedirect reports whether a Location points at a known identity
// provider sign-in surface (Google account chooser / IAP refresh).
func isAuthRedirect(loc string) bool {
	h := authHost(loc)
	return strings.Contains(h, "accounts.google.com") ||
		strings.Contains(h, "iap.googleapis.com") ||
		strings.HasSuffix(h, ".cloud.google.com") ||
		strings.Contains(loc, "/_gcp_iap/")
}

func authHost(loc string) string {
	if u, err := url.Parse(loc); err == nil {
		return strings.ToLower(u.Host)
	}
	return loc
}
