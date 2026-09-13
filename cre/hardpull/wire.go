// Only main.go is WASM-only (GOOS=wasip1 GOARCH=wasm), which is the single target a CRE
// workflow binary runs as. This file, workflow.go and signing.go build on the host as well so
// the handler itself is unit-testable via cre/testutils. Business logic that needs no CRE
// runtime at all lives in ../workflow, which is plain Go and testable on any platform.
package main

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"math/big"
	"time"

	"github.com/hardpull/cre/workflow"
)

// Wire DTOs for the HTTP trigger's JSON Input/Output. Kept separate from workflow's internal
// types (big.Int/time.Time aren't JSON-friendly) per docs/architecture.md #2.2 INPUT/OUTPUT.

type pullRequestPayload struct {
	SubjectID         string                `json:"subjectId"`
	ProposedPrincipal string                `json:"proposedPrincipal"`
	EncryptedRecords  []encryptedRecordWire `json:"encryptedRecords"`
	PublicPositions   []positionWire        `json:"publicPositions"`
	Inquiries         []inquiryWire         `json:"inquiries"`
	Thresholds        *thresholdsWire       `json:"thresholds,omitempty"`
}

type encryptedRecordWire struct {
	FurnisherID   string `json:"furnisherId"`
	SealedBoxHex  string `json:"sealedBoxHex"`
	CommitmentHex string `json:"commitmentHex"`
}

type positionWire struct {
	SourceID        string `json:"sourceId"`
	Principal       string `json:"principal"`
	Status          string `json:"status"`
	OriginatedAt    string `json:"originatedAt"`
	StatusChangedAt string `json:"statusChangedAt,omitempty"`
}

func (p positionWire) toPosition() (workflow.Position, error) {
	principal, ok := new(big.Int).SetString(p.Principal, 10)
	if !ok {
		return workflow.Position{}, errors.New("invalid principal")
	}
	originatedAt, err := time.Parse(time.RFC3339, p.OriginatedAt)
	if err != nil {
		return workflow.Position{}, err
	}
	statusChangedAt := originatedAt
	if p.StatusChangedAt != "" {
		if t, err := time.Parse(time.RFC3339, p.StatusChangedAt); err == nil {
			statusChangedAt = t
		}
	}
	return workflow.Position{
		SourceID:        p.SourceID,
		Principal:       principal,
		OriginatedAt:    originatedAt,
		StatusChangedAt: statusChangedAt,
		Status:          workflow.PositionStatus(p.Status),
		Public:          true,
	}, nil
}

type inquiryWire struct {
	PullerHash string `json:"pullerHash"`
	OccurredAt string `json:"occurredAt"`
}

type thresholdsWire struct {
	CriticalOriginationWindowSeconds int64   `json:"criticalOriginationWindowSeconds"`
	CriticalOriginationCount         int     `json:"criticalOriginationCount"`
	ExposureMultiple                 float64 `json:"exposureMultiple"`
	WarningInquiryWindowSeconds      int64   `json:"warningInquiryWindowSeconds"`
	WarningInquiryCount              int     `json:"warningInquiryCount"`
	WarningOriginationWindowSeconds  int64   `json:"warningOriginationWindowSeconds"`
	WarningDefaultLookbackSeconds    int64   `json:"warningDefaultLookbackSeconds"`
}

func (t thresholdsWire) toThresholds() workflow.Thresholds {
	return workflow.Thresholds{
		CriticalOriginationWindow: time.Duration(t.CriticalOriginationWindowSeconds) * time.Second,
		CriticalOriginationCount:  t.CriticalOriginationCount,
		ExposureMultiple:          t.ExposureMultiple,
		WarningInquiryWindow:      time.Duration(t.WarningInquiryWindowSeconds) * time.Second,
		WarningInquiryCount:       t.WarningInquiryCount,
		WarningOriginationWindow:  time.Duration(t.WarningOriginationWindowSeconds) * time.Second,
		WarningDefaultLookback:    time.Duration(t.WarningDefaultLookbackSeconds) * time.Second,
	}
}

// signedVerdict is the HTTP trigger's response body: the Verdict plus the CRE workflow's
// signature over it, for VerdictAttestations (docs/architecture.md #2.2 OUTPUT).
//
// Deliberately FLAT, with every field spelled out, rather than embedding workflow.Verdict.
// Running `cre workflow simulate` showed the CRE runtime serializes a handler's return value
// using Go field names and ignores `json` tags entirely -- an embedded struct came back as a
// nested {"Verdict": {"Verdict": "CRITICAL", ...}} object rather than the flat camelCase body
// api/src/lib/creClient.ts expects. Flattening removes the nesting ambiguity; creClient.ts
// normalizes the field casing on its side, since only a live gateway can settle which casing
// actually goes over the wire.
type signedVerdict struct {
	Verdict                workflow.VerdictLevel `json:"verdict"`
	ExposureBucket         string                `json:"exposureBucket"`
	OriginationVelocity48h int                   `json:"originationVelocity48h"`
	InquiryVelocity7d      int                   `json:"inquiryVelocity7d"`
	DistinctFurnishers     int                   `json:"distinctFurnishers"`
	StackingFlags          []string              `json:"stackingFlags"`
	ComputedAt             string                `json:"computedAt"`
	Attestation            string                `json:"attestation"`

}

func newSignedVerdict(v workflow.Verdict, attestation string) *signedVerdict {
	return &signedVerdict{
		Verdict:                v.Verdict,
		ExposureBucket:         v.ExposureBucket,
		OriginationVelocity48h: v.OriginationVelocity48h,
		InquiryVelocity7d:      v.InquiryVelocity7d,
		DistinctFurnishers:     v.DistinctFurnishers,
		StackingFlags:          v.StackingFlags,
		ComputedAt:             v.ComputedAt,
		Attestation:            attestation,
	}
}

func decodeHexKey32(s string) (*[32]byte, error) {
	b, err := hexDecode(s)
	if err != nil {
		return nil, err
	}
	if len(b) != 32 {
		return nil, errors.New("expected 32-byte key")
	}
	var out [32]byte
	copy(out[:], b)
	return &out, nil
}

func hexDecode(s string) ([]byte, error) {
	s = trimHexPrefix(s)
	return hex.DecodeString(s)
}

func hexEncode(b []byte) string {
	return hex.EncodeToString(b)
}

func trimHexPrefix(s string) string {
	if len(s) >= 2 && s[0] == '0' && (s[1] == 'x' || s[1] == 'X') {
		return s[2:]
	}
	return s
}

func decodePositionJSON(plaintext []byte) (workflow.Position, error) {
	var wire struct {
		Principal    string `json:"principal"`
		Currency     string `json:"currency"`
		OriginatedAt string `json:"originatedAt"`
		MaturityAt   string `json:"maturityAt"`
		Status       string `json:"status"`
	}
	if err := json.Unmarshal(plaintext, &wire); err != nil {
		return workflow.Position{}, err
	}
	principal, ok := new(big.Int).SetString(wire.Principal, 10)
	if !ok {
		return workflow.Position{}, errors.New("invalid principal in decrypted record")
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
		Public:          false,
	}, nil
}
