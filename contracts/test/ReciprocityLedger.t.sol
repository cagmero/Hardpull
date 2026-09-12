// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReciprocityLedger} from "../src/ReciprocityLedger.sol";

contract ReciprocityLedgerTest is Test {
    ReciprocityLedger ledger;
    address exposureCommitments = address(0xC0FFEE);
    bytes32 furnisherId = keccak256("lender-a");

    function setUp() public {
        ledger = new ReciprocityLedger();
        ledger.setExposureCommitments(exposureCommitments);
    }

    function test_nonFurnisher_receivesExactlyBaseAllowance() public view {
        assertEq(ledger.pullAllowance(furnisherId), ledger.baseAllowance());
        assertEq(ledger.freshRecordCount(furnisherId), 0);
    }

    function test_allowance_risesWithFurnishing() public {
        uint256 base = ledger.pullAllowance(furnisherId);

        vm.prank(exposureCommitments);
        ledger.recordContribution(furnisherId, keccak256("record-1"));
        assertEq(ledger.pullAllowance(furnisherId), base + ledger.k());

        vm.prank(exposureCommitments);
        ledger.recordContribution(furnisherId, keccak256("record-2"));
        assertEq(ledger.pullAllowance(furnisherId), base + 2 * ledger.k());
    }

    function test_allowance_dropsAfterFreshWindowElapses() public {
        vm.prank(exposureCommitments);
        ledger.recordContribution(furnisherId, keccak256("record-1"));
        assertEq(ledger.freshRecordCount(furnisherId), 1);

        vm.warp(block.timestamp + ledger.freshWindow() + 1);
        assertEq(ledger.freshRecordCount(furnisherId), 0);
        assertEq(ledger.pullAllowance(furnisherId), ledger.baseAllowance());
    }

    function test_pruneStale_afterDecayWindow() public {
        bytes32 recordId = keccak256("record-1");
        vm.prank(exposureCommitments);
        ledger.recordContribution(furnisherId, recordId);
        assertEq(ledger.recordCount(furnisherId), 1);

        vm.expectRevert(ReciprocityLedger.NotStale.selector);
        ledger.pruneStale(furnisherId, recordId);

        vm.warp(block.timestamp + ledger.decayWindow() + 1);
        ledger.pruneStale(furnisherId, recordId);
        assertEq(ledger.recordCount(furnisherId), 0);
    }

    function test_onlyExposureCommitments_canRecordContribution() public {
        vm.expectRevert(ReciprocityLedger.NotExposureCommitments.selector);
        ledger.recordContribution(furnisherId, keccak256("record-1"));
    }

    function test_onlyOwner_canSetParameters() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(ReciprocityLedger.NotOwner.selector);
        ledger.setParameters(10, 3, 15 days, 60 days);

        ledger.setParameters(10, 3, 15 days, 60 days);
        assertEq(ledger.baseAllowance(), 10);
        assertEq(ledger.k(), 3);
        assertEq(ledger.freshWindow(), 15 days);
        assertEq(ledger.decayWindow(), 60 days);
    }

    function test_refreshingRecord_extendsFreshness() public {
        bytes32 recordId = keccak256("record-1");
        vm.prank(exposureCommitments);
        ledger.recordContribution(furnisherId, recordId);

        vm.warp(block.timestamp + ledger.freshWindow() - 1 days);
        vm.prank(exposureCommitments);
        ledger.recordContribution(furnisherId, recordId); // status-change re-furnish resets the clock

        vm.warp(block.timestamp + ledger.freshWindow() - 1 days);
        assertEq(ledger.freshRecordCount(furnisherId), 1);
    }
}
