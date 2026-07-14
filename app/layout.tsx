import type { Metadata } from "next";
import { Shippori_Mincho_B1, Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";

// Display: a festival-poster serif. UI: a rounded, friendly, frog-like sans.
const shippori = Shippori_Mincho_B1({
  variable: "--font-shippori",
  weight: ["600", "700", "800"],
  subsets: ["latin"],
});

const zenMaru = Zen_Maru_Gothic({
  variable: "--font-zen",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Frog Board",
  description: "Hop to it: sign up to help, no account needed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${shippori.variable} ${zenMaru.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
