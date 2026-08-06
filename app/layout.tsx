import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Usage overlay — Codex + Claude",
  description: "A compact OBS Browser Source overlay for AI usage budgets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
