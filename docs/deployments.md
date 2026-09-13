# Deployments

Published addresses for the Hardpull submission (`docs/plan.md` T-026, T-062). Machine-readable
form lives alongside this file as `deployments.<chainId>.json`, written by
`contracts/script/Deploy.s.sol` and fanned into every package's env by
`node scripts/sync-deployments.mjs`.

## Ethereum Sepolia (chainId 11155111)

All five contracts are deployed and **verified on Etherscan**, which is T-026's acceptance
criterion.

| Contract | Address | Source | Deploy tx |
|---|---|---|---|
| `SubjectRegistry` | [`0x0A6C7Bc825946c32984d3e265f6Fd5a34621ecaF`](https://sepolia.etherscan.io/address/0x0A6C7Bc825946c32984d3e265f6Fd5a34621ecaF) | ✅ verified | [`0xf3f74a9938…`](https://sepolia.etherscan.io/tx/0xf3f74a9938ff5a9294a6e966786a11ef2a859e54384851125bc1e72b538331e2) |
| `FurnisherRegistry` | [`0x687e6194530F60A0BFd03aDf014E9C8D723E88DE`](https://sepolia.etherscan.io/address/0x687e6194530F60A0BFd03aDf014E9C8D723E88DE) | ✅ verified | [`0x89aab6193d…`](https://sepolia.etherscan.io/tx/0x89aab6193de4c294aab6487d325fce8f13ae7c955fdc7988578dad7d6b76469d) |
| `ReciprocityLedger` | [`0x75D729Fdb1E2F73941d65cFc557052B5c8A8A81a`](https://sepolia.etherscan.io/address/0x75D729Fdb1E2F73941d65cFc557052B5c8A8A81a) | ✅ verified | [`0x56de18f9bd…`](https://sepolia.etherscan.io/tx/0x56de18f9bd5dd30f172dddb0da093d666648be1353622287d4bee9f29d1fd453) |
| `ExposureCommitments` | [`0xb85AbFF5DcA9f3006A97B2f787d3Ee80691B11dC`](https://sepolia.etherscan.io/address/0xb85AbFF5DcA9f3006A97B2f787d3Ee80691B11dC) | ✅ verified | [`0x1a4e6b4866…`](https://sepolia.etherscan.io/tx/0x1a4e6b4866883897c260d8a33dd2eebbcfb57019d4a2fcddd86e13ff7129edba) |
| `VerdictAttestations` | [`0x6417C8F2145A91be3d3cD905Fb003aEb71148782`](https://sepolia.etherscan.io/address/0x6417C8F2145A91be3d3cD905Fb003aEb71148782) | ✅ verified | [`0x2a658f8c3b…`](https://sepolia.etherscan.io/tx/0x2a658f8c3b16f617a7465ae6e461d00944689cdd422d7dee46f03483ef2d6ef0) |

**Registrar:** `0x4b1598a66975B0539B05A2cc40BC4A0B984a3866` — the API relays every subject and
furnisher registration, so this is the only address `SubjectRegistry` and `FurnisherRegistry`
accept writes from.

**CRE attestation signer:** `0xfAf7F5C1b20B278f593e9837dE729D7a9217143D` — `VerdictAttestations`
stores this as an **immutable**, so it had to exist before deployment. It is the address
`cd cre && go run ./cmd/keygen` printed, and `VerdictAttestations.verify()` only returns true for
verdicts signed by its matching private key.

## Hedera Testnet

| Resource | Value |
|---|---|
| HCS inquiry topic | [`0.0.10525131`](https://hashscan.io/testnet/topic/0.0.10525131) |

Every pull is written to this topic regardless of verdict, carrying only the five hashed or
enumerable fields `spec.md` #6.8 permits — no furnisher identity, no amounts, no PII.

## The Graph

Subgraph Studio slugs: `hardpull_mainnet` and `hardpull_sepolia`. Not yet deployed — see
`subgraph/README.md`. The Sepolia manifest's addresses are filled in from the table above by
`scripts/sync-deployments.mjs`.

## Not yet deployed

- **CRE workflow** — Confidential Workflows is in private beta; `cre account access` is pending.
  Simulation already runs (see `docs/DECISIONS.md`).
- **World ID** — deliberately left unconfigured. It is in the "built but not submitted" bucket
  (`docs/sponsor-integration.md` #4), not one of the three selected partners, so the demo seeds
  subjects with `api/src/scripts/seed-demo-subject.ts` instead.
