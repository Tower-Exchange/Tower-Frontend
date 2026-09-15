import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Sora, Cinzel, Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import InviteGate from "@/components/InviteGate";
import ThemeScript from "@/components/ThemeScript";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { CustomRainbowKitProvider } from "@/components/providers/RainbowKitProvider";
import { SolanaWalletProvider } from "@/components/providers/SolanaWalletProvider";
const INVITE_GATE_ENABLED = process.env.NEXT_PUBLIC_INVITE_GATE_ENABLED === "true";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});
const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tower Exchange - The Native Stablecoin DEX Aggregator",
  description: "Trade Stablecoins with ease on Tower Exchange",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Tower Exchange - The Native Stablecoin DEX Aggregator",
    description: "Trade Stablecoins with ease on Tower Exchange. AI-powered DEX aggregator with portfolio management.",
    images: [
      {
        url: "/assets/og-image.png",
        width: 1200,
        height: 630,
        alt: "Tower Exchange",
      },
    ],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const appShell = (
    <div className="flex flex-col min-h-screen relative">
      <Header />
      <div className="flex-1 pt-20 min-h-0">{children}</div>
      <Footer />
    </div>
  );

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${sora.variable} ${cinzel.variable} ${inter.variable}  antialiased`} suppressHydrationWarning>
        <ThemeProvider>
          <CustomRainbowKitProvider>
            <SolanaWalletProvider>
              {INVITE_GATE_ENABLED ? <InviteGate>{appShell}</InviteGate> : appShell}
            </SolanaWalletProvider>
          </CustomRainbowKitProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
