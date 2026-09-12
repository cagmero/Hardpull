package workflow

import (
	"bytes"
	"crypto/rand"
	"testing"

	"golang.org/x/crypto/nacl/box"
)

func TestSealedBox_RoundTrip(t *testing.T) {
	pub, priv, err := box.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("keygen: %v", err)
	}

	message := []byte(`{"subjectId":"0xabc","principal":"50000"}`)

	sealed, err := SealAnonymous(message, pub)
	if err != nil {
		t.Fatalf("seal: %v", err)
	}

	opened, err := OpenAnonymous(sealed, pub, priv)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	if !bytes.Equal(opened, message) {
		t.Fatalf("round trip mismatch: got %q, want %q", opened, message)
	}
}

func TestSealedBox_WrongRecipientFails(t *testing.T) {
	pubA, _, _ := box.GenerateKey(rand.Reader)
	_, privB, _ := box.GenerateKey(rand.Reader)

	sealed, err := SealAnonymous([]byte("secret"), pubA)
	if err != nil {
		t.Fatalf("seal: %v", err)
	}

	if _, err := OpenAnonymous(sealed, pubA, privB); err == nil {
		t.Fatal("expected opening with the wrong private key to fail")
	}
}

func TestSealedBox_TamperedCiphertextFails(t *testing.T) {
	pub, priv, _ := box.GenerateKey(rand.Reader)

	sealed, err := SealAnonymous([]byte("secret"), pub)
	if err != nil {
		t.Fatalf("seal: %v", err)
	}
	sealed[len(sealed)-1] ^= 0xFF // flip a bit in the authenticated ciphertext

	if _, err := OpenAnonymous(sealed, pub, priv); err == nil {
		t.Fatal("expected tampered ciphertext to fail authentication")
	}
}

func TestSealedBox_TooShortInputFails(t *testing.T) {
	pub, priv, _ := box.GenerateKey(rand.Reader)
	if _, err := OpenAnonymous([]byte("short"), pub, priv); err == nil {
		t.Fatal("expected too-short input to be rejected")
	}
}
