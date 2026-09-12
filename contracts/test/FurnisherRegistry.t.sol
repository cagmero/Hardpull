// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FurnisherRegistry} from "../src/FurnisherRegistry.sol";

contract FurnisherRegistryTest is Test {
    FurnisherRegistry registry;
    address registrar = address(0xBEEF);
    address lenderA = address(0xA11CE);
    bytes32 furnisherId = keccak256("lender-a");

    function setUp() public {
        registry = new FurnisherRegistry(registrar);
    }

    function _register() internal {
        vm.prank(registrar);
        registry.register(furnisherId, keccak256("lender-a.hardpull.eth"), keccak256("pubkey-1"), lenderA);
    }

    function test_register_setsActiveState() public {
        _register();
        assertTrue(registry.isActive(furnisherId));
    }

    function test_register_onlyRegistrar() public {
        vm.prank(lenderA);
        vm.expectRevert(FurnisherRegistry.NotRegistrar.selector);
        registry.register(furnisherId, bytes32(0), keccak256("pubkey-1"), lenderA);
    }

    function test_register_recordsOperatorAsData_notMsgSender() public {
        _register();
        (,,,, address operator,) = registry.furnishers(furnisherId);
        assertEq(operator, lenderA);
        assertEq(registry.operatorToFurnisher(lenderA), furnisherId);
    }

    function test_secondFurnisher_byDifferentOperator_succeeds() public {
        _register();

        address lenderB = address(0xB0B);
        bytes32 furnisherIdB = keccak256("lender-b");
        vm.prank(registrar);
        registry.register(furnisherIdB, keccak256("lender-b.hardpull.eth"), keccak256("pubkey-2"), lenderB);

        assertTrue(registry.isActive(furnisherIdB));
    }

    function test_rotateKey_onlyRegistrar() public {
        _register();

        vm.prank(registrar);
        registry.rotateKey(furnisherId, keccak256("pubkey-2"));
        (,,, bytes32 key,,) = registry.furnishers(furnisherId);
        assertEq(key, keccak256("pubkey-2"));

        vm.prank(address(0xBAD));
        vm.expectRevert(FurnisherRegistry.NotRegistrar.selector);
        registry.rotateKey(furnisherId, keccak256("pubkey-3"));
    }

    function test_suspend_blocksActiveCheck() public {
        _register();
        registry.suspend(furnisherId);
        assertFalse(registry.isActive(furnisherId));

        registry.reactivate(furnisherId);
        assertTrue(registry.isActive(furnisherId));
    }

    function test_suspend_onlyOwner() public {
        _register();
        vm.prank(address(0xBAD));
        vm.expectRevert(FurnisherRegistry.NotOwner.selector);
        registry.suspend(furnisherId);
    }

    function test_doubleRegister_reverts() public {
        _register();
        vm.prank(registrar);
        vm.expectRevert(FurnisherRegistry.AlreadyRegistered.selector);
        registry.register(furnisherId, keccak256("other"), keccak256("pubkey-x"), address(0xCAFE));
    }

    function test_operatorAlreadyBound_reverts() public {
        _register();
        vm.prank(registrar);
        vm.expectRevert(FurnisherRegistry.OperatorAlreadyBound.selector);
        registry.register(keccak256("lender-a-again"), bytes32(0), keccak256("pubkey-2"), lenderA);
    }

    function test_unregisteredFurnisher_isNotActive() public view {
        assertFalse(registry.isActive(keccak256("nonexistent")));
    }
}
