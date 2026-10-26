import type { Metadata } from "next";
import "./globals.css";
import { brandCss, getBranding } from "@/lib/branding";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: { default: b.appName, template: `%s · ${b.appName}` },
    description: "Company driver pickup management with QR verification",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const branding = await getBranding();
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <style dangerouslySetInnerHTML={{ __html: brandCss(branding) }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
