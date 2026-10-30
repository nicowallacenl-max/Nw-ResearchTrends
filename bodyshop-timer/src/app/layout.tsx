import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bodyshop Job Timer",
  description: "Quoted vs actual hours for every iBodyshop quote line",
  appleWebApp: { capable: true, title: "Job Board", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
