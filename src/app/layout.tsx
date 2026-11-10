import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "リペアコール", template: "%s | リペアコール" },
  description: "マツエクサロン向け 再来店自動化サービス",
  appleWebApp: { capable: true, title: "リペアコール", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#c22f69",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
