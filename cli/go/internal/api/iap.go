package api

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// ResolveIAPToken returns a Google-issued OIDC ID token used to satisfy
// Identity-Aware Proxy, or "" when IAP is not configured for the persona.
//
// Resolution order:
//  1. $GOVERNOR_IAP_TOKEN — a pre-minted token (CI / no-gcloud escape hatch).
//  2. if audience is set, shell out to the gcloud already on PATH:
//       gcloud auth print-identity-token --audiences=<aud> \
//         [--impersonate-service-account=<sa>] --include-email
//
// The token is sent in Authorization; IAP authorizes the request with it and
// strips the header before forwarding, so the Governor bearer token is sent
// in X-Governor-Authorization (which IAP forwards untouched) instead.
func ResolveIAPToken(audience, serviceAccount string) (string, error) {
	if t := strings.TrimSpace(os.Getenv("GOVERNOR_IAP_TOKEN")); t != "" {
		return t, nil
	}
	if audience == "" {
		return "", nil
	}
	args := []string{
		"auth", "print-identity-token",
		"--audiences=" + audience,
		"--include-email",
	}
	if serviceAccount != "" {
		args = append(args, "--impersonate-service-account="+serviceAccount)
	}
	out, err := exec.Command("gcloud", args...).Output()
	if err != nil {
		msg := err.Error()
		if ee, ok := err.(*exec.ExitError); ok && len(ee.Stderr) > 0 {
			msg = strings.TrimSpace(string(ee.Stderr))
		}
		return "", fmt.Errorf("mint IAP token via gcloud: %s\n"+
			"(set $GOVERNOR_IAP_TOKEN to supply one directly, or check that "+
			"gcloud is installed and you can impersonate %q)", msg, serviceAccount)
	}
	tok := strings.TrimSpace(string(out))
	if tok == "" {
		return "", fmt.Errorf("gcloud returned an empty IAP token")
	}
	return tok, nil
}
