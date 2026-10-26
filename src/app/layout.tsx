import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PickupQR",
  description: "Company driver pickup management with QR verification",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
