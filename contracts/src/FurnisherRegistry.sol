// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title FurnisherRegistry
/// @notice Registers lenders as furnishers, records their ENS subname node and CRE-encryption
///         public key, and tracks active/suspended state (docs/plan.md T-022).
contract FurnisherRegistry {
    struct Furnisher {
        bool active;
        bool suspended;
        bytes32 ensNode;
        bytes32 publicKeyX25519;
        address operator;
        uint256 registeredAt;
    }

    address public owner;

    mapping(bytes32 furnisherId => Furnisher) public furnishers;
    mapping(address operator => bytes32 furnisherId) public operatorToFurnisher;

    event FurnisherRegistered(bytes32 indexed furnisherId, address indexed operator, bytes32 ensNode);
    event PublicKeyRotated(bytes32 indexed furnisherId, bytes32 newPublicKey);
    event FurnisherSuspended(bytes32 indexed furnisherId);
    event FurnisherReactivated(bytes32 indexed furnisherId);

    error NotOwner();
    error NotOperator();
    error AlreadyRegistered();
    error OperatorAlreadyBound();
    error UnknownFurnisher();
    error ZeroValue();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function register(bytes32 furnisherId, bytes32 ensNode, bytes32 publicKey) external {
        if (furnisherId == bytes32(0) || publicKey == bytes32(0)) revert ZeroValue();
        if (furnishers[furnisherId].registeredAt != 0) revert AlreadyRegistered();
        if (operatorToFurnisher[msg.sender] != bytes32(0)) revert OperatorAlreadyBound();

        furnishers[furnisherId] = Furnisher({
            active: true,
            suspended: false,
            ensNode: ensNode,
            publicKeyX25519: publicKey,
            operator: msg.sender,
            registeredAt: block.timestamp
        });
        operatorToFurnisher[msg.sender] = furnisherId;

        emit FurnisherRegistered(furnisherId, msg.sender, ensNode);
    }

    function rotateKey(bytes32 furnisherId, bytes32 newPublicKey) external {
        if (newPublicKey == bytes32(0)) revert ZeroValue();
        if (furnishers[furnisherId].operator != msg.sender) revert NotOperator();

        furnishers[furnisherId].publicKeyX25519 = newPublicKey;
        emit PublicKeyRotated(furnisherId, newPublicKey);
    }

    function suspend(bytes32 furnisherId) external onlyOwner {
        if (furnishers[furnisherId].registeredAt == 0) revert UnknownFurnisher();
        furnishers[furnisherId].suspended = true;
        emit FurnisherSuspended(furnisherId);
    }

    function reactivate(bytes32 furnisherId) external onlyOwner {
        if (furnishers[furnisherId].registeredAt == 0) revert UnknownFurnisher();
        furnishers[furnisherId].suspended = false;
        emit FurnisherReactivated(furnisherId);
    }

    function isActive(bytes32 furnisherId) external view returns (bool) {
        Furnisher storage f = furnishers[furnisherId];
        return f.registeredAt != 0 && f.active && !f.suspended;
    }
}
