package main

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"math/big"
	"time"

	httpcap "github.com/smartcontractkit/cre-sdk-go/capabilities/networking/http"
	"github.com/smartcontractkit/cre-sdk-go/cre"

	"github.com/hardpull/cre/workflow"
)

// Config is parsed from config.json at workflow init (docs/plan.md T-044).
type Config struct {
	// AuthorizedPullerKeys are EVM addresses (the Hardpull API's signer) allowed to invoke
	// this workflow's HTTP trigger. An empty list is valid for simulation only -- see
	// docs.chain.link/cre/guides/workflow/using-triggers/http-trigger.
	AuthorizedPullerKeys []string `json:"authorizedPullerKeys"`
	// WorkflowPrivateKeySecretID names the CRE secret holding this workflow's X25519 private
	// key. Furnishers seal records to the matching public key published in FurnisherRegistry.
	WorkflowPrivateKeySecretID string `json:"workflowPrivateKeySecretId"`
	WorkflowPublicKeyHex       string `json:"workflowPublicKeyHex"`
	// AttestationSignerSecretID names the CRE secret holding the secp256k1 key
	// VerdictAttestations.sol verifies against (see signing.go for why this is a single key).
	AttestationSignerSecretID string `json:"attestationSignerSecretId"`
}

// onPullRequest is the confidential handler: it runs inside the TEE (cre.TeeRuntime), decrypts
// and verifies furnished records, evaluates the stacking rules, and signs the verdict. This
// mirrors docs/architecture.md #2.2's INPUT/STEPS/OUTPUT exactly.
func onPullRequest(config *Config, runtime cre.TeeRuntime, payload *httpcap.Payload) (*signedVerdict, error) {
	logger := runtime.Logger()

	var req pullRequestPayload
	if err := json.Unmarshal(payload.Input, &req); err != nil {
		return nil, fmt.Errorf("invalid pull request payload: %w", err)
	}

	recipientPub, err := decodeHexKey32(config.WorkflowPublicKeyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid workflow public key: %w", err)
	}

	keySecret, err := runtime.GetSecret(&cre.SecretRequest{Id: config.WorkflowPrivateKeySecretID}).Await()
	if err != nil {
		return nil, fmt.Errorf("fetching workflow private key: %w", err)
	}
	recipientPriv, err := decodeHexKey32(keySecret.Value)
	if err != nil {
		return nil, fmt.Errorf("invalid workflow private key secret: %w", err)
	}

	records := make([]workflow.EncryptedRecord, 0, len(req.EncryptedRecords))
	for _, r := range req.EncryptedRecords {
		sealed, err := hexDecode(r.SealedBoxHex)
		if err != nil {
			logger.Warn("skipping record with invalid ciphertext hex", "furnisherId", r.FurnisherID)
			continue
		}
		commitmentBytes, err := hexDecode(r.CommitmentHex)
		if err != nil || len(commitmentBytes) != 32 {
			logger.Warn("skipping record with invalid commitment", "furnisherId", r.FurnisherID)
			continue
		}
		var commitment [32]byte
		copy(commitment[:], commitmentBytes)
		records = append(records, workflow.EncryptedRecord{
			FurnisherID: r.FurnisherID,
			Ciphertext:  sealed,
			Commitment:  commitment,
		})
	}

	decrypt := func(ciphertext []byte) ([]byte, error) {
		return workflow.OpenAnonymous(ciphertext, recipientPub, recipientPriv)
	}

	positions, hadTampering, err := workflow.VerifyAndDecrypt(records, decrypt, decodePositionJSON)
	if err != nil {
		return nil, fmt.Errorf("verifying furnished records: %w", err)
	}

	for _, p := range req.PublicPositions {
		pos, err := p.toPosition()
		if err != nil {
			logger.Warn("skipping malformed public position", "sourceId", p.SourceID)
			continue
		}
		positions = append(positions, pos)
	}

	inquiries := make([]workflow.Inquiry, 0, len(req.Inquiries))
	for _, i := range req.Inquiries {
		occurredAt, err := time.Parse(time.RFC3339, i.OccurredAt)
		if err != nil {
			continue
		}
		inquiries = append(inquiries, workflow.Inquiry{PullerHash: i.PullerHash, OccurredAt: occurredAt})
	}

	proposedPrincipal, ok := new(big.Int).SetString(req.ProposedPrincipal, 10)
	if !ok {
		return nil, fmt.Errorf("invalid proposedPrincipal: %q", req.ProposedPrincipal)
	}

	thresholds := workflow.DefaultThresholds()
	if req.Thresholds != nil {
		thresholds = req.Thresholds.toThresholds()
	}

	verdict := workflow.Evaluate(workflow.VerdictInput{
		SubjectID:           req.SubjectID,
		ProposedPrincipal:   proposedPrincipal,
		Positions:           positions,
		Inquiries:           inquiries,
		Thresholds:          thresholds,
		Now:                 runtime.Now(),
		HasIntegrityWarning: hadTampering,
	})

	signerSecret, err := runtime.GetSecret(&cre.SecretRequest{Id: config.AttestationSignerSecretID}).Await()
	if err != nil {
		return nil, fmt.Errorf("fetching attestation signer key: %w", err)
	}

	attestation, err := signVerdict(verdict, signerSecret.Value)
	if err != nil {
		return nil, fmt.Errorf("signing verdict: %w", err)
	}

	return newSignedVerdict(verdict, attestation), nil
}

// InitWorkflow is the required CRE entry point: it registers the confidential HTTP-triggered
// handler. HandlerInTee (not Handler) is what makes this a Confidential Workflow -- the whole
// callback runs inside a TEE (docs/architecture.md #2.2, docs/plan.md T-044).
func InitWorkflow(config *Config, logger *slog.Logger, secretsProvider cre.SecretsProvider) (cre.Workflow[*Config], error) {
	// An empty key list means the trigger authorizes nobody in particular, which is what
	// simulation needs and exactly what production must not ship with. Warn rather than fail:
	// failing here would make `cre workflow simulate` impossible to run out of the box.
	if len(config.AuthorizedPullerKeys) == 0 && logger != nil {
		logger.Warn("authorizedPullerKeys is empty -- fine for simulation, but set the Hardpull API's signer address before deploying")
	}

	keys := make([]*httpcap.AuthorizedKey, 0, len(config.AuthorizedPullerKeys))
	for _, k := range config.AuthorizedPullerKeys {
		keys = append(keys, &httpcap.AuthorizedKey{Type: httpcap.KeyType_KEY_TYPE_ECDSA_EVM, PublicKey: k})
	}

	return cre.Workflow[*Config]{
		cre.HandlerInTee(
			httpcap.Trigger(&httpcap.Config{AuthorizedKeys: keys}),
			onPullRequest,
			cre.AnyTee{},
		),
	}, nil
}
