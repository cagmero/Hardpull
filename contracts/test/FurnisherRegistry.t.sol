// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FurnisherRegistry} from "../src/FurnisherRegistry.sol";

contract FurnisherRegistryTest is Test {
    FurnisherRegistry registry;
    address lenderA = address(0xA11CE);
    bytes32 furnisherId = keccak256("lender-a");

    function setUp() public {
        registry = new FurnisherRegistry();
    }

    function _register() internal {
        vm.prank(lenderA);
        registry.register(furnisherId, keccak256("lender-a.hardpull.eth"), keccak256("pubkey-1"));
    }

    function test_register_setsActiveState() public {
        _register();
        assertTrue(registry.isActive(furnisherId));
    }

    function test_rotateKey_onlyOperator() public {
        _register();

        vm.prank(lenderA);
        registry.rotateKey(furnisherId, keccak256("pubkey-2"));
        (,,, bytes32 key,,) = registry.furnishers(furnisherId);
        assertEq(key, keccak256("pubkey-2"));

        vm.prank(address(0xBAD));
        vm.expectRevert(FurnisherRegistry.NotOperator.selector);
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
        vm.prank(address(0xCAFE));
        vm.expectRevert(FurnisherRegistry.AlreadyRegistered.selector);
        registry.register(furnisherId, keccak256("other"), keccak256("pubkey-x"));
    }

    function test_unregisteredFurnisher_isNotActive() public view {
        assertFalse(registry.isActive(keccak256("nonexistent")));
    }
}
