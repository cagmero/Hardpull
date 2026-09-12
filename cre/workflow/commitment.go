package workflow

import (
	"github.com/ethereum/go-ethereum/crypto"
)

// VerifyCommitment recomputes keccak256(ciphertext) and compares it to the commitment recorded
// onchain in ExposureCommitments (docs/architecture.md #3.3, docs/plan.md T-041). A mismatch
// means the furnisher's stored ciphertext was tampered with (or corrupted) after commitment --
// the caller must exclude that record and surface DATA_INTEGRITY_WARNING rather than aggregate
// unverified data.
func VerifyCommitment(ciphertext []byte, commitment [32]byte) bool {
	return crypto.Keccak256Hash(ciphertext) == commitment
}

// EncryptedRecord is a furnished record as stored offchain, before decryption.
type EncryptedRecord struct {
	FurnisherID string
	Ciphertext  []byte
	Commitment  [32]byte
}

// DecryptFn decrypts a sealed-box ciphertext with the workflow's private key, per
// docs/architecture.md #3.3 (libsodium sealed box, X25519).
type DecryptFn func(ciphertext []byte) ([]byte, error)

// DecodeFn parses decrypted plaintext bytes into a Position.
type DecodeFn func(plaintext []byte) (Position, error)

// VerifyAndDecrypt processes a batch of encrypted records: recomputes each commitment, decrypts
// only the ones that match, and decodes them into Positions. Tampered records are skipped, not
// fatal -- the workflow continues with what verified and reports DATA_INTEGRITY_WARNING for the
// rest (docs/architecture.md #5 "Commitment mismatch in TEE").
func VerifyAndDecrypt(records []EncryptedRecord, decrypt DecryptFn, decode DecodeFn) (positions []Position, hadTampering bool, err error) {
	for _, r := range records {
		if !VerifyCommitment(r.Ciphertext, r.Commitment) {
			hadTampering = true
			continue
		}

		plaintext, decErr := decrypt(r.Ciphertext)
		if decErr != nil {
			hadTampering = true
			continue
		}

		pos, decodeErr := decode(plaintext)
		if decodeErr != nil {
			hadTampering = true
			continue
		}

		pos.SourceID = r.FurnisherID
		positions = append(positions, pos)
	}
	return positions, hadTampering, nil
}
