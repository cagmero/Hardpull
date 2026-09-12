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

`lib/` is gitignored; dependency versions are pinned in `foundry.lock`. Restore them with:

```bash
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-commit
forge build
forge test
```

## Deploy

```bash
DEPLOYER_PRIVATE_KEY=0x... \
REGISTRAR_ADDRESS=0x... \
CRE_SIGNER_ADDRESS=0x... \
forge script script/Deploy.s.sol:Deploy --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
```

Deploys all five contracts in dependency order and writes addresses to `../docs/deployments.json`.
Smoke-tested against a local Anvil node; not yet run against Sepolia (needs a funded deployer key).
