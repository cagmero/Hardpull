import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Borrow, Repay, Liquidate, MorphoBlue } from "../../generated/MorphoBlue/MorphoBlue";
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

function loanTokenFor(morphoAddress: Address, marketId: Bytes): Bytes {
  let morpho = MorphoBlue.bind(morphoAddress);
  let result = morpho.try_idToMarketParams(marketId);
  if (result.reverted) {
    return Bytes.empty();
  }
  return result.value.loanToken;
}

export function handleMorphoBorrow(event: Borrow): void {
  let borrower = getOrCreateSubject(event.params.onBehalf, event.block.timestamp);

  let id = "MORPHO_BLUE-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let position = new CreditPosition(id);
  position.subject = borrower;
  position.protocol = "MORPHO_BLUE";
  position.principal = event.params.assets;
  position.currency = loanTokenFor(event.address, event.params.id);
  position.collateralValue = null;
  position.originatedAt = event.block.timestamp;
  position.maturityAt = null;
  position.status = "ACTIVE";
  position.isPublic = true;
  position.save();
}

export function handleMorphoRepay(event: Repay): void {
  let borrower = getOrCreateSubject(event.params.onBehalf, event.block.timestamp);

  let id = "MORPHO_BLUE-repay-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let position = new CreditPosition(id);
  position.subject = borrower;
  position.protocol = "MORPHO_BLUE";
  position.principal = event.params.assets;
  position.currency = loanTokenFor(event.address, event.params.id);
  position.collateralValue = null;
  position.originatedAt = event.block.timestamp;
  position.maturityAt = null;
  position.status = "REPAID";
  position.isPublic = true;
  position.save();
}

export function handleMorphoLiquidate(event: Liquidate): void {
  let borrower = getOrCreateSubject(event.params.borrower, event.block.timestamp);

  let id = "MORPHO_BLUE-liq-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let position = new CreditPosition(id);
  position.subject = borrower;
  position.protocol = "MORPHO_BLUE";
  position.principal = event.params.repaidAssets;
  position.currency = loanTokenFor(event.address, event.params.id);
  position.collateralValue = event.params.seizedAssets;
  position.originatedAt = event.block.timestamp;
  position.maturityAt = null;
  position.status = "LIQUIDATED";
  position.isPublic = true;
  position.save();
}
