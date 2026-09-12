import { Address, BigInt } from "@graphprotocol/graph-ts";
import { InstanceDeployed } from "../../generated/MapleLoanFactory/MapleLoanFactory";
import { Funded, PaymentMade, LoanClosed, MapleLoan as MapleLoanContract } from "../../generated/templates/MapleLoan/MapleLoan";
import { MapleLoan } from "../../generated/templates";
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

// Each Maple loan is deployed as its own proxy instance -- there is no fixed loan address to
// index ahead of time. This spins up a MapleLoan template data source per deployed loan
// (docs/plan.md T-033, docs/subgraph/README.md "Note on the two manifests").
export function handleMapleLoanDeployed(event: InstanceDeployed): void {
  MapleLoan.create(event.params.instance_);
}

export function handleMapleFunded(event: Funded): void {
  let loan = MapleLoanContract.bind(event.address);
  let borrowerResult = loan.try_borrower();
  if (borrowerResult.reverted) {
    return; // partial ABI coverage is acceptable for Maple (docs/plan.md T-033)
  }
  let borrower = getOrCreateSubject(borrowerResult.value, event.block.timestamp);

  let id = "MAPLE-" + event.address.toHexString();
  let position = new CreditPosition(id);
  position.subject = borrower;
  position.protocol = "MAPLE";
  position.principal = event.params.amount_;
  position.currency = event.address; // Maple loans are single-asset per loan contract
  position.collateralValue = null;
  position.originatedAt = event.block.timestamp;
  position.maturityAt = event.params.nextPaymentDueDate_;
  position.status = "ACTIVE";
  position.isPublic = true;
  position.save();
}

export function handleMaplePaymentMade(event: PaymentMade): void {
  // Payments reduce the loan's outstanding balance but the position record (keyed by loan
  // address) stays ACTIVE until LoanClosed -- Maple doesn't emit the new outstanding balance
  // in PaymentMade, only the amounts paid this cycle, so we don't overwrite `principal` here.
}

export function handleMapleLoanClosed(event: LoanClosed): void {
  let id = "MAPLE-" + event.address.toHexString();
  let position = CreditPosition.load(id);
  if (position == null) {
    return;
  }
  position.status = "REPAID";
  position.save();
}
