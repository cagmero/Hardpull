// One-time setup: creates the HCS topic Hardpull logs every inquiry to (docs/plan.md T-062).
// Run with: DOTENV / real HEDERA_OPERATOR_* env vars set, then:
//   pnpm --filter @hardpull/api exec tsx src/scripts/create-hcs-topic.ts
import { Client, PrivateKey, AccountId, TopicCreateTransaction } from "@hiero-ledger/sdk";

async function main() {
  const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    throw new Error("Set HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY first");
  }

  const client = Client.forTestnet().setOperator(AccountId.fromString(accountId), PrivateKey.fromStringECDSA(privateKey));
  try {
    const response = await new TopicCreateTransaction({
      topicMemo: "hardpull.v1 inquiry log",
    }).execute(client);
    const receipt = await response.getReceipt(client);
    console.log(`HEDERA_HCS_TOPIC_ID=${receipt.topicId?.toString()}`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
