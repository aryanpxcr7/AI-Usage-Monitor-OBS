import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Usage Monitor for OBS | Codex, Claude & Local AI Agents",
  description: "A lightweight localhost OBS Browser Source overlay for tracking Codex weekly usage, Claude session limits, model names, reset times, and local AI coding agents.",
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
