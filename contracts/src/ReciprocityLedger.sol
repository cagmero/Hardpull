// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title ReciprocityLedger
/// @notice Tracks fresh furnished-record counts per furnisher and computes pull allowance
///         (spec.md #6.7). pullAllowance = BASE_ALLOWANCE + freshRecordCount * K, where "fresh"
///         means contributed to within freshWindow (default 30d). A record untouched for
///         decayWindow (default 90d) can be pruned by anyone, freeing it from bookkeeping.
contract ReciprocityLedger {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    address public owner;
    address public exposureCommitments;

    uint256 public baseAllowance = 5;
    uint256 public k = 2;
    uint256 public freshWindow = 30 days;
    uint256 public decayWindow = 90 days;

    mapping(bytes32 furnisherId => EnumerableSet.Bytes32Set) private _records;
    mapping(bytes32 furnisherId => mapping(bytes32 recordId => uint256 lastTouchedAt)) public lastTouchedAt;
    mapping(bytes32 furnisherId => uint256 timestamp) public standingUpdatedAt;

    event ContributionRecorded(bytes32 indexed furnisherId, bytes32 indexed recordId, uint256 timestamp);
    event RecordPruned(bytes32 indexed furnisherId, bytes32 indexed recordId);
    event ParametersUpdated(uint256 baseAllowance, uint256 k, uint256 freshWindow, uint256 decayWindow);
    event ExposureCommitmentsSet(address indexed exposureCommitments);

    error NotOwner();
    error NotExposureCommitments();
    error ZeroAddress();
    error NotStale();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @dev One-time wiring after ExposureCommitments is deployed (constructor-order circular
    ///      dependency between the two contracts). Owner-only, callable again only to rotate.
    function setExposureCommitments(address _exposureCommitments) external onlyOwner {
        if (_exposureCommitments == address(0)) revert ZeroAddress();
        exposureCommitments = _exposureCommitments;
        emit ExposureCommitmentsSet(_exposureCommitments);
    }

    function setParameters(uint256 _baseAllowance, uint256 _k, uint256 _freshWindow, uint256 _decayWindow)
        external
        onlyOwner
    {
        baseAllowance = _baseAllowance;
        k = _k;
        freshWindow = _freshWindow;
        decayWindow = _decayWindow;
        emit ParametersUpdated(_baseAllowance, _k, _freshWindow, _decayWindow);
    }

    function recordContribution(bytes32 furnisherId, bytes32 recordId) external {
        if (msg.sender != exposureCommitments) revert NotExposureCommitments();

        _records[furnisherId].add(recordId);
        lastTouchedAt[furnisherId][recordId] = block.timestamp;
        standingUpdatedAt[furnisherId] = block.timestamp;

        emit ContributionRecorded(furnisherId, recordId, block.timestamp);
    }

    /// @notice Permissionlessly removes a record untouched for longer than decayWindow.
    function pruneStale(bytes32 furnisherId, bytes32 recordId) external {
        uint256 touched = lastTouchedAt[furnisherId][recordId];
        if (touched == 0 || block.timestamp - touched <= decayWindow) revert NotStale();

        _records[furnisherId].remove(recordId);
        delete lastTouchedAt[furnisherId][recordId];

        emit RecordPruned(furnisherId, recordId);
    }

    function freshRecordCount(bytes32 furnisherId) public view returns (uint256 count) {
        bytes32[] memory recordIds = _records[furnisherId].values();
        for (uint256 i = 0; i < recordIds.length; i++) {
            if (block.timestamp - lastTouchedAt[furnisherId][recordIds[i]] <= freshWindow) {
                count++;
            }
        }
    }

    function pullAllowance(bytes32 furnisherId) external view returns (uint256) {
        return baseAllowance + freshRecordCount(furnisherId) * k;
    }

    function recordCount(bytes32 furnisherId) external view returns (uint256) {
        return _records[furnisherId].length();
    }
}
