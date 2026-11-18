import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tipstash — your private field guide",
  description: "A private library for practical tips, ideas, and the details worth remembering.",
  applicationName: "Tipstash",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
