import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, foundry } from "viem/chains";

function chainFromEnv() {
  // foundry (chainId 31337) for local Anvil dev/testing; sepolia for the real deployment.
  return process.env.CHAIN_ID === "31337" ? foundry : sepolia;
}

export const publicClient = createPublicClient({
  chain: chainFromEnv(),
  transport: http(process.env.SEPOLIA_RPC_URL ?? "http://127.0.0.1:8545"),
});

// The API acts as the registrar (SubjectRegistry) and the ExposureCommitments/attestation
// writer. In production these would likely be separate signers with separate key custody --
// collapsed to one here for hackathon scope (docs/api/README.md notes this explicitly).
export function getWalletClient() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY is not set");
  const account = privateKeyToAccount(key.startsWith("0x") ? (key as `0x${string}`) : (`0x${key}` as `0x${string}`));
  return createWalletClient({
    account,
    chain: chainFromEnv(),
    transport: http(process.env.SEPOLIA_RPC_URL ?? "http://127.0.0.1:8545"),
  });
}

export interface Deployments {
  SubjectRegistry: Address;
  FurnisherRegistry: Address;
  ExposureCommitments: Address;
  ReciprocityLedger: Address;
  VerdictAttestations: Address;
}

export function deployments(): Deployments {
  const required = (name: string): Address => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value as Address;
  };
  return {
    SubjectRegistry: required("SUBJECT_REGISTRY_ADDRESS"),
    FurnisherRegistry: required("FURNISHER_REGISTRY_ADDRESS"),
    ExposureCommitments: required("EXPOSURE_COMMITMENTS_ADDRESS"),
    ReciprocityLedger: required("RECIPROCITY_LEDGER_ADDRESS"),
    VerdictAttestations: required("VERDICT_ATTESTATIONS_ADDRESS"),
  };
}
