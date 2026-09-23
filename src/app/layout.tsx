import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'GroupScribe', description: '群組工作助理 Dashboard' };

// root layout 只包 html/body：nav 與群組切換器在 (admin) 殼，讓 /login（及未來 LIFF /g/）天然在殼外
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {children}
        {/* 全站唯一的 client 增強：表單送出後按鈕轉圈＋鎖住（防連點）。純 CSS 做不到「已送出」狀態，
            所以用 3 行原生 JS，不引任何套件；樣式在 globals.css 的 .is-submitting */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "addEventListener('submit',e=>{const f=e.target;if(!(f instanceof HTMLFormElement)||e.defaultPrevented)return;f.classList.add('is-submitting');e.submitter&&e.submitter.classList.add('is-clicked')})",
          }}
        />
      </body>
    </html>
  );
}
