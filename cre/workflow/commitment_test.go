package workflow

import (
	"errors"
	"testing"

	"github.com/ethereum/go-ethereum/crypto"
)

func TestVerifyCommitment(t *testing.T) {
	ciphertext := []byte("sealed-box-ciphertext")
	commitment := crypto.Keccak256Hash(ciphertext)

	if !VerifyCommitment(ciphertext, commitment) {
		t.Fatal("expected matching commitment to verify")
	}

	tampered := []byte("sealed-box-ciphertext-tampered")
	if VerifyCommitment(tampered, commitment) {
		t.Fatal("expected mismatched ciphertext to fail verification")
	}
}

func TestVerifyAndDecrypt_SkipsTamperedRecords(t *testing.T) {
	good := []byte("good-ciphertext")
	bad := []byte("bad-ciphertext")

	records := []EncryptedRecord{
		{FurnisherID: "lenderA", Ciphertext: good, Commitment: crypto.Keccak256Hash(good)},
		{FurnisherID: "lenderB", Ciphertext: bad, Commitment: crypto.Keccak256Hash([]byte("something-else"))},
	}

	decrypt := func(ct []byte) ([]byte, error) { return ct, nil }
	decode := func(pt []byte) (Position, error) { return Position{Currency: "USD"}, nil }

	positions, hadTampering, err := VerifyAndDecrypt(records, decrypt, decode)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !hadTampering {
		t.Fatal("expected hadTampering to be true")
	}
	if len(positions) != 1 {
		t.Fatalf("expected 1 verified position, got %d", len(positions))
	}
	if positions[0].SourceID != "lenderA" {
		t.Fatalf("expected surviving record to be lenderA, got %s", positions[0].SourceID)
	}
}

func TestVerifyAndDecrypt_DecryptFailureIsNonFatal(t *testing.T) {
	ct := []byte("ciphertext")
	records := []EncryptedRecord{
		{FurnisherID: "lenderA", Ciphertext: ct, Commitment: crypto.Keccak256Hash(ct)},
	}

	decrypt := func(ct []byte) ([]byte, error) { return nil, errors.New("decrypt failed") }
	decode := func(pt []byte) (Position, error) { return Position{}, nil }

	positions, hadTampering, err := VerifyAndDecrypt(records, decrypt, decode)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !hadTampering || len(positions) != 0 {
		t.Fatalf("expected 0 positions and hadTampering=true, got %d positions, hadTampering=%v", len(positions), hadTampering)
	}
}

func TestVerifyAndDecrypt_AllValid(t *testing.T) {
	ct1, ct2 := []byte("ct1"), []byte("ct2")
	records := []EncryptedRecord{
		{FurnisherID: "lenderA", Ciphertext: ct1, Commitment: crypto.Keccak256Hash(ct1)},
		{FurnisherID: "lenderB", Ciphertext: ct2, Commitment: crypto.Keccak256Hash(ct2)},
	}

	decrypt := func(ct []byte) ([]byte, error) { return ct, nil }
	decode := func(pt []byte) (Position, error) { return Position{}, nil }

	positions, hadTampering, err := VerifyAndDecrypt(records, decrypt, decode)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if hadTampering {
		t.Fatal("expected no tampering")
	}
	if len(positions) != 2 {
		t.Fatalf("expected 2 positions, got %d", len(positions))
	}
}
