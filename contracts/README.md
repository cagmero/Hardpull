# hardpull-contracts

Core protocol logic on Ethereum Sepolia. Solidity 0.8.24, Foundry, OpenZeppelin.

Deliberately thin: contracts hold commitments, standing, and attestations — never plaintext
positions. All computation happens in the CRE confidential workflow (see [`../cre`](../cre)).

## Contracts (planned — see `docs/plan.md` WS-2)

| Contract | Responsibility |
|---|---|
| `SubjectRegistry` | Maps `worldIdNullifierHash → subjectId`; binds wallets to subjects; rejects rebinding |
| `FurnisherRegistry` | Registers lenders, stores ENS subname + public key, active/suspended state |
| `ExposureCommitments` | Append-only `(subjectId, furnisherId, commitment, version, timestamp)` |
| `ReciprocityLedger` | Fresh-record counting, pull allowance computation, 90-day decay |
| `VerdictAttestations` | Stores signed verdict hash, CRE attestation, and inquiry ID |

## Setup

```bash
forge install   # pulls forge-std (lib/ is gitignored)
forge build
forge test
```

## Deployments

Sepolia addresses will be written to `../docs/deployments.json` once deployed (T-026).
