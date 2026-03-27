import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const ibmMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "RT Countdown",
  description: "Pick movies. Subtract their RT scores. Hit exactly zero.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${ibmMono.variable} font-sans bg-neutral-950 text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
