import type { Address, Hash } from "viem";
import { publicClient, getWalletClient, deployments } from "./clients.js";
import SubjectRegistryAbi from "./abis/SubjectRegistry.json" with { type: "json" };
import FurnisherRegistryAbi from "./abis/FurnisherRegistry.json" with { type: "json" };
import ExposureCommitmentsAbi from "./abis/ExposureCommitments.json" with { type: "json" };
import ReciprocityLedgerAbi from "./abis/ReciprocityLedger.json" with { type: "json" };
import VerdictAttestationsAbi from "./abis/VerdictAttestations.json" with { type: "json" };

export async function registerSubjectOnChain(nullifierHash: `0x${string}`, wallet: Address): Promise<{ subjectId: `0x${string}`; txHash: Hash }> {
  const wallet_ = getWalletClient();
  const { SubjectRegistry } = deployments();

  const txHash = await wallet_.writeContract({
    address: SubjectRegistry,
    abi: SubjectRegistryAbi,
    functionName: "registerSubject",
    args: [nullifierHash, wallet],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

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
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  const [, version] = (await publicClient.readContract({
    address: ExposureCommitments,
    abi: ExposureCommitmentsAbi,
    functionName: "latestCommitment",
    args: [subjectId, furnisherId, recordId],
  })) as [string, bigint, bigint];

  return { version, txHash: receipt.transactionHash };
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
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}
