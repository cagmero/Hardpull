// Package workflow implements the Hardpull confidential join: aggregating a subject's exposure
// across furnished (private) and public positions and applying the stacking rules from
// docs/spec.md #6.5. This package is pure Go with no CRE SDK dependency so it can be unit
// tested without the enclave runtime; main.go wires it into the actual CRE workflow.
package workflow

import (
	"math/big"
	"time"
)

// PositionStatus mirrors spec.md #6.2.
type PositionStatus string

const (
	StatusActive     PositionStatus = "ACTIVE"
	StatusRepaid     PositionStatus = "REPAID"
	StatusDefaulted  PositionStatus = "DEFAULTED"
	StatusClosed     PositionStatus = "CLOSED"
	StatusLiquidated PositionStatus = "LIQUIDATED"
)

// Position is the decrypted shape of a furnished record, or a public subgraph position
// normalized to the same fields (architecture.md #2.4). SourceID is the furnisherId for a
// private record, or the protocol name (e.g. "AAVE_V3") for a public one -- either way it is
// never propagated into the Verdict.
type Position struct {
	SourceID     string
	Principal    *big.Int
	Currency     string
	OriginatedAt time.Time
	// StatusChangedAt is when Status last transitioned (a new commitment version onchain, or
	// the subgraph block timestamp for a public position). Defaults to OriginatedAt for a
	// position that has never changed status.
	StatusChangedAt time.Time
	MaturityAt      *time.Time
	Status          PositionStatus
	Public          bool
}

// Inquiry is a prior pull against this subject.
type Inquiry struct {
	OccurredAt time.Time
	PullerHash string
}

// Thresholds are governable stacking-rule parameters (spec.md #6.5: "governable parameters,
// not hardcoded constants").
type Thresholds struct {
	CriticalOriginationWindow time.Duration
	CriticalOriginationCount  int
	ExposureMultiple          float64
	WarningInquiryWindow      time.Duration
	WarningInquiryCount       int
	WarningOriginationWindow  time.Duration
	WarningDefaultLookback    time.Duration
}

// DefaultThresholds match spec.md #6.5 literally.
func DefaultThresholds() Thresholds {
	return Thresholds{
		CriticalOriginationWindow: 48 * time.Hour,
		CriticalOriginationCount:  2,
		ExposureMultiple:          3.0,
		WarningInquiryWindow:      7 * 24 * time.Hour,
		WarningInquiryCount:       4,
		WarningOriginationWindow:  48 * time.Hour,
		WarningDefaultLookback:    24 * 30 * 24 * time.Hour, // 24 months
	}
}

// VerdictInput is what the CRE workflow assembles inside the enclave: decrypted private
// records, subgraph-sourced public positions, and inquiry history. None of this ever leaves
// the enclave -- only a Verdict does.
type VerdictInput struct {
	SubjectID         string
	ProposedPrincipal *big.Int
	Positions         []Position // private (decrypted) + public, already merged
	Inquiries         []Inquiry
	Thresholds        Thresholds
	Now               time.Time
	// HasIntegrityWarning is set by the caller when commitment verification (T-041) rejected
	// at least one tampered record before Evaluate ever saw it.
	HasIntegrityWarning bool
}

// VerdictLevel enumerates spec.md #6.5.
type VerdictLevel string

const (
	VerdictClear            VerdictLevel = "CLEAR"
	VerdictWarning          VerdictLevel = "WARNING"
	VerdictCritical         VerdictLevel = "CRITICAL"
	VerdictInsufficientData VerdictLevel = "INSUFFICIENT_DATA"
)

const (
	FlagMultiOrigination48h = "MULTI_ORIGINATION_48H"
	FlagInquiryBurst        = "INQUIRY_BURST"
	FlagDataIntegrityWarn   = "DATA_INTEGRITY_WARNING"
)

// Verdict is the ONLY struct that may ever leave the enclave (docs/spec.md #6.6,
// docs/plan.md T-042). It intentionally has no field for furnisher identity, exact
// outstanding amount, loan terms, or prior puller identity. Do not add one -- see
// TestVerdict_NeverExposesRestrictedFields, which fails the build's test suite if you do.
type Verdict struct {
	Verdict                VerdictLevel `json:"verdict"`
	ExposureBucket         string       `json:"exposureBucket"`
	OriginationVelocity48h int          `json:"originationVelocity48h"`
	InquiryVelocity7d      int          `json:"inquiryVelocity7d"`
	DistinctFurnishers     int          `json:"distinctFurnishers"`
	StackingFlags          []string     `json:"stackingFlags"`
	ComputedAt             string       `json:"computedAt"`
}
