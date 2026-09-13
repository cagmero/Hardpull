// localgateway serves the Hardpull confidential handler over HTTP in the shape
// api/src/lib/creClient.ts speaks, so the full /v1/pull path -- consent, standing, payment,
// compute, attestation -- can be exercised end to end on a laptop.
//
// IT IS NOT A TEE, AND IT IS NOT A MOCK.
//
//   - Not a mock: every request runs the exact same code the enclave runs. The verdict rules,
//     sealed-box decryption, commitment verification and attestation signing are all reached by
//     importing the same packages cre/hardpull does. If the rules are wrong here, they are wrong
//     in production; there is no second implementation to drift from.
//   - Not a TEE: there is no enclave, no attestation, and no confidentiality guarantee. The
//     workflow private key is read from this process's environment, and this process can see
//     every plaintext position it decrypts. Against a real deployed workflow, the Hardpull API
//     could not see any of that.
//
// So this proves the *plumbing and the rules*, and proves nothing whatsoever about
// confidentiality. Confidentiality is what `cre workflow simulate` (docs/DECISIONS.md, T-014)
// and eventually a deployed Confidential Workflow demonstrate. Never present output from this
// gateway as evidence of the TEE property.
//
// Usage:
//
//	cd cre && go run ./cmd/localgateway            # reads .env written by ./cmd/keygen
//	# then point the API at it:
//	CRE_GATEWAY_URL=http://127.0.0.1:8546 CRE_WORKFLOW_ID=local CRE_CALLER_PRIVATE_KEY=0x...
package main

import (
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/hardpull/cre/workflow"
)

type jsonRPCRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      string `json:"id"`
	Method  string `json:"method"`
	Params  struct {
		Input json.RawMessage `json:"input"`
	} `json:"params"`
}

type pullRequest struct {
	SubjectID         string `json:"subjectId"`
	ProposedPrincipal string `json:"proposedPrincipal"`
	EncryptedRecords  []struct {
		FurnisherID   string `json:"furnisherId"`
		SealedBoxHex  string `json:"sealedBoxHex"`
		CommitmentHex string `json:"commitmentHex"`
	} `json:"encryptedRecords"`
	PublicPositions []struct {
		SourceID        string `json:"sourceId"`
		Principal       string `json:"principal"`
		Status          string `json:"status"`
		OriginatedAt    string `json:"originatedAt"`
		StatusChangedAt string `json:"statusChangedAt"`
	} `json:"publicPositions"`
	Inquiries []struct {
		PullerHash string `json:"pullerHash"`
		OccurredAt string `json:"occurredAt"`
	} `json:"inquiries"`
}

// Field names match api/src/lib/creClient.ts's camelCase expectation. The real CRE runtime
// serializes with Go field names instead, which is why creClient normalizes both casings.
type verdictResponse struct {
	Verdict                string   `json:"verdict"`
	ExposureBucket         string   `json:"exposureBucket"`
	OriginationVelocity48h int      `json:"originationVelocity48h"`
	InquiryVelocity7d      int      `json:"inquiryVelocity7d"`
	DistinctFurnishers     int      `json:"distinctFurnishers"`
	StackingFlags          []string `json:"stackingFlags"`
	ComputedAt             string   `json:"computedAt"`
	Attestation            string   `json:"attestation"`
	// Hex of the exact bytes Attestation signs; see cre/hardpull/wire.go.
	CanonicalPayload string `json:"canonicalPayload"`
}

type server struct {
	workflowPub  *[32]byte
	workflowPriv *[32]byte
	signerKeyHex string
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8546", "listen address")
	envPath := flag.String("env", ".env", "dotenv file holding the workflow secrets")
	flag.Parse()

	loadDotEnv(*envPath)

	privHex := os.Getenv("SECRET_WORKFLOW_X25519_PRIVATE_KEY")
	signerHex := os.Getenv("SECRET_ATTESTATION_SIGNER_KEY")
	pubHex := os.Getenv("CRE_WORKFLOW_PUBLIC_KEY_HEX")
	if pubHex == "" {
		pubHex = readConfigPublicKey("hardpull/config.staging.json")
	}
	if privHex == "" || signerHex == "" || pubHex == "" {
		log.Fatal("missing keys: run `go run ./cmd/keygen` first (needs SECRET_WORKFLOW_X25519_PRIVATE_KEY, " +
			"SECRET_ATTESTATION_SIGNER_KEY and a workflowPublicKeyHex in hardpull/config.staging.json)")
	}

	pub, err := decodeKey32(pubHex)
	if err != nil {
		log.Fatalf("invalid workflow public key: %v", err)
	}
	priv, err := decodeKey32(privHex)
	if err != nil {
		log.Fatalf("invalid workflow private key: %v", err)
	}

	s := &server{workflowPub: pub, workflowPriv: priv, signerKeyHex: signerHex}

	signerAddr, err := addressOf(signerHex)
	if err != nil {
		log.Fatalf("invalid attestation signer key: %v", err)
	}

	http.HandleFunc("/", s.handle)
	log.Printf("hardpull local CRE gateway on http://%s", *addr)
	log.Printf("attestation signer address: %s (VerdictAttestations.creSigner must equal this)", signerAddr)
	log.Printf("NOT A TEE: this process sees every plaintext it decrypts. Use `cre workflow simulate` for the confidentiality property.")
	log.Fatal(http.ListenAndServe(*addr, nil))
}

func (s *server) handle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}

	var rpc jsonRPCRequest
	if err := json.NewDecoder(r.Body).Decode(&rpc); err != nil {
		writeRPCError(w, fmt.Sprintf("invalid JSON-RPC body: %v", err))
		return
	}

	var req pullRequest
	if err := json.Unmarshal(rpc.Params.Input, &req); err != nil {
		writeRPCError(w, fmt.Sprintf("invalid pull request payload: %v", err))
		return
	}

	verdict, err := s.evaluate(req)
	if err != nil {
		writeRPCError(w, err.Error())
		return
	}

	w.Header().Set("content-type", "application/json")
	// creClient.ts accepts a bare body or a {result} envelope; send the envelope, which is the
	// shape a JSON-RPC gateway would actually return.
	_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": rpc.ID, "result": verdict})
}

func (s *server) evaluate(req pullRequest) (*verdictResponse, error) {
	records := make([]workflow.EncryptedRecord, 0, len(req.EncryptedRecords))
	for _, r := range req.EncryptedRecords {
		sealed, err := hex.DecodeString(trimHex(r.SealedBoxHex))
		if err != nil {
			log.Printf("skipping record with invalid ciphertext hex from %s", r.FurnisherID)
			continue
		}
		commitmentBytes, err := hex.DecodeString(trimHex(r.CommitmentHex))
		if err != nil || len(commitmentBytes) != 32 {
			log.Printf("skipping record with invalid commitment from %s", r.FurnisherID)
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
		return workflow.OpenAnonymous(ciphertext, s.workflowPub, s.workflowPriv)
	}

	positions, hadTampering, err := workflow.VerifyAndDecrypt(records, decrypt, decodePosition)
	if err != nil {
		return nil, fmt.Errorf("verifying furnished records: %w", err)
	}

	for _, p := range req.PublicPositions {
		principal, ok := new(big.Int).SetString(p.Principal, 10)
		if !ok {
			continue
		}
		originatedAt, err := time.Parse(time.RFC3339, p.OriginatedAt)
		if err != nil {
			continue
		}
		statusChangedAt := originatedAt
		if p.StatusChangedAt != "" {
			if t, err := time.Parse(time.RFC3339, p.StatusChangedAt); err == nil {
				statusChangedAt = t
			}
		}
		positions = append(positions, workflow.Position{
			SourceID:        p.SourceID,
			Principal:       principal,
			OriginatedAt:    originatedAt,
			StatusChangedAt: statusChangedAt,
			Status:          workflow.PositionStatus(p.Status),
			Public:          true,
		})
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

	verdict := workflow.Evaluate(workflow.VerdictInput{
		SubjectID:           req.SubjectID,
		ProposedPrincipal:   proposedPrincipal,
		Positions:           positions,
		Inquiries:           inquiries,
		Thresholds:          workflow.DefaultThresholds(),
		Now:                 time.Now().UTC(),
		HasIntegrityWarning: hadTampering,
	})

	attestation, canonicalPayload, err := sign(verdict, s.signerKeyHex)
	if err != nil {
		return nil, fmt.Errorf("signing verdict: %w", err)
	}

	return &verdictResponse{
		Verdict:                string(verdict.Verdict),
		ExposureBucket:         verdict.ExposureBucket,
		OriginationVelocity48h: verdict.OriginationVelocity48h,
		InquiryVelocity7d:      verdict.InquiryVelocity7d,
		DistinctFurnishers:     verdict.DistinctFurnishers,
		StackingFlags:          verdict.StackingFlags,
		ComputedAt:             verdict.ComputedAt,
		Attestation:            attestation,
		CanonicalPayload:       hex.EncodeToString(canonicalPayload),
	}, nil
}

// sign mirrors cre/hardpull/signing.go exactly: keccak256 of the canonical verdict JSON, wrapped
// in an eth-signed message, so VerdictAttestations.sol recovers the same signer either way.
func sign(v workflow.Verdict, signerKeyHex string) (string, []byte, error) {
	payload, err := json.Marshal(v)
	if err != nil {
		return "", nil, err
	}
	key, err := crypto.HexToECDSA(trimHex(signerKeyHex))
	if err != nil {
		return "", nil, err
	}
	signature, err := crypto.Sign(accounts.TextHash(crypto.Keccak256(payload)), key)
	if err != nil {
		return "", nil, err
	}
	signature[64] += 27
	return "0x" + hex.EncodeToString(signature), payload, nil
}

func decodePosition(plaintext []byte) (workflow.Position, error) {
	var wire struct {
		Principal    string `json:"principal"`
		Currency     string `json:"currency"`
		OriginatedAt string `json:"originatedAt"`
		Status       string `json:"status"`
	}
	if err := json.Unmarshal(plaintext, &wire); err != nil {
		return workflow.Position{}, err
	}
	principal, ok := new(big.Int).SetString(wire.Principal, 10)
	if !ok {
		return workflow.Position{}, fmt.Errorf("invalid principal in decrypted record")
	}
	originatedAt, err := time.Parse(time.RFC3339, wire.OriginatedAt)
	if err != nil {
		return workflow.Position{}, err
	}
	return workflow.Position{
		Principal:       principal,
		Currency:        wire.Currency,
		OriginatedAt:    originatedAt,
		StatusChangedAt: originatedAt,
		Status:          workflow.PositionStatus(wire.Status),
	}, nil
}

func writeRPCError(w http.ResponseWriter, message string) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK) // JSON-RPC reports errors in the body, not the status line
	_ = json.NewEncoder(w).Encode(map[string]any{
		"jsonrpc": "2.0",
		"error":   map[string]any{"code": -32000, "message": message},
	})
}

func loadDotEnv(path string) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return // env may come from the real environment instead
	}
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		if os.Getenv(strings.TrimSpace(key)) == "" {
			_ = os.Setenv(strings.TrimSpace(key), strings.TrimSpace(value))
		}
	}
}

func readConfigPublicKey(path string) string {
	raw, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	var config struct {
		WorkflowPublicKeyHex string `json:"workflowPublicKeyHex"`
	}
	if err := json.Unmarshal(raw, &config); err != nil {
		return ""
	}
	return config.WorkflowPublicKeyHex
}

func decodeKey32(s string) (*[32]byte, error) {
	b, err := hex.DecodeString(trimHex(s))
	if err != nil {
		return nil, err
	}
	if len(b) != 32 {
		return nil, fmt.Errorf("expected a 32-byte key, got %d bytes", len(b))
	}
	var out [32]byte
	copy(out[:], b)
	return &out, nil
}

func addressOf(signerKeyHex string) (string, error) {
	key, err := crypto.HexToECDSA(trimHex(signerKeyHex))
	if err != nil {
		return "", err
	}
	return crypto.PubkeyToAddress(key.PublicKey).Hex(), nil
}

func trimHex(s string) string {
	return strings.TrimPrefix(strings.TrimPrefix(s, "0x"), "0X")
}
