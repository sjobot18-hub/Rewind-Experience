import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Rewind Experience — Event Finance System",
  description: "Event management and finance system for The Rewind Experience",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
