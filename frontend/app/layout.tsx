import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "J76 IncidentMind",
  description: "The AI Engineer That Never Forgets a Problem.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
