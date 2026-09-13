package main

import (
	"crypto/ecdsa"
	"encoding/json"
	"fmt"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/hardpull/cre/workflow"
)

// signVerdict signs keccak256(canonical verdict JSON) with an Ethereum-style eth_sign
// signature, matching VerdictAttestations.sol's ecrecover(toEthSignedMessageHash(...)) check.
//
// Production CRE workflows would use DON-consensus report signing (cre.GenerateReport /
// TeeRuntime.ReportFromDon), verified onchain via a KeystoneForwarder contract -- see
// cre/README.md for why this hackathon build uses a single secp256k1 key instead: verifying a
// real Keystone Forwarder requires a live CRE deployment we don't have access to.
// Returns the signature alongside the exact payload bytes it committed to, so callers verify
// against what was actually signed instead of re-marshalling and hoping the bytes match.
func signVerdict(v workflow.Verdict, signerKeyHex string) (string, []byte, error) {
	payload, err := json.Marshal(v)
	if err != nil {
		return "", nil, fmt.Errorf("marshal verdict: %w", err)
	}

	privateKey, err := crypto.HexToECDSA(trimHexPrefix(signerKeyHex))
	if err != nil {
		return "", nil, fmt.Errorf("parse signer key: %w", err)
	}

	digest := crypto.Keccak256(payload)
	ethDigest := accounts.TextHash(digest)

	signature, err := crypto.Sign(ethDigest, privateKey)
	if err != nil {
		return "", nil, fmt.Errorf("sign: %w", err)
	}
	// go-ethereum returns v in {0,1}; VerdictAttestations.sol's ECDSA.recover expects {27,28}.
	signature[64] += 27

	return "0x" + hexEncode(signature), payload, nil
}

// signerAddress derives the address a given secp256k1 secret would sign as, useful for
// publishing creSigner at contract-deploy time.
func signerAddress(signerKeyHex string) (string, error) {
	privateKey, err := crypto.HexToECDSA(trimHexPrefix(signerKeyHex))
	if err != nil {
		return "", err
	}
	pub, ok := privateKey.Public().(*ecdsa.PublicKey)
	if !ok {
		return "", fmt.Errorf("unexpected public key type")
	}
	return crypto.PubkeyToAddress(*pub).Hex(), nil
}
