import type { Metadata, Viewport } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

// Fonts are self-hosted and PRELOADED at app launch by next/font (it injects
// <link rel="preload"> for the woff2 and a size-matched fallback metric) — no
// external Google Fonts request, no FOUT/fallback flicker. Exposed as CSS
// variables (--font-inter / --font-cormorant) consumed throughout globals.css.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-inter",
  display: "swap",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: "dotit — Ancient wisdom, modern problems, real answers",
  description:
    "Ancient wisdom, modern problems, real answers. Your dots were placed the moment you were born — dotit connects them.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "dotit" },
};

export const viewport: Viewport = {
  themeColor: "#0D0D0D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
