import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { ForegroundNotificationListener } from "@/components/ForegroundNotificationListener";
import { SilentLivePing } from "@/components/SilentLivePing";
import { GlobalSyncedClock } from "@/components/GlobalSyncedClock";
import { PwaInstallRequired } from "@/components/PwaInstallRequired";
import { BackgroundPushNotice } from "@/components/BackgroundPushNotice";
import { DeviceOnboardingGate } from "@/components/DeviceOnboardingGate";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Whiteout Rally Timer",
  description: "Arctic rally command center — coordinated multi-caller launch timers",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Whiteout Rally",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#061018",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Cache-bust so browsers/PWAs pick up the arctic brand mark after deploy */}
        <link rel="icon" href="/favicon.ico?v=arctic2" sizes="any" />
        <link rel="icon" type="image/png" href="/favicon.png?v=arctic2" sizes="32x32" />
        <link rel="icon" type="image/png" href="/icons/icon-192.png?v=arctic2" sizes="192x192" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=arctic2" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${inter.className} bg-rally-bg text-rally-text min-h-[100dvh] antialiased`}>
        <ServiceWorkerRegistrar />
        <ForegroundNotificationListener />
        <SilentLivePing />
        <GlobalSyncedClock />
        <PwaInstallRequired />
        <BackgroundPushNotice />
        <DeviceOnboardingGate />
        {children}
      </body>
    </html>
  );
}
