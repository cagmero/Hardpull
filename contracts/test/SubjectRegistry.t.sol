// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SubjectRegistry} from "../src/SubjectRegistry.sol";

contract SubjectRegistryTest is Test {
    SubjectRegistry registry;
    address registrar = address(0xBEEF);
    address owner = address(this);

    function setUp() public {
        registry = new SubjectRegistry(registrar);
    }

    function test_registerSubject_bindsFirstWallet() public {
        bytes32 nullifier = keccak256("nullifier-1");
        address wallet = address(0x1);

        vm.prank(registrar);
        bytes32 subjectId = registry.registerSubject(nullifier, wallet);

        assertEq(subjectId, registry.deriveSubjectId(nullifier));
        assertTrue(registry.subjectExists(subjectId));
        assertEq(registry.walletToSubject(wallet), subjectId);
        assertEq(registry.walletsOf(subjectId).length, 1);
    }

    function test_bindWallet_addsSecondWalletToSameSubject() public {
        bytes32 nullifier = keccak256("nullifier-2");
        address walletOne = address(0x1);
        address walletTwo = address(0x2);

        vm.startPrank(registrar);
        bytes32 subjectId = registry.registerSubject(nullifier, walletOne);
        registry.bindWallet(subjectId, walletTwo);
        vm.stopPrank();

        address[] memory wallets = registry.walletsOf(subjectId);
        assertEq(wallets.length, 2);
        assertEq(wallets[0], walletOne);
        assertEq(wallets[1], walletTwo);
        assertEq(registry.walletToSubject(walletTwo), subjectId);
    }

    function test_rebindingBoundWallet_reverts() public {
        bytes32 nullifierOne = keccak256("nullifier-3");
        bytes32 nullifierTwo = keccak256("nullifier-4");
        address wallet = address(0x1);

        vm.startPrank(registrar);
        registry.registerSubject(nullifierOne, wallet);

        vm.expectRevert(SubjectRegistry.WalletAlreadyBound.selector);
        registry.registerSubject(nullifierTwo, wallet);
        vm.stopPrank();
    }

    function test_duplicateNullifier_reverts() public {
        bytes32 nullifier = keccak256("nullifier-5");

        vm.startPrank(registrar);
        registry.registerSubject(nullifier, address(0x1));

        vm.expectRevert(SubjectRegistry.DuplicateNullifier.selector);
        registry.registerSubject(nullifier, address(0x2));
        vm.stopPrank();
    }

    function test_bindWallet_unknownSubject_reverts() public {
        vm.prank(registrar);
        vm.expectRevert(SubjectRegistry.SubjectNotFound.selector);
        registry.bindWallet(bytes32(uint256(1)), address(0x1));
    }

    function test_onlyRegistrar_canRegister() public {
        vm.expectRevert(SubjectRegistry.NotRegistrar.selector);
        registry.registerSubject(keccak256("x"), address(0x1));
    }

    function test_onlyOwner_canSetRegistrar() public {
        address newRegistrar = address(0xCAFE);

        vm.prank(address(0xDEAD));
        vm.expectRevert(SubjectRegistry.NotOwner.selector);
        registry.setRegistrar(newRegistrar);

        registry.setRegistrar(newRegistrar);
        assertEq(registry.registrar(), newRegistrar);
    }
}
