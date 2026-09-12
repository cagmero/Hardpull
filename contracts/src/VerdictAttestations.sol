// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title VerdictAttestations
/// @notice Stores the signed verdict hash from a pull, keyed by inquiryId, and lets anyone
///         independently re-verify the CRE workflow's signature (docs/architecture.md #2.1).
contract VerdictAttestations {
    address public immutable creSigner;

    struct Attestation {
        bytes32 verdictHash;
        bytes signature;
        uint256 recordedAt;
    }

    mapping(bytes32 inquiryId => Attestation) public attestations;

    event VerdictAttested(bytes32 indexed inquiryId, bytes32 indexed verdictHash, uint256 recordedAt);

    error AlreadyAttested();
    error InvalidSignature();

    constructor(address _creSigner) {
        creSigner = _creSigner;
    }

    /// @param verdictHash keccak256 of the canonical verdict payload the CRE workflow emitted.
    /// @param signature   the CRE workflow's ECDSA signature over the eth-signed verdictHash.
    function attest(bytes32 inquiryId, bytes32 verdictHash, bytes calldata signature) external {
        if (attestations[inquiryId].recordedAt != 0) revert AlreadyAttested();

        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(verdictHash);
        address recovered = ECDSA.recover(ethSignedHash, signature);
        if (recovered != creSigner) revert InvalidSignature();

        attestations[inquiryId] =
            Attestation({verdictHash: verdictHash, signature: signature, recordedAt: block.timestamp});
        emit VerdictAttested(inquiryId, verdictHash, block.timestamp);
    }

    function verify(bytes32 inquiryId, bytes32 verdictHash) external view returns (bool) {
        Attestation storage a = attestations[inquiryId];
        return a.recordedAt != 0 && a.verdictHash == verdictHash;
    }
}
