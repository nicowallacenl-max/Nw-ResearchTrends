import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bodyshop Job Timer",
  description: "Quoted vs actual hours for every iBodyshop quote line",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
