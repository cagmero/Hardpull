// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {SubjectRegistry} from "../src/SubjectRegistry.sol";
import {FurnisherRegistry} from "../src/FurnisherRegistry.sol";
import {ReciprocityLedger} from "../src/ReciprocityLedger.sol";
import {ExposureCommitments} from "../src/ExposureCommitments.sol";
import {VerdictAttestations} from "../src/VerdictAttestations.sol";

/// @notice Deploys the five Hardpull contracts in dependency order and writes addresses to
///         docs/deployments.json (docs/plan.md T-026).
///
/// Env vars:
///   DEPLOYER_PRIVATE_KEY  - required, deployer/owner key
///   REGISTRAR_ADDRESS     - optional, defaults to deployer (the API's World ID verifier signer)
///   CRE_SIGNER_ADDRESS    - optional, defaults to deployer until the CRE workflow key exists (T-044)
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address registrar = vm.envOr("REGISTRAR_ADDRESS", deployer);
        address creSigner = vm.envOr("CRE_SIGNER_ADDRESS", deployer);

        vm.startBroadcast(deployerKey);

        SubjectRegistry subjectRegistry = new SubjectRegistry(registrar);
        FurnisherRegistry furnisherRegistry = new FurnisherRegistry();
        ReciprocityLedger reciprocityLedger = new ReciprocityLedger();
        ExposureCommitments exposureCommitments =
            new ExposureCommitments(address(subjectRegistry), address(furnisherRegistry), address(reciprocityLedger));
        reciprocityLedger.setExposureCommitments(address(exposureCommitments));
        VerdictAttestations verdictAttestations = new VerdictAttestations(creSigner);

        vm.stopBroadcast();

        console.log("SubjectRegistry:      ", address(subjectRegistry));
        console.log("FurnisherRegistry:    ", address(furnisherRegistry));
        console.log("ReciprocityLedger:    ", address(reciprocityLedger));
        console.log("ExposureCommitments:  ", address(exposureCommitments));
        console.log("VerdictAttestations:  ", address(verdictAttestations));

        string memory json = "deployments";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "SubjectRegistry", address(subjectRegistry));
        vm.serializeAddress(json, "FurnisherRegistry", address(furnisherRegistry));
        vm.serializeAddress(json, "ReciprocityLedger", address(reciprocityLedger));
        vm.serializeAddress(json, "ExposureCommitments", address(exposureCommitments));
        string memory finalJson = vm.serializeAddress(json, "VerdictAttestations", address(verdictAttestations));

        vm.writeJson(finalJson, "../docs/deployments.json");
    }
}
