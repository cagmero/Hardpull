// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title FurnisherRegistry
/// @notice Registers lenders as furnishers, records their ENS subname node and CRE-encryption
///         public key, and tracks active/suspended state (docs/plan.md T-022).
/// @dev Registrar-gated, mirroring SubjectRegistry -- the Hardpull API relays every write here on
///      a furnisher's behalf (furnishers authenticate to the API with client credentials, not by
///      holding Sepolia gas or an RPC connection of their own). `operator` is therefore
///      descriptive data, not an msg.sender-based access-control key: an earlier version of this
///      contract checked `operatorToFurnisher[msg.sender]`, which broke the moment a second
///      furnisher registered, since msg.sender was always the API's relayer address.
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
    address public registrar;

    mapping(bytes32 furnisherId => Furnisher) public furnishers;
    mapping(address operator => bytes32 furnisherId) public operatorToFurnisher;

    event FurnisherRegistered(bytes32 indexed furnisherId, address indexed operator, bytes32 ensNode);
    event PublicKeyRotated(bytes32 indexed furnisherId, bytes32 newPublicKey);
    event FurnisherSuspended(bytes32 indexed furnisherId);
    event FurnisherReactivated(bytes32 indexed furnisherId);
    event RegistrarUpdated(address indexed newRegistrar);

    error NotOwner();
    error NotRegistrar();
    error AlreadyRegistered();
    error OperatorAlreadyBound();
    error UnknownFurnisher();
    error ZeroValue();
    error ZeroAddress();

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

    function register(bytes32 furnisherId, bytes32 ensNode, bytes32 publicKey, address operator)
        external
        onlyRegistrar
    {
        if (furnisherId == bytes32(0) || publicKey == bytes32(0) || operator == address(0)) {
            revert ZeroValue();
        }
        if (furnishers[furnisherId].registeredAt != 0) revert AlreadyRegistered();
        if (operatorToFurnisher[operator] != bytes32(0)) revert OperatorAlreadyBound();

        furnishers[furnisherId] = Furnisher({
            active: true,
            suspended: false,
            ensNode: ensNode,
            publicKeyX25519: publicKey,
            operator: operator,
            registeredAt: block.timestamp
        });
        operatorToFurnisher[operator] = furnisherId;

        emit FurnisherRegistered(furnisherId, operator, ensNode);
    }

    function rotateKey(bytes32 furnisherId, bytes32 newPublicKey) external onlyRegistrar {
        if (newPublicKey == bytes32(0)) revert ZeroValue();
        if (furnishers[furnisherId].registeredAt == 0) revert UnknownFurnisher();

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
