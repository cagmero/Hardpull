package workflow

import (
	"crypto/rand"
	"errors"

	"golang.org/x/crypto/blake2b"
	"golang.org/x/crypto/nacl/box"
)

// SealAnonymous implements libsodium's crypto_box_seal construction: an ephemeral X25519
// keypair is generated per message so the sender needs only the recipient's public key, and
// the recipient cannot identify the sender. This is what a furnisher uses to encrypt a
// position record to the CRE workflow's published public key (docs/architecture.md #3.3).
func SealAnonymous(message []byte, recipientPublicKey *[32]byte) ([]byte, error) {
	ephemeralPub, ephemeralPriv, err := box.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}

	nonce, err := sealedBoxNonce(ephemeralPub, recipientPublicKey)
	if err != nil {
		return nil, err
	}

	sealed := make([]byte, 0, 32+len(message)+box.Overhead)
	sealed = append(sealed, ephemeralPub[:]...)
	sealed = box.Seal(sealed, message, nonce, recipientPublicKey, ephemeralPriv)
	return sealed, nil
}

// OpenAnonymous decrypts a crypto_box_seal ciphertext. This is the only place the CRE
// workflow's private key is ever used -- it runs inside the enclave (docs/plan.md T-011).
func OpenAnonymous(sealed []byte, recipientPublicKey, recipientPrivateKey *[32]byte) ([]byte, error) {
	if len(sealed) < 32+box.Overhead {
		return nil, errors.New("sealed box too short")
	}

	var ephemeralPub [32]byte
	copy(ephemeralPub[:], sealed[:32])

	nonce, err := sealedBoxNonce(&ephemeralPub, recipientPublicKey)
	if err != nil {
		return nil, err
	}

	opened, ok := box.Open(nil, sealed[32:], nonce, &ephemeralPub, recipientPrivateKey)
	if !ok {
		return nil, errors.New("failed to open sealed box: authentication failed")
	}
	return opened, nil
}

// sealedBoxNonce matches libsodium: nonce = generichash(ephemeralPub || recipientPub, 24).
func sealedBoxNonce(ephemeralPub, recipientPub *[32]byte) (*[24]byte, error) {
	h, err := blake2b.New(24, nil)
	if err != nil {
		return nil, err
	}
	h.Write(ephemeralPub[:])
	h.Write(recipientPub[:])

	var nonce [24]byte
	copy(nonce[:], h.Sum(nil))
	return &nonce, nil
}
