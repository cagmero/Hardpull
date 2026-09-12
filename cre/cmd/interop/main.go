// interop is a small CLI used to prove packages/types/src/sealedbox.ts and
// cre/workflow/sealedbox.go are byte-for-byte compatible -- a furnisher client (TypeScript) and
// the CRE enclave (Go) must be able to seal/open each other's messages. Not part of the
// production workflow; a verification tool only. See packages/types/src/sealedbox.test.ts for
// the paired half of this check.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"

	"github.com/hardpull/cre/workflow"
	"golang.org/x/crypto/nacl/box"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: interop <genkey|seal|open> [args...]")
		os.Exit(1)
	}

	switch os.Args[1] {
	case "genkey":
		pub, priv, err := box.GenerateKey(rand.Reader)
		must(err)
		fmt.Printf("%s %s\n", hex.EncodeToString(pub[:]), hex.EncodeToString(priv[:]))

	case "seal": // seal <recipientPubHex> <message>
		var pub [32]byte
		pubBytes, err := hex.DecodeString(os.Args[2])
		must(err)
		copy(pub[:], pubBytes)

		sealed, err := workflow.SealAnonymous([]byte(os.Args[3]), &pub)
		must(err)
		fmt.Println(hex.EncodeToString(sealed))

	case "open": // open <sealedHex> <recipientPubHex> <recipientPrivHex>
		sealedBytes, err := hex.DecodeString(os.Args[2])
		must(err)
		var pub, priv [32]byte
		pubBytes, err := hex.DecodeString(os.Args[3])
		must(err)
		privBytes, err := hex.DecodeString(os.Args[4])
		must(err)
		copy(pub[:], pubBytes)
		copy(priv[:], privBytes)

		opened, err := workflow.OpenAnonymous(sealedBytes, &pub, &priv)
		must(err)
		fmt.Println(string(opened))

	default:
		fmt.Fprintln(os.Stderr, "unknown mode:", os.Args[1])
		os.Exit(1)
	}
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
