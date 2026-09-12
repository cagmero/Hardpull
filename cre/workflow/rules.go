package workflow

import (
	"math/big"
	"time"
)

var exposureBuckets = []struct {
	label string
	max   *big.Int // exclusive upper bound; nil means unbounded
}{
	{"<10k", big.NewInt(10_000)},
	{"10k-50k", big.NewInt(50_000)},
	{"50k-250k", big.NewInt(250_000)},
	{"250k-1M", big.NewInt(1_000_000)},
	{">1M", nil},
}

// ExposureBucket buckets a total outstanding amount per spec.md #6.6 -- callers never see the
// exact figure, only which bracket it falls in.
func ExposureBucket(total *big.Int) string {
	for _, b := range exposureBuckets {
		if b.max == nil || total.Cmp(b.max) < 0 {
			return b.label
		}
	}
	return ">1M"
}

// Evaluate applies the deterministic stacking rules from spec.md #6.5. It is the only place
// exposure-bucket and stacking-flag decisions are made, and it never returns anything beyond
// the Verdict shape -- see TestVerdict_NeverExposesRestrictedFields.
func Evaluate(in VerdictInput) Verdict {
	now := in.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}

	if len(in.Positions) == 0 && len(in.Inquiries) == 0 {
		return Verdict{
			Verdict:        VerdictInsufficientData,
			ExposureBucket: ExposureBucket(big.NewInt(0)),
			StackingFlags:  []string{},
			ComputedAt:     now.UTC().Format(time.RFC3339),
		}
	}

	totalOutstanding := big.NewInt(0)
	historicalMax := big.NewInt(0)
	sources := map[string]bool{}
	originatingSources48h := map[string]bool{}
	hasRecentDefault := false

	for _, p := range in.Positions {
		sources[p.SourceID] = true

		if p.Status == StatusActive {
			totalOutstanding.Add(totalOutstanding, p.Principal)
		}

		if p.Principal.Cmp(historicalMax) > 0 {
			historicalMax = new(big.Int).Set(p.Principal)
		}

		if now.Sub(p.OriginatedAt) <= in.Thresholds.CriticalOriginationWindow && now.Sub(p.OriginatedAt) >= 0 {
			originatingSources48h[p.SourceID] = true
		}

		statusChangedAt := p.StatusChangedAt
		if statusChangedAt.IsZero() {
			statusChangedAt = p.OriginatedAt
		}
		if p.Status == StatusDefaulted && now.Sub(statusChangedAt) <= in.Thresholds.WarningDefaultLookback {
			hasRecentDefault = true
		}
	}

	distinctPullers7d := map[string]bool{}
	for _, i := range in.Inquiries {
		if d := now.Sub(i.OccurredAt); d >= 0 && d <= in.Thresholds.WarningInquiryWindow {
			distinctPullers7d[i.PullerHash] = true
		}
	}

	projectedExposure := new(big.Int).Add(totalOutstanding, in.ProposedPrincipal)
	exceedsHistoricalMultiple := historicalMax.Sign() > 0 &&
		new(big.Float).SetInt(projectedExposure).Cmp(
			new(big.Float).Mul(big.NewFloat(in.Thresholds.ExposureMultiple), new(big.Float).SetInt(historicalMax)),
		) > 0

	multiOrigination := len(originatingSources48h) >= in.Thresholds.CriticalOriginationCount
	anyOrigination48h := len(originatingSources48h) >= 1
	inquiryBurst := len(distinctPullers7d) >= in.Thresholds.WarningInquiryCount

	flags := []string{}
	if anyOrigination48h {
		flags = append(flags, FlagMultiOrigination48h)
	}
	if inquiryBurst {
		flags = append(flags, FlagInquiryBurst)
	}
	if in.HasIntegrityWarning {
		flags = append(flags, FlagDataIntegrityWarn)
	}

	level := VerdictClear
	switch {
	case multiOrigination || exceedsHistoricalMultiple:
		level = VerdictCritical
	case inquiryBurst || anyOrigination48h || hasRecentDefault:
		level = VerdictWarning
	}

	return Verdict{
		Verdict:                level,
		ExposureBucket:         ExposureBucket(totalOutstanding),
		OriginationVelocity48h: len(originatingSources48h),
		InquiryVelocity7d:      len(distinctPullers7d),
		DistinctFurnishers:     len(sources),
		StackingFlags:          flags,
		ComputedAt:             now.UTC().Format(time.RFC3339),
	}
}
