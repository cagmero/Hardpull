import { BigInt } from "@graphprotocol/graph-ts";
import { CommitmentWritten } from "../../generated/ExposureCommitments/ExposureCommitments";
import { ContributionRecorded } from "../../generated/ReciprocityLedger/ReciprocityLedger";
import { FurnishedCommitment, Furnisher, Subject } from "../../generated/schema";

function getOrCreateFurnisher(furnisherId: string, timestamp: BigInt): Furnisher {
  let furnisher = Furnisher.load(furnisherId);
  if (furnisher == null) {
    furnisher = new Furnisher(furnisherId);
    furnisher.freshRecordCount = 0;
    furnisher.pullAllowance = 0;
    furnisher.standingUpdatedAt = timestamp;
    furnisher.save();
  }
  return furnisher as Furnisher;
}

// Indexes ExposureCommitments.CommitmentWritten -- proof a furnisher furnished *something*
// about a subject at a given time. Never has a principal/currency/terms field: the subgraph
// only ever sees keccak256(ciphertext) (docs/architecture.md #3.3, subgraph/README.md).
export function handleCommitmentWritten(event: CommitmentWritten): void {
  let subjectId = event.params.subjectId.toHexString();
  let subject = Subject.load(subjectId);
  if (subject == null) {
    subject = new Subject(subjectId);
    subject.wallets = [];
    subject.firstSeenAt = event.block.timestamp;
    subject.save();
  }

  let furnisherId = event.params.furnisherId.toHexString();
  getOrCreateFurnisher(furnisherId, event.block.timestamp);

  let id = subjectId + "-" + furnisherId + "-" + event.params.recordId.toHexString();
  let record = new FurnishedCommitment(id);
  record.subject = subjectId;
  record.furnisher = furnisherId;
  record.commitment = event.params.commitment;
  record.version = event.params.version;
  record.updatedAt = event.block.timestamp;
  record.save();
}

// Indexes ReciprocityLedger.ContributionRecorded to mirror furnishing standing. This is a
// best-effort mirror, not authoritative: the contract's freshRecordCount() applies a 30-day
// decay window computed against block.timestamp at *read* time, which a subgraph handler
// (which only fires on writes) can't replicate exactly. The API's hourly reconciliation job
// against onchain state (docs/architecture.md #3.2) is the source of truth for pull decisions.
export function handleContributionRecorded(event: ContributionRecorded): void {
  let furnisherId = event.params.furnisherId.toHexString();
  let furnisher = getOrCreateFurnisher(furnisherId, event.block.timestamp);
  furnisher.freshRecordCount = furnisher.freshRecordCount + 1;
  furnisher.standingUpdatedAt = event.block.timestamp;
  furnisher.save();
}
