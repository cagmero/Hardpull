import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lender B",
  description: "Demo lender B dashboard -- underwriting agent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
