import { publicClient, getWalletClient } from "../chain/clients.js";
import EnhancedAccessControlAbi from "../chain/abis/EnhancedAccessControl.json" with { type: "json" };

// Real ENSv2 Enhanced Access Control integration (docs/spec.md #6.3, docs/plan.md T-071).
// Interface verified against the actual source: github.com/ensdomains/contracts-v2's
// contracts/src/access-control/interfaces/IEnhancedAccessControl.sol -- not guessed. Real
// deployed Sepolia addresses (PermissionedRegistry, ETHRegistry, etc.) are listed at
// docs.ens.domains/learn/deployments.
//
// EAC roles are bitmask-packed into a uint256, 32 regular roles + 32 admin roles, one nybble
// each. READER_ROLE below is an arbitrary but fixed choice of role index 0 for "may read this
// subject's consent resource" -- Hardpull-specific, not an ENS-defined role.
const READER_ROLE = 1n; // role index 0 -> bit 0 set

// A CRITICAL PREREQUISITE this integration cannot satisfy on its own: EAC's grantRoles reverts
// unless the caller already holds an admin role on `resource`, and a resource only has admins
// once something has been registered against it (see IPermissionedRegistry.sol -- registering a
// label associates it with an EAC resource and makes the registrant its initial admin). That
// means using this for real requires "hardpull.eth" (or an equivalent parent name) to actually
// be registered on Sepolia first, and each subject's consent resource to be minted as a subname
// under it -- a funded, one-time setup step, the same category of external dependency as a
// funded Hedera account or a Chainlink CRE login. Until ENS_EAC_REGISTRY_ADDRESS is set, every
// function below is a documented no-op rather than a call that would simply revert.

function registryAddress(): `0x${string}` | undefined {
  return process.env.ENS_EAC_REGISTRY_ADDRESS as `0x${string}` | undefined;
}

export function isEacConfigured(): boolean {
  return !!registryAddress();
}

// Derives a subject's EAC resource id. Once a subname is actually minted for this subject under
// the Hardpull parent name, this should instead read the registry's real `getResource(tokenId)`
// for that subname -- this deterministic derivation is a placeholder consistent with "not yet
// backed by a real registered subname" above.
export function subjectResource(subjectId: `0x${string}`): bigint {
  return BigInt(subjectId);
}

export async function grantConsentRoleOnChain(subjectId: `0x${string}`, pullerAddress: `0x${string}`): Promise<`0x${string}` | undefined> {
  const registry = registryAddress();
  if (!registry) return undefined; // not configured -- see prerequisite note above

  const wallet = getWalletClient();
  return wallet.writeContract({
    address: registry,
    abi: EnhancedAccessControlAbi,
    functionName: "grantRoles",
    args: [subjectResource(subjectId), READER_ROLE, pullerAddress],
  });
}

export async function revokeConsentRoleOnChain(subjectId: `0x${string}`, pullerAddress: `0x${string}`): Promise<`0x${string}` | undefined> {
  const registry = registryAddress();
  if (!registry) return undefined;

  const wallet = getWalletClient();
  return wallet.writeContract({
    address: registry,
    abi: EnhancedAccessControlAbi,
    functionName: "revokeRoles",
    args: [subjectResource(subjectId), READER_ROLE, pullerAddress],
  });
}

export async function hasConsentRoleOnChain(subjectId: `0x${string}`, pullerAddress: `0x${string}`): Promise<boolean | undefined> {
  const registry = registryAddress();
  if (!registry) return undefined;

  return (await publicClient.readContract({
    address: registry,
    abi: EnhancedAccessControlAbi,
    functionName: "hasRoles",
    args: [subjectResource(subjectId), READER_ROLE, pullerAddress],
  })) as boolean;
}
