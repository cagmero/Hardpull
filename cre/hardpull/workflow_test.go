package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/nacl/box"

	httpcap "github.com/smartcontractkit/cre-sdk-go/capabilities/networking/http"
	"github.com/smartcontractkit/cre-sdk-go/cre"
	"github.com/smartcontractkit/cre-sdk-go/cre/testutils"

	"github.com/hardpull/cre/workflow"
)

// These tests exercise the real confidential handler through the SDK's TeeRuntime harness --
// GetSecret, decryption, commitment verification, rule evaluation and signing all run exactly
// as they do in the enclave. That is what makes them evidence for docs/plan.md T-011
// ("plaintext never appears in any log or return value") and T-013 ("signature verifiable
// externally") rather than tests of ../workflow's logic in isolation.

const (
	testSubjectID = "0x1122334455667788990011223344556677889900112233445566778899001122"
	// secretPosition is the plaintext principal; it must never surface in a verdict or a log.
	secretPosition = "987654321"
)

type testKeys struct {
	x25519Pub  *[32]byte
	x25519Priv *[32]byte
	signerHex  string
	signerAddr string
}

func newTestKeys(t *testing.T) testKeys {
	t.Helper()

	pub, priv, err := box.GenerateKey(rand.Reader)
	require.NoError(t, err)

	signer, err := crypto.GenerateKey()
	require.NoError(t, err)

	return testKeys{
		x25519Pub:  pub,
		x25519Priv: priv,
		signerHex:  hex.EncodeToString(crypto.FromECDSA(signer)),
		signerAddr: crypto.PubkeyToAddress(signer.PublicKey).Hex(),
	}
}

func (k testKeys) config() *Config {
	return &Config{
		AuthorizedPullerKeys:       []string{},
		WorkflowPrivateKeySecretID: "WORKFLOW_X25519_PRIVATE_KEY",
		WorkflowPublicKeyHex:       hex.EncodeToString(k.x25519Pub[:]),
		AttestationSignerSecretID:  "ATTESTATION_SIGNER_KEY",
	}
}

func (k testKeys) secrets() testutils.Secrets {
	return testutils.Secrets{
		cre.DefaultSecretNamespace: {
			"WORKFLOW_X25519_PRIVATE_KEY": hex.EncodeToString(k.x25519Priv[:]),
			"ATTESTATION_SIGNER_KEY":      k.signerHex,
		},
	}
}

// sealRecord encrypts a position record to the workflow public key exactly as a furnisher
// would, and returns the ciphertext plus its keccak256 commitment.
func sealRecord(t *testing.T, k testKeys, principal string, originatedAt time.Time, status string) (string, string) {
	t.Helper()

	plaintext, err := json.Marshal(map[string]string{
		"principal":    principal,
		"currency":     "USD",
		"originatedAt": originatedAt.Format(time.RFC3339),
		"status":       status,
	})
	require.NoError(t, err)

	sealed, err := workflow.SealAnonymous(plaintext, k.x25519Pub)
	require.NoError(t, err)

	return hex.EncodeToString(sealed), hex.EncodeToString(crypto.Keccak256(sealed))
}

func payload(t *testing.T, req pullRequestPayload) *httpcap.Payload {
	t.Helper()
	raw, err := json.Marshal(req)
	require.NoError(t, err)
	return &httpcap.Payload{Input: raw}
}

func TestOnPullRequest_DecryptsSealedRecordAndSignsVerdict(t *testing.T) {
	k := newTestKeys(t)
	runtime := testutils.NewTeeRuntime(t, k.secrets())

	sealed, commitment := sealRecord(t, k, secretPosition, time.Now().Add(-90*24*time.Hour), "ACTIVE")

	result, err := onPullRequest(k.config(), runtime, payload(t, pullRequestPayload{
		SubjectID:         testSubjectID,
		ProposedPrincipal: "1000",
		EncryptedRecords: []encryptedRecordWire{
			{FurnisherID: "0xfurnisher-a", SealedBoxHex: sealed, CommitmentHex: commitment},
		},
	}))
	require.NoError(t, err)

	// The record was genuinely opened inside the handler: a sealed box that never decrypted
	// would have produced INSUFFICIENT_DATA with no sources counted.
	assert.Equal(t, 1, result.DistinctFurnishers)
	assert.NotEqual(t, workflow.VerdictInsufficientData, result.Verdict)
	assert.NotEmpty(t, result.Attestation)
}

// T-013: a verdict signature must be independently verifiable against the signer's address.
func TestOnPullRequest_AttestationRecoversToSignerAddress(t *testing.T) {
	k := newTestKeys(t)
	runtime := testutils.NewTeeRuntime(t, k.secrets())

	sealed, commitment := sealRecord(t, k, secretPosition, time.Now().Add(-90*24*time.Hour), "ACTIVE")

	result, err := onPullRequest(k.config(), runtime, payload(t, pullRequestPayload{
		SubjectID:         testSubjectID,
		ProposedPrincipal: "1000",
		EncryptedRecords: []encryptedRecordWire{
			{FurnisherID: "0xfurnisher-a", SealedBoxHex: sealed, CommitmentHex: commitment},
		},
	}))
	require.NoError(t, err)

	// Verify over the exact bytes the handler signed -- the same payload
	// VerdictAttestations.sol re-hashes on-chain.
	canonical, err := hex.DecodeString(result.CanonicalPayload)
	require.NoError(t, err)
	require.NotEmpty(t, canonical)

	// The published bytes must really be the verdict, not an arbitrary blob.
	var roundTripped workflow.Verdict
	require.NoError(t, json.Unmarshal(canonical, &roundTripped))
	assert.Equal(t, result.Verdict, roundTripped.Verdict)

	signature, err := hex.DecodeString(strings.TrimPrefix(result.Attestation, "0x"))
	require.NoError(t, err)
	require.Len(t, signature, 65)

	// Solidity's ECDSA.recover expects v in {27,28}; go-ethereum's recover wants {0,1}.
	normalized := make([]byte, 65)
	copy(normalized, signature)
	normalized[64] -= 27

	recovered, err := crypto.SigToPub(accounts.TextHash(crypto.Keccak256(canonical)), normalized)
	require.NoError(t, err)
	assert.Equal(t, k.signerAddr, crypto.PubkeyToAddress(*recovered).Hex())
}

// T-011, stated literally: "plaintext never appears in any log or return value". This is the
// single most important test in the repo -- if it fails, the product's reason to exist is gone.
func TestOnPullRequest_NeverLeaksPlaintextOrFurnisherIdentity(t *testing.T) {
	k := newTestKeys(t)
	runtime := testutils.NewTeeRuntime(t, k.secrets())

	const furnisherID = "0xlender-a-must-not-appear"
	sealed, commitment := sealRecord(t, k, secretPosition, time.Now().Add(-1*time.Hour), "ACTIVE")

	result, err := onPullRequest(k.config(), runtime, payload(t, pullRequestPayload{
		SubjectID:         testSubjectID,
		ProposedPrincipal: "1000",
		EncryptedRecords: []encryptedRecordWire{
			{FurnisherID: furnisherID, SealedBoxHex: sealed, CommitmentHex: commitment},
		},
		Inquiries: []inquiryWire{
			{PullerHash: "0xprior-puller-must-not-appear", OccurredAt: time.Now().Add(-time.Hour).Format(time.RFC3339)},
		},
	}))
	require.NoError(t, err)

	serialized, err := json.Marshal(result)
	require.NoError(t, err)

	forbidden := map[string]string{
		"the exact principal":        secretPosition,
		"the furnisher's identity":   furnisherID,
		"a prior puller's identity":  "0xprior-puller-must-not-appear",
		"the X25519 private key":     hex.EncodeToString(k.x25519Priv[:]),
		"the attestation signer key": k.signerHex,
	}

	for description, secret := range forbidden {
		assert.NotContains(t, string(serialized), secret, "the verdict returned to the puller leaked %s", description)
		for _, raw := range runtime.GetLogs() {
			assert.NotContains(t, string(raw), secret, "an enclave log leaked %s", description)
		}
	}
}

// T-041: a ciphertext whose commitment doesn't match on-chain state is dropped, and the verdict
// says so -- rather than the batch failing or the tampered record being silently trusted.
func TestOnPullRequest_RejectsTamperedRecordWithIntegrityWarning(t *testing.T) {
	k := newTestKeys(t)
	runtime := testutils.NewTeeRuntime(t, k.secrets())

	sealed, _ := sealRecord(t, k, secretPosition, time.Now().Add(-time.Hour), "ACTIVE")
	wrongCommitment := hex.EncodeToString(crypto.Keccak256([]byte("not the ciphertext")))

	goodSealed, goodCommitment := sealRecord(t, k, "5000", time.Now().Add(-90*24*time.Hour), "ACTIVE")

	result, err := onPullRequest(k.config(), runtime, payload(t, pullRequestPayload{
		SubjectID:         testSubjectID,
		ProposedPrincipal: "1000",
		EncryptedRecords: []encryptedRecordWire{
			{FurnisherID: "0xtampered", SealedBoxHex: sealed, CommitmentHex: wrongCommitment},
			{FurnisherID: "0xhonest", SealedBoxHex: goodSealed, CommitmentHex: goodCommitment},
		},
	}))
	require.NoError(t, err)

	assert.Contains(t, result.StackingFlags, workflow.FlagDataIntegrityWarn)
	// The honest record still counted -- one bad record does not fail the whole batch.
	assert.Equal(t, 1, result.DistinctFurnishers)
}

// The headline scenario from docs/spec.md #8, computed by the real handler.
func TestOnPullRequest_FlagsStackingAcrossDistinctFurnishers(t *testing.T) {
	k := newTestKeys(t)
	runtime := testutils.NewTeeRuntime(t, k.secrets())

	lenderA, commitmentA := sealRecord(t, k, "50000", time.Now().Add(-3*time.Hour), "ACTIVE")
	lenderB, commitmentB := sealRecord(t, k, "50000", time.Now().Add(-12*time.Minute), "ACTIVE")

	result, err := onPullRequest(k.config(), runtime, payload(t, pullRequestPayload{
		SubjectID:         testSubjectID,
		ProposedPrincipal: "50000",
		EncryptedRecords: []encryptedRecordWire{
			{FurnisherID: "0xlender-a", SealedBoxHex: lenderA, CommitmentHex: commitmentA},
			{FurnisherID: "0xlender-b", SealedBoxHex: lenderB, CommitmentHex: commitmentB},
		},
	}))
	require.NoError(t, err)

	assert.Equal(t, workflow.VerdictCritical, result.Verdict)
	assert.Contains(t, result.StackingFlags, workflow.FlagMultiOrigination48h)
	assert.Equal(t, 2, result.OriginationVelocity48h)
}

func TestOnPullRequest_InsufficientDataWhenNothingKnown(t *testing.T) {
	k := newTestKeys(t)
	runtime := testutils.NewTeeRuntime(t, k.secrets())

	result, err := onPullRequest(k.config(), runtime, payload(t, pullRequestPayload{
		SubjectID:         testSubjectID,
		ProposedPrincipal: "1000",
	}))
	require.NoError(t, err)

	assert.Equal(t, workflow.VerdictInsufficientData, result.Verdict)
}

func TestOnPullRequest_MergesPublicSubgraphPositions(t *testing.T) {
	k := newTestKeys(t)
	runtime := testutils.NewTeeRuntime(t, k.secrets())

	sealed, commitment := sealRecord(t, k, "10000", time.Now().Add(-90*24*time.Hour), "ACTIVE")

	result, err := onPullRequest(k.config(), runtime, payload(t, pullRequestPayload{
		SubjectID:         testSubjectID,
		ProposedPrincipal: "1000",
		EncryptedRecords: []encryptedRecordWire{
			{FurnisherID: "0xprivate-desk", SealedBoxHex: sealed, CommitmentHex: commitment},
		},
		PublicPositions: []positionWire{
			{SourceID: "AAVE_V3", Principal: "25000", Status: "ACTIVE",
				OriginatedAt: time.Now().Add(-120 * 24 * time.Hour).Format(time.RFC3339)},
		},
	}))
	require.NoError(t, err)

	// One private furnisher + one public protocol = two distinct sources in the aggregate.
	assert.Equal(t, 2, result.DistinctFurnishers)
	assert.Equal(t, "10k-50k", result.ExposureBucket)
}

func TestOnPullRequest_RejectsMalformedPayload(t *testing.T) {
	k := newTestKeys(t)
	runtime := testutils.NewTeeRuntime(t, k.secrets())

	_, err := onPullRequest(k.config(), runtime, &httpcap.Payload{Input: []byte("not json")})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid pull request payload")
}

func TestInitWorkflowRegistersOneTeeHandler(t *testing.T) {
	k := newTestKeys(t)
	wf, err := InitWorkflow(k.config(), nil, nil)
	require.NoError(t, err)
	assert.Len(t, wf, 1)
}

func TestSignerAddressMatchesGeneratedKey(t *testing.T) {
	k := newTestKeys(t)
	addr, err := signerAddress(k.signerHex)
	require.NoError(t, err)
	assert.Equal(t, k.signerAddr, addr)
	assert.True(t, strings.HasPrefix(addr, "0x"), fmt.Sprintf("unexpected address form %q", addr))
}
