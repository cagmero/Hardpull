// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title SubjectRegistry
/// @notice Maps a World ID nullifier hash to a subjectId and binds wallets to it.
/// @dev World ID proofs are verified off-chain by the API against Worldcoin's cloud verify
///      endpoint (docs/plan.md T-070). This contract only records the outcome, gated to a
///      single registrar address the API controls -- it does not re-verify Semaphore proofs
///      on-chain. subjectId = keccak256(nullifierHash ++ "hardpull.v1") (spec.md #4.1).
contract SubjectRegistry {
    address public owner;
    address public registrar;

    mapping(bytes32 nullifierHash => bytes32 subjectId) public nullifierToSubject;
    mapping(bytes32 subjectId => bool exists) public subjectExists;
    mapping(address wallet => bytes32 subjectId) public walletToSubject;
    mapping(bytes32 subjectId => address[] wallets) private _subjectWallets;

    event SubjectRegistered(bytes32 indexed subjectId, bytes32 indexed nullifierHash, address indexed wallet);
    event WalletBound(bytes32 indexed subjectId, address indexed wallet);
    event RegistrarUpdated(address indexed newRegistrar);

    error NotOwner();
    error NotRegistrar();
    error ZeroAddress();
    error DuplicateNullifier();
    error WalletAlreadyBound();
    error SubjectNotFound();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRegistrar() {
        if (msg.sender != registrar) revert NotRegistrar();
        _;
    }

    constructor(address _registrar) {
        if (_registrar == address(0)) revert ZeroAddress();
        owner = msg.sender;
        registrar = _registrar;
    }

    function setRegistrar(address newRegistrar) external onlyOwner {
        if (newRegistrar == address(0)) revert ZeroAddress();
        registrar = newRegistrar;
        emit RegistrarUpdated(newRegistrar);
    }

    function deriveSubjectId(bytes32 nullifierHash) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(nullifierHash, "hardpull.v1"));
    }

    /// @notice Registers a new subject from a verified World ID nullifier and binds its first wallet.
    function registerSubject(bytes32 nullifierHash, address wallet) external onlyRegistrar returns (bytes32 subjectId) {
        if (wallet == address(0)) revert ZeroAddress();
        if (nullifierToSubject[nullifierHash] != bytes32(0)) revert DuplicateNullifier();
        if (walletToSubject[wallet] != bytes32(0)) revert WalletAlreadyBound();

        subjectId = deriveSubjectId(nullifierHash);
        nullifierToSubject[nullifierHash] = subjectId;
        subjectExists[subjectId] = true;
        walletToSubject[wallet] = subjectId;
        _subjectWallets[subjectId].push(wallet);

        emit SubjectRegistered(subjectId, nullifierHash, wallet);
        emit WalletBound(subjectId, wallet);
    }

    /// @notice Binds an additional wallet to an already-registered subject. A wallet may only
    ///         ever bind to one subject -- rebinding is rejected, not overwritten.
    function bindWallet(bytes32 subjectId, address wallet) external onlyRegistrar {
        if (wallet == address(0)) revert ZeroAddress();
        if (!subjectExists[subjectId]) revert SubjectNotFound();
        if (walletToSubject[wallet] != bytes32(0)) revert WalletAlreadyBound();

        walletToSubject[wallet] = subjectId;
        _subjectWallets[subjectId].push(wallet);
        emit WalletBound(subjectId, wallet);
    }

    function walletsOf(bytes32 subjectId) external view returns (address[] memory) {
        return _subjectWallets[subjectId];
    }
}
