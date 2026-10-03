import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ライズ・ナレッジ",
  description: "rise tech solutions 社内ナレッジ共有サイト",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
