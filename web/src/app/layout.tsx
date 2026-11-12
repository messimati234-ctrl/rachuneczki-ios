import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rachuneczki — wspólne wydatki",
  description: "Dzielcie wspólne wydatki, sprawdzajcie saldo i rozliczajcie się bez wysiłku.",
  applicationName: "Rachuneczki",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Rachuneczki" },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-1024.png", apple: "/icon-1024.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b7857",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
