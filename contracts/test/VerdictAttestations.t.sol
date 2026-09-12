// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {VerdictAttestations} from "../src/VerdictAttestations.sol";

contract VerdictAttestationsTest is Test {
    VerdictAttestations attestations;
    uint256 creSignerKey = 0xA11CE;
    address creSigner;

    function setUp() public {
        creSigner = vm.addr(creSignerKey);
        attestations = new VerdictAttestations(creSigner);
    }

    function _sign(bytes32 verdictHash) internal view returns (bytes memory) {
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(verdictHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(creSignerKey, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    function test_attest_storesAndVerifies() public {
        bytes32 inquiryId = keccak256("inquiry-1");
        bytes32 verdictHash = keccak256("verdict-payload-1");
        bytes memory signature = _sign(verdictHash);

        attestations.attest(inquiryId, verdictHash, signature);

        assertTrue(attestations.verify(inquiryId, verdictHash));
        assertFalse(attestations.verify(inquiryId, keccak256("wrong-hash")));
    }

    function test_attest_invalidSignature_reverts() public {
        bytes32 inquiryId = keccak256("inquiry-2");
        bytes32 verdictHash = keccak256("verdict-payload-2");

        uint256 wrongKey = 0xBAD;
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(verdictHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, ethSignedHash);
        bytes memory badSignature = abi.encodePacked(r, s, v);

        vm.expectRevert(VerdictAttestations.InvalidSignature.selector);
        attestations.attest(inquiryId, verdictHash, badSignature);
    }

    function test_attest_duplicateInquiryId_reverts() public {
        bytes32 inquiryId = keccak256("inquiry-3");
        bytes32 verdictHash = keccak256("verdict-payload-3");
        attestations.attest(inquiryId, verdictHash, _sign(verdictHash));

        vm.expectRevert(VerdictAttestations.AlreadyAttested.selector);
        attestations.attest(inquiryId, verdictHash, _sign(verdictHash));
    }

    function test_verify_unknownInquiry_returnsFalse() public view {
        assertFalse(attestations.verify(keccak256("nonexistent"), keccak256("hash")));
    }

    /// @dev Anyone -- not just the API -- can independently re-verify a verdict's signature
    ///      on-chain, per docs/architecture.md #2.1 "publicly re-verifiable".
    function test_verify_isCallableByAnyone() public {
        bytes32 inquiryId = keccak256("inquiry-4");
        bytes32 verdictHash = keccak256("verdict-payload-4");
        attestations.attest(inquiryId, verdictHash, _sign(verdictHash));

        vm.prank(address(0xDEAD));
        assertTrue(attestations.verify(inquiryId, verdictHash));
    }
}
