import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "@/app/globals.css";
import { AppShell } from "@/components/app-shell";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const grotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-grotesk" });

export const metadata: Metadata = {
  title: "Eye of Zuck — Biblioteca viral",
  description: "Biblioteca IG-only para agencias OFM: ranking por data real, vault de winners e custo sempre visivel.",
  icons: { icon: "/logo.png" },
};

export const viewport: Viewport = {
  themeColor: "#05070f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${grotesk.variable}`}>
      <body className="app-body">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
