import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { Remount, SoftNav } from './ui/soft-nav';

// 分享預覽（LINE／FB 貼連結時的卡片）：圖片要絕對網址，所以 metadataBase 依請求網址算。
// APP_BASE_URL 優先（容器在代理後面，host 不一定是公開網址）。
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const base =
    process.env.APP_BASE_URL?.replace(/\/$/, '') ||
    `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'}`;
  const description = '把群記邀進 LINE 工作群，它會安靜地把對話整理成行程、待辦和公告。';
  return {
    metadataBase: new URL(base),
    title: { default: '群記 GroupScribe', template: '%s · 群記' },
    description,
    openGraph: { siteName: '群記', locale: 'zh_TW', type: 'website', title: '群記：群裡講過的，都記得', description, images: ['/brand/og.png'] },
  };
}

// 手機瀏覽器網址列／PWA 標題列顏色，跟頁面底色一致（亮：象牙底 gray-50，暗：globals.css 的 body 底色）
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f4ee' },
    { media: '(prefers-color-scheme: dark)', color: '#111613' },
  ],
};

// root layout 只包 html/body：nav 與群組切換器在 (admin) 殼，讓 /login（及未來 LIFF /g/）天然在殼外
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {/* 換頁、送出表單都不整頁重載（src/app/ui/soft-nav.tsx）；換頁完成時 Remount 重建內容區，表單狀態不殘留 */}
        <Remount>{children}</Remount>
        <SoftNav />
        {/* 全站唯一的 client 增強（原生 JS，不引套件）：
            1. 表單送出後按鈕轉圈＋鎖住（防連點）；樣式在 globals.css 的 .is-submitting
            2. 身分列選單的「關閉」與目前那列：只收合，不導頁——<details> 零 JS 關不掉，
               連結本身只是沒有 JS 時的退路（T10 第 1 輪：原本會跳回工具首頁、丟掉 ?month／?emp） */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "addEventListener('submit',e=>{const f=e.target;if(!(f instanceof HTMLFormElement)||e.defaultPrevented)return;f.classList.add('is-submitting');e.submitter&&e.submitter.classList.add('is-clicked')});" +
              "addEventListener('click',e=>{const a=e.target instanceof Element&&e.target.closest('.id-close,.id-row[aria-current]');if(!a)return;e.preventDefault();a.closest('details')?.removeAttribute('open')})",
          }}
        />
      </body>
    </html>
  );
}
