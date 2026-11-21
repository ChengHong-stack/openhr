import "./globals.css";
import type { Metadata, Viewport } from "next";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: { default: config.appName, template: `%s · ${config.appName}` } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-800 antialiased">{children}</body>
    </html>
  );
}
