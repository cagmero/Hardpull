// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {SubjectRegistry} from "../src/SubjectRegistry.sol";
import {FurnisherRegistry} from "../src/FurnisherRegistry.sol";
import {ReciprocityLedger} from "../src/ReciprocityLedger.sol";
import {ExposureCommitments} from "../src/ExposureCommitments.sol";

contract ExposureCommitmentsTest is Test {
    SubjectRegistry subjectRegistry;
    FurnisherRegistry furnisherRegistry;
    ReciprocityLedger reciprocityLedger;
    ExposureCommitments commitments;

    address registrar = address(0xBEEF);
    address lender = address(0xA11CE);
    bytes32 furnisherId = keccak256("lender-a");
    bytes32 subjectId;

    function setUp() public {
        subjectRegistry = new SubjectRegistry(registrar);
        furnisherRegistry = new FurnisherRegistry(registrar);
        reciprocityLedger = new ReciprocityLedger();
        commitments =
            new ExposureCommitments(address(subjectRegistry), address(furnisherRegistry), address(reciprocityLedger));
        reciprocityLedger.setExposureCommitments(address(commitments));

        vm.startPrank(registrar);
        subjectId = subjectRegistry.registerSubject(keccak256("nullifier"), address(0x1));
        furnisherRegistry.register(furnisherId, bytes32(0), keccak256("pubkey"), lender);
        vm.stopPrank();
    }

    function test_writeCommitment_startsAtVersionOne() public {
        bytes32 recordId = keccak256("record-1");
        bytes32 commitment = keccak256("ciphertext-v1");

        uint256 version = commitments.writeCommitment(subjectId, furnisherId, recordId, commitment);
        assertEq(version, 1);

        (bytes32 storedCommitment, uint256 storedVersion,) =
            commitments.latestCommitment(subjectId, furnisherId, recordId);
        assertEq(storedCommitment, commitment);
        assertEq(storedVersion, 1);
    }

    function test_writeCommitment_incrementsVersionOnStatusChange() public {
        bytes32 recordId = keccak256("record-2");

        commitments.writeCommitment(subjectId, furnisherId, recordId, keccak256("v1"));
        uint256 v2 = commitments.writeCommitment(subjectId, furnisherId, recordId, keccak256("v2-repaid"));

        assertEq(v2, 2);
        assertEq(commitments.versionCount(subjectId, furnisherId, recordId), 2);

        (bytes32 latest, uint256 version,) = commitments.latestCommitment(subjectId, furnisherId, recordId);
        assertEq(latest, keccak256("v2-repaid"));
        assertEq(version, 2);
    }

    function test_writeCommitment_unknownSubject_reverts() public {
        vm.expectRevert(ExposureCommitments.UnknownSubject.selector);
        commitments.writeCommitment(keccak256("nonexistent"), furnisherId, keccak256("r"), keccak256("c"));
    }

    function test_writeCommitment_unregisteredFurnisher_reverts() public {
        vm.expectRevert(ExposureCommitments.FurnisherNotActive.selector);
        commitments.writeCommitment(subjectId, keccak256("nonexistent-furnisher"), keccak256("r"), keccak256("c"));
    }

    function test_writeCommitment_suspendedFurnisher_reverts() public {
        furnisherRegistry.suspend(furnisherId);
        vm.expectRevert(ExposureCommitments.FurnisherNotActive.selector);
        commitments.writeCommitment(subjectId, furnisherId, keccak256("r"), keccak256("c"));
    }

    function test_writeCommitment_emitsAllIndexedFields() public {
        bytes32 recordId = keccak256("record-3");
        bytes32 commitment = keccak256("ciphertext");

        vm.expectEmit(true, true, true, true);
        emit ExposureCommitments.CommitmentWritten(subjectId, furnisherId, recordId, commitment, 1, block.timestamp);
        commitments.writeCommitment(subjectId, furnisherId, recordId, commitment);
    }

    /// forge-config: default.fuzz.runs = 10000
    /// @dev T-027: the commitment event/storage shape can never carry more than
    ///      (subjectId, furnisherId, recordId, commitment, version, timestamp) -- no plaintext
    ///      position field (principal, rate, maturity) exists on this contract to leak.
    function testFuzz_commitmentNeverExposesMoreThanCommitmentFields(bytes32 recordId, bytes32 commitment) public {
        vm.recordLogs();
        commitments.writeCommitment(subjectId, furnisherId, recordId, commitment);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == ExposureCommitments.CommitmentWritten.selector) {
                found = true;
                // 4 topics: event sig + 3 indexed (subjectId, furnisherId, recordId)
                assertEq(logs[i].topics.length, 4);
                // data: commitment (bytes32) + version (uint256) + timestamp (uint256) = 96 bytes, nothing more
                assertEq(logs[i].data.length, 96);
            }
        }
        assertTrue(found);
    }
}
