import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local AI usage overlay",
  description: "A minimal localhost OBS overlay for Codex and Claude usage.",
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
