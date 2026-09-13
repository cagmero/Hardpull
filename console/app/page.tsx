import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Hardpull Console</h1>
      <p>A confidential exposure registry for onchain credit.</p>
      <ul>
        <li>
          <Link href="/verify">Verify</Link> — bind a wallet to a subjectId with World ID
        </li>
        <li>
          <Link href="/furnish">Furnish</Link> — register as a furnisher and submit a position
        </li>
        <li>
          <Link href="/pull">Pull</Link> — request an exposure verdict for a subject
        </li>
        <li>
          <Link href="/file">Your file</Link> — grant/revoke consent, view your inquiry history
        </li>
      </ul>
    </main>
  );
}
