import { Client, PrivateKey, AccountId, TopicId, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";

// Immutable inquiry audit log on Hedera Consensus Service (docs/spec.md #6.8,
// docs/plan.md T-062). Every pull is logged here regardless of verdict.

function hederaClient(): Client {
  const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    throw new Error("HEDERA_OPERATOR_ACCOUNT_ID / HEDERA_OPERATOR_PRIVATE_KEY not set");
  }
  return Client.forTestnet().setOperator(AccountId.fromString(accountId), PrivateKey.fromStringECDSA(privateKey));
}

export interface InquiryLogEntry {
  inquiryId: string;
  subjectIdHash: string;
  pullerHash: string;
  verdict: string;
  timestamp: string;
}

export interface InquiryLogResult {
  sequenceNumber: number;
  topicId: string;
}

// message payload is exactly the five hashed/enumerable fields spec.md #6.8 allows -- no
// furnisher identity, no amounts, no PII of any kind.
export async function submitInquiryLog(entry: InquiryLogEntry): Promise<InquiryLogResult> {
  const topicIdStr = process.env.HEDERA_HCS_TOPIC_ID;
  if (!topicIdStr) throw new Error("HEDERA_HCS_TOPIC_ID not set");

  const client = hederaClient();
  try {
    const message = JSON.stringify(entry);
    const response = await new TopicMessageSubmitTransaction({
      topicId: TopicId.fromString(topicIdStr),
      message,
    }).execute(client);
    const receipt = await response.getReceipt(client);

    return {
      sequenceNumber: receipt.topicSequenceNumber?.toNumber() ?? 0,
      topicId: topicIdStr,
    };
  } finally {
    client.close();
  }
}
