import type { Address, Hash } from "viem";
import { publicClient, getWalletClient, deployments } from "./clients.js";
import SubjectRegistryAbi from "./abis/SubjectRegistry.json" with { type: "json" };
import FurnisherRegistryAbi from "./abis/FurnisherRegistry.json" with { type: "json" };
import ExposureCommitmentsAbi from "./abis/ExposureCommitments.json" with { type: "json" };
import ReciprocityLedgerAbi from "./abis/ReciprocityLedger.json" with { type: "json" };
import VerdictAttestationsAbi from "./abis/VerdictAttestations.json" with { type: "json" };

/**
 * Waits for a transaction and throws if it reverted.
 *
 * Two separate mistakes this exists to prevent, both of which are invisible on a local Anvil
 * node and both of which broke immediately on Sepolia:
 *
 *  1. Not waiting at all. Anvil auto-mines, so a write is effective the instant it returns;
 *     Sepolia takes ~12s, and the very next call reads pre-transaction state. That is how
 *     furnisher registration came back 201 and the following furnish reverted
 *     FurnisherNotActive() -- the registration simply had not been mined yet.
 *  2. Waiting but not checking `receipt.status`. viem resolves the receipt for a REVERTED
 *     transaction too, so `await waitForTransactionReceipt(...)` alone treats a revert as a
 *     success and the failure surfaces somewhere else entirely, later.
 */
async function confirm(txHash: Hash, what: string): Promise<Hash> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`${what} reverted onchain (tx ${txHash})`);
  }
  return txHash;
}

export async function registerFurnisherOnChain(
  furnisherId: `0x${string}`,
  ensNode: `0x${string}`,
  publicKey: `0x${string}`,
  operator: Address,
): Promise<Hash> {
  const wallet_ = getWalletClient();
  const { FurnisherRegistry } = deployments();

  const txHash = await wallet_.writeContract({
    address: FurnisherRegistry,
    abi: FurnisherRegistryAbi,
    functionName: "register",
    args: [furnisherId, ensNode, publicKey, operator],
    account: wallet_.account!,
    chain: wallet_.chain,
  });
  return confirm(txHash, "FurnisherRegistry.register");
}

export async function registerSubjectOnChain(nullifierHash: `0x${string}`, wallet: Address): Promise<{ subjectId: `0x${string}`; txHash: Hash }> {
  const wallet_ = getWalletClient();
  const { SubjectRegistry } = deployments();

  const txHash = await wallet_.writeContract({
    address: SubjectRegistry,
    abi: SubjectRegistryAbi,
    functionName: "registerSubject",
    args: [nullifierHash, wallet],
  });
  await confirm(txHash, "SubjectRegistry.registerSubject");

  const subjectId = (await publicClient.readContract({
    address: SubjectRegistry,
    abi: SubjectRegistryAbi,
    functionName: "deriveSubjectId",
    args: [nullifierHash],
  })) as `0x${string}`;

  return { subjectId, txHash };
}

export async function isFurnisherActive(furnisherId: `0x${string}`): Promise<boolean> {
  const { FurnisherRegistry } = deployments();
  return (await publicClient.readContract({
    address: FurnisherRegistry,
    abi: FurnisherRegistryAbi,
    functionName: "isActive",
    args: [furnisherId],
  })) as boolean;
}

export async function writeCommitmentOnChain(
  subjectId: `0x${string}`,
  furnisherId: `0x${string}`,
  recordId: `0x${string}`,
  commitment: `0x${string}`,
): Promise<{ version: bigint; txHash: Hash }> {
  const wallet_ = getWalletClient();
  const { ExposureCommitments } = deployments();

  const txHash = await wallet_.writeContract({
    address: ExposureCommitments,
    abi: ExposureCommitmentsAbi,
    functionName: "writeCommitment",
    args: [subjectId, furnisherId, recordId, commitment],
  });
  await confirm(txHash, "ExposureCommitments.writeCommitment");

  const [, version] = (await publicClient.readContract({
    address: ExposureCommitments,
    abi: ExposureCommitmentsAbi,
    functionName: "latestCommitment",
    args: [subjectId, furnisherId, recordId],
  })) as [string, bigint, bigint];

  return { version, txHash };
}

export async function pullAllowanceOnChain(furnisherId: `0x${string}`): Promise<bigint> {
  const { ReciprocityLedger } = deployments();
  return (await publicClient.readContract({
    address: ReciprocityLedger,
    abi: ReciprocityLedgerAbi,
    functionName: "pullAllowance",
    args: [furnisherId],
  })) as bigint;
}

// Direct read of the contract's own fresh-record count -- lets the reconciliation job compare
// like-for-like against the Postgres proxy count instead of trying to invert pullAllowance()'s
// formula (docs/plan.md T-05A).
export async function freshRecordCountOnChain(furnisherId: `0x${string}`): Promise<bigint> {
  const { ReciprocityLedger } = deployments();
  return (await publicClient.readContract({
    address: ReciprocityLedger,
    abi: ReciprocityLedgerAbi,
    functionName: "freshRecordCount",
    args: [furnisherId],
  })) as bigint;
}

export async function freshWindowSecondsOnChain(): Promise<bigint> {
  const { ReciprocityLedger } = deployments();
  return (await publicClient.readContract({
    address: ReciprocityLedger,
    abi: ReciprocityLedgerAbi,
    functionName: "freshWindow",
  })) as bigint;
}

export async function versionCountOnChain(
  subjectId: `0x${string}`,
  furnisherId: `0x${string}`,
  recordId: `0x${string}`,
): Promise<bigint> {
  const { ExposureCommitments } = deployments();
  return (await publicClient.readContract({
    address: ExposureCommitments,
    abi: ExposureCommitmentsAbi,
    functionName: "versionCount",
    args: [subjectId, furnisherId, recordId],
  })) as bigint;
}

export async function attestVerdictOnChain(
  inquiryId: `0x${string}`,
  verdictHash: `0x${string}`,
  signature: `0x${string}`,
): Promise<Hash> {
  const wallet_ = getWalletClient();
  const { VerdictAttestations } = deployments();

  const txHash = await wallet_.writeContract({
    address: VerdictAttestations,
    abi: VerdictAttestationsAbi,
    functionName: "attest",
    args: [inquiryId, verdictHash, signature],
  });
  return confirm(txHash, "VerdictAttestations.attest");
}
