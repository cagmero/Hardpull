package workflow

import (
	"math/big"
	"reflect"
	"strings"
	"testing"
	"time"
)

func pos(sourceID string, principal int64, status PositionStatus, originatedAgo time.Duration, now time.Time) Position {
	return Position{
		SourceID:        sourceID,
		Principal:       big.NewInt(principal),
		Currency:        "USD",
		OriginatedAt:    now.Add(-originatedAgo),
		StatusChangedAt: now.Add(-originatedAgo),
		Status:          status,
	}
}

func inq(pullerHash string, ago time.Duration, now time.Time) Inquiry {
	return Inquiry{PullerHash: pullerHash, OccurredAt: now.Add(-ago)}
}

func TestEvaluate(t *testing.T) {
	now := time.Date(2026, 9, 14, 10, 32, 0, 0, time.UTC)
	th := DefaultThresholds()

	cases := []struct {
		name  string
		in    VerdictInput
		want  VerdictLevel
		flags []string
	}{
		{
			name:  "no records no inquiries -> insufficient data",
			in:    VerdictInput{SubjectID: "s1", ProposedPrincipal: big.NewInt(1000), Thresholds: th, Now: now},
			want:  VerdictInsufficientData,
			flags: []string{},
		},
		{
			name: "single clean active position -> clear",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions:         []Position{pos("lenderA", 5000, StatusActive, 100*24*time.Hour, now)},
				Thresholds:        th, Now: now,
			},
			want: VerdictClear,
		},
		{
			name: "repaid position only, no other signal -> clear",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions:         []Position{pos("lenderA", 5000, StatusRepaid, 200*24*time.Hour, now)},
				Thresholds:        th, Now: now,
			},
			want: VerdictClear,
		},
		{
			name: "two originations 48h apart distinct furnishers -> critical",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions: []Position{
					pos("lenderA", 5000, StatusActive, 10*time.Hour, now),
					pos("lenderB", 5000, StatusActive, 20*time.Hour, now),
				},
				Thresholds: th, Now: now,
			},
			want:  VerdictCritical,
			flags: []string{FlagMultiOrigination48h},
		},
		{
			name: "two originations same furnisher within 48h -> not multi (needs distinct)",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions: []Position{
					pos("lenderA", 5000, StatusActive, 10*time.Hour, now),
					pos("lenderA", 3000, StatusActive, 20*time.Hour, now),
				},
				Thresholds: th, Now: now,
			},
			want:  VerdictWarning, // still >=1 origination in 48h
			flags: []string{FlagMultiOrigination48h},
		},
		{
			name: "origination exactly at 48h boundary counts",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions:         []Position{pos("lenderA", 5000, StatusActive, 48*time.Hour, now)},
				Thresholds:        th, Now: now,
			},
			want:  VerdictWarning,
			flags: []string{FlagMultiOrigination48h},
		},
		{
			name: "origination just past 48h boundary does not count",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions:         []Position{pos("lenderA", 5000, StatusActive, 48*time.Hour+time.Second, now)},
				Thresholds:        th, Now: now,
			},
			want:  VerdictClear,
			flags: []string{},
		},
		{
			name: "proposed principal pushes exposure over 3x historical max -> critical",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(40_000),
				Positions:         []Position{pos("lenderA", 10_000, StatusActive, 200*24*time.Hour, now)},
				Thresholds:        th, Now: now,
			},
			want: VerdictCritical, // (40000+10000) > 3*10000=30000
		},
		{
			name: "proposed principal exactly at 3x boundary -> not critical (strictly greater required)",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(20_000),
				Positions:         []Position{pos("lenderA", 10_000, StatusActive, 200*24*time.Hour, now)},
				Thresholds:        th, Now: now,
			},
			want: VerdictClear, // (20000+10000) == 3*10000, not strictly greater
		},
		{
			name: "four distinct pullers in 7d -> warning inquiry burst",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions:         []Position{pos("lenderA", 5000, StatusActive, 200*24*time.Hour, now)},
				Inquiries: []Inquiry{
					inq("p1", 1*24*time.Hour, now),
					inq("p2", 2*24*time.Hour, now),
					inq("p3", 3*24*time.Hour, now),
					inq("p4", 4*24*time.Hour, now),
				},
				Thresholds: th, Now: now,
			},
			want:  VerdictWarning,
			flags: []string{FlagInquiryBurst},
		},
		{
			name: "three distinct pullers in 7d -> below burst threshold, clear",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions:         []Position{pos("lenderA", 5000, StatusActive, 200*24*time.Hour, now)},
				Inquiries: []Inquiry{
					inq("p1", 1*24*time.Hour, now),
					inq("p2", 2*24*time.Hour, now),
					inq("p3", 3*24*time.Hour, now),
				},
				Thresholds: th, Now: now,
			},
			want:  VerdictClear,
			flags: []string{},
		},
		{
			name: "same puller inquiring four times does not count as four distinct",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions:         []Position{pos("lenderA", 5000, StatusActive, 200*24*time.Hour, now)},
				Inquiries: []Inquiry{
					inq("p1", 1*24*time.Hour, now),
					inq("p1", 2*24*time.Hour, now),
					inq("p1", 3*24*time.Hour, now),
					inq("p1", 4*24*time.Hour, now),
				},
				Thresholds: th, Now: now,
			},
			want:  VerdictClear,
			flags: []string{},
		},
		{
			name: "inquiry just outside 7d window does not count",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions:         []Position{pos("lenderA", 5000, StatusActive, 200*24*time.Hour, now)},
				Inquiries: []Inquiry{
					inq("p1", 1*24*time.Hour, now),
					inq("p2", 2*24*time.Hour, now),
					inq("p3", 3*24*time.Hour, now),
					inq("p4", 8*24*time.Hour, now),
				},
				Thresholds: th, Now: now,
			},
			want:  VerdictClear,
			flags: []string{},
		},
		{
			name: "defaulted record within 24 months -> warning",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions:         []Position{pos("lenderA", 5000, StatusDefaulted, 12*30*24*time.Hour, now)},
				Thresholds:        th, Now: now,
			},
			want:  VerdictWarning,
			flags: []string{},
		},
		{
			name: "defaulted record older than 24 months -> clear",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions:         []Position{pos("lenderA", 5000, StatusDefaulted, 25*30*24*time.Hour, now)},
				Thresholds:        th, Now: now,
			},
			want:  VerdictClear,
			flags: []string{},
		},
		{
			name: "public and private positions combine for distinctFurnishers",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions: []Position{
					pos("lenderA", 5000, StatusActive, 200*24*time.Hour, now),
					{SourceID: "AAVE_V3", Principal: big.NewInt(2000), Status: StatusActive, OriginatedAt: now.Add(-200 * 24 * time.Hour), Public: true},
				},
				Thresholds: th, Now: now,
			},
			want: VerdictClear,
		},
		{
			name: "data integrity warning flag surfaces from caller",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions:         []Position{pos("lenderA", 5000, StatusActive, 200*24*time.Hour, now)},
				Thresholds:        th, Now: now,
				HasIntegrityWarning: true,
			},
			want:  VerdictClear,
			flags: []string{FlagDataIntegrityWarn},
		},
		{
			name: "closed position with no other signal -> clear, zero exposure",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions:         []Position{pos("lenderA", 5000, StatusClosed, 200*24*time.Hour, now)},
				Thresholds:        th, Now: now,
			},
			want: VerdictClear,
		},
		{
			name: "critical takes priority over warning-level signals",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Positions: []Position{
					pos("lenderA", 5000, StatusActive, 10*time.Hour, now),
					pos("lenderB", 5000, StatusActive, 20*time.Hour, now),
				},
				Inquiries: []Inquiry{
					inq("p1", 1*24*time.Hour, now),
					inq("p2", 2*24*time.Hour, now),
					inq("p3", 3*24*time.Hour, now),
					inq("p4", 4*24*time.Hour, now),
				},
				Thresholds: th, Now: now,
			},
			want:  VerdictCritical,
			flags: []string{FlagMultiOrigination48h, FlagInquiryBurst},
		},
		{
			name: "inquiries only, no positions -> not insufficient data",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1000),
				Inquiries: []Inquiry{
					inq("p1", 1*24*time.Hour, now),
					inq("p2", 2*24*time.Hour, now),
					inq("p3", 3*24*time.Hour, now),
					inq("p4", 4*24*time.Hour, now),
				},
				Thresholds: th, Now: now,
			},
			want:  VerdictWarning,
			flags: []string{FlagInquiryBurst},
		},
		{
			name: "zero historical max never trips the multiple check",
			in: VerdictInput{
				ProposedPrincipal: big.NewInt(1_000_000),
				Positions:         []Position{pos("lenderA", 0, StatusActive, 200*24*time.Hour, now)},
				Thresholds:        th, Now: now,
			},
			want: VerdictClear,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Evaluate(tc.in)
			if got.Verdict != tc.want {
				t.Fatalf("verdict = %s, want %s (full: %+v)", got.Verdict, tc.want, got)
			}
			if tc.flags != nil {
				gotFlags := got.StackingFlags
				if len(gotFlags) == 0 {
					gotFlags = []string{}
				}
				if !reflect.DeepEqual(gotFlags, tc.flags) {
					t.Fatalf("flags = %v, want %v", gotFlags, tc.flags)
				}
			}
		})
	}
}

func TestExposureBucket_Boundaries(t *testing.T) {
	cases := []struct {
		amount int64
		want   string
	}{
		{0, "<10k"},
		{9_999, "<10k"},
		{10_000, "10k-50k"},
		{49_999, "10k-50k"},
		{50_000, "50k-250k"},
		{249_999, "50k-250k"},
		{250_000, "250k-1M"},
		{999_999, "250k-1M"},
		{1_000_000, ">1M"},
		{5_000_000, ">1M"},
	}
	for _, tc := range cases {
		got := ExposureBucket(big.NewInt(tc.amount))
		if got != tc.want {
			t.Errorf("ExposureBucket(%d) = %s, want %s", tc.amount, got, tc.want)
		}
	}
}

// TestVerdict_NeverExposesRestrictedFields is the T-042 invariant test: the Verdict struct's
// JSON output must never carry a furnisher identity, exact principal, rate, maturity, or prior
// puller identity. It inspects the struct's json tags directly so it fails the moment anyone
// adds such a field, regardless of what test data is fed through Evaluate.
func TestVerdict_NeverExposesRestrictedFields(t *testing.T) {
	// "distinctFurnishers" is an explicit, spec-mandated exception: it is a count, not an
	// identity (spec.md #6.4's example payload names it directly). Every other restricted
	// substring below is disallowed in any Verdict field.
	const allowedException = "distinctfurnishers"
	restricted := []string{"furnisherid", "furnishername", "furnisherkey", "principal", "amount", "rate", "maturity", "pullerid", "pullername", "counterparty", "wallet", "address"}

	rt := reflect.TypeOf(Verdict{})
	for i := 0; i < rt.NumField(); i++ {
		tag := strings.ToLower(rt.Field(i).Tag.Get("json"))
		name := strings.ToLower(rt.Field(i).Name)
		if tag == allowedException || name == allowedException {
			continue
		}
		for _, bad := range restricted {
			if strings.Contains(tag, bad) || strings.Contains(name, bad) {
				t.Fatalf("Verdict field %q (json tag %q) matches restricted term %q -- spec.md #6.6 forbids this", rt.Field(i).Name, tag, bad)
			}
		}
	}
}
