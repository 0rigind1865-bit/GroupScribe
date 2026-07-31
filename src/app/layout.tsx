import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'GroupScribe', description: '群組工作助理 Dashboard' };

// root layout 只包 html/body：nav 與群組切換器在 (admin) 殼，讓 /login（及未來 LIFF /g/）天然在殼外
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
