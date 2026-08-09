import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { ForegroundNotificationListener } from "@/components/ForegroundNotificationListener";

export const metadata: Metadata = {
  title: "Whiteout Rally Timer",
  description: "Server-authoritative rally timer for Whiteout Survival",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Rally Timer",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0e17",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="bg-rally-bg text-rally-text min-h-screen antialiased">
        <ServiceWorkerRegistrar />
        <ForegroundNotificationListener />
        {children}
      </body>
    </html>
  );
}
