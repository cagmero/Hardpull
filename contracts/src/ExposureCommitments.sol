// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {SubjectRegistry} from "./SubjectRegistry.sol";
import {FurnisherRegistry} from "./FurnisherRegistry.sol";
import {ReciprocityLedger} from "./ReciprocityLedger.sol";

/// @title ExposureCommitments
/// @notice Append-only commitment log: (subjectId, furnisherId, recordId, commitment, version,
///         timestamp). Never stores plaintext position data -- only keccak256(ciphertext)
///         commitments the CRE workflow verifies after decryption (docs/architecture.md #3.3).
contract ExposureCommitments {
    struct CommitmentRecord {
        bytes32 commitment;
        uint256 version;
        uint256 timestamp;
    }

    SubjectRegistry public immutable subjectRegistry;
    FurnisherRegistry public immutable furnisherRegistry;
    ReciprocityLedger public immutable reciprocityLedger;

    mapping(bytes32 subjectId => mapping(bytes32 furnisherId => mapping(bytes32 recordId => CommitmentRecord[])))
        private _records;

    event CommitmentWritten(
        bytes32 indexed subjectId,
        bytes32 indexed furnisherId,
        bytes32 indexed recordId,
        bytes32 commitment,
        uint256 version,
        uint256 timestamp
    );

    error UnknownSubject();
    error FurnisherNotActive();

    constructor(address _subjectRegistry, address _furnisherRegistry, address _reciprocityLedger) {
        subjectRegistry = SubjectRegistry(_subjectRegistry);
        furnisherRegistry = FurnisherRegistry(_furnisherRegistry);
        reciprocityLedger = ReciprocityLedger(_reciprocityLedger);
    }

    /// @notice Writes a new version of a furnisher's commitment for a subject's position record.
    /// @dev Anyone may call, but the write is only accepted for a registered subject and an
    ///      active (non-suspended) furnisher -- callers are expected to be the furnisher's
    ///      registered operator address, enforced upstream by the API, not by this contract.
    function writeCommitment(bytes32 subjectId, bytes32 furnisherId, bytes32 recordId, bytes32 commitment)
        external
        returns (uint256 version)
    {
        if (!subjectRegistry.subjectExists(subjectId)) revert UnknownSubject();
        if (!furnisherRegistry.isActive(furnisherId)) revert FurnisherNotActive();

        CommitmentRecord[] storage versions = _records[subjectId][furnisherId][recordId];
        version = versions.length + 1;
        versions.push(CommitmentRecord({commitment: commitment, version: version, timestamp: block.timestamp}));

        reciprocityLedger.recordContribution(furnisherId, recordId);

        emit CommitmentWritten(subjectId, furnisherId, recordId, commitment, version, block.timestamp);
    }

    function latestCommitment(bytes32 subjectId, bytes32 furnisherId, bytes32 recordId)
        external
        view
        returns (bytes32 commitment, uint256 version, uint256 timestamp)
    {
        CommitmentRecord[] storage versions = _records[subjectId][furnisherId][recordId];
        if (versions.length == 0) return (bytes32(0), 0, 0);
        CommitmentRecord storage latest = versions[versions.length - 1];
        return (latest.commitment, latest.version, latest.timestamp);
    }

    function versionCount(bytes32 subjectId, bytes32 furnisherId, bytes32 recordId) external view returns (uint256) {
        return _records[subjectId][furnisherId][recordId].length;
    }
}
