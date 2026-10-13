import type { Metadata } from "next";
import { Albert_Sans, Inter } from "next/font/google";
import "./globals.css";

const albert = Albert_Sans({
  variable: "--next-font-albert",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--next-font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Civic Radar",
  description: "Keeping busy people up to date on legislative bills.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${albert.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-black font-albert text-white">{children}</body>
    </html>
  );
}