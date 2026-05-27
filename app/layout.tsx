import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InnerZenith",
  description: "A quiet place to be seen clearly.",
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
