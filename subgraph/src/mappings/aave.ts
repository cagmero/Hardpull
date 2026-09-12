import { Address, BigInt } from "@graphprotocol/graph-ts";
import { Borrow, Repay, LiquidationCall } from "../../generated/AaveV3Pool/AaveV3Pool";
import { CreditPosition, Subject } from "../../generated/schema";

function getOrCreateSubject(wallet: Address, timestamp: BigInt): string {
  let id = wallet.toHexString();
  let subject = Subject.load(id);
  if (subject == null) {
    subject = new Subject(id);
    subject.wallets = [wallet];
    subject.firstSeenAt = timestamp;
    subject.save();
  }
  return id;
}

export function handleAaveBorrow(event: Borrow): void {
  let borrower = getOrCreateSubject(event.params.onBehalfOf, event.block.timestamp);

  let id = "AAVE_V3-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let position = new CreditPosition(id);
  position.subject = borrower;
  position.protocol = "AAVE_V3";
  position.principal = event.params.amount;
  position.currency = event.params.reserve;
  position.collateralValue = null;
  position.originatedAt = event.block.timestamp;
  position.maturityAt = null;
  position.status = "ACTIVE";
  position.isPublic = true;
  position.save();
}

export function handleAaveRepay(event: Repay): void {
  let borrower = getOrCreateSubject(event.params.user, event.block.timestamp);

  // Aave debt is fungible per-reserve, not per-loan, so Repay doesn't map to one origination
  // record. We record it as its own REPAID entry rather than trying to net against a specific
  // Borrow -- the aggregate ACTIVE total across all of a subject's AAVE_V3 positions is what
  // the stacking rules actually consume (docs/spec.md #6.5), not any single position's lifecycle.
  let id = "AAVE_V3-repay-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let position = new CreditPosition(id);
  position.subject = borrower;
  position.protocol = "AAVE_V3";
  position.principal = event.params.amount;
  position.currency = event.params.reserve;
  position.collateralValue = null;
  position.originatedAt = event.block.timestamp;
  position.maturityAt = null;
  position.status = "REPAID";
  position.isPublic = true;
  position.save();
}

export function handleAaveLiquidation(event: LiquidationCall): void {
  let borrower = getOrCreateSubject(event.params.user, event.block.timestamp);

  let id = "AAVE_V3-liq-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let position = new CreditPosition(id);
  position.subject = borrower;
  position.protocol = "AAVE_V3";
  position.principal = event.params.debtToCover;
  position.currency = event.params.debtAsset;
  position.collateralValue = event.params.liquidatedCollateralAmount;
  position.originatedAt = event.block.timestamp;
  position.maturityAt = null;
  position.status = "LIQUIDATED";
  position.isPublic = true;
  position.save();
}
