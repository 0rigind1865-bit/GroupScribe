import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { themePref } from './ui/theme-switch';
import './globals.css';
import { locale, t } from '@/attend/i18n';
import { Remount, SoftNavClient } from './ui/soft-nav';

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

// 全站換頁＋送出結果提示條（src/app/ui/soft-nav.tsx）。提示條的幾句固定字在這裡依語系翻好再交給 client 元件：
// 它也接手員工端（/a）的表單，外籍員工看到的「連線中斷…」「知道了」要跟頁面同一種語言。
// 不會多出成本：上面 generateMetadata 已讀 headers()，每一頁本來就是動態渲染
async function SoftNav() {
  const loc = await locale();
  return (
    <SoftNavClient
      text={{
        dismiss: t(loc, 'SOFTNAV_DISMISS'),
        done: t(loc, 'SOFTNAV_DONE'),
        failed: t(loc, 'SOFTNAV_FAILED'),
        offline: t(loc, 'SOFTNAV_OFFLINE'),
      }}
    />
  );
}

// root layout 只包 html/body：nav 與群組切換器在 (admin) 殼，讓 /login（及未來 LIFF /g/）天然在殼外
export default async function RootLayout({ children }: { children: ReactNode }) {
  // 外觀：選了淺色／深色就由伺服器直接寫上（不閃）；自動＝畫面出來前由下面的小腳本照系統寫上，系統切換時跟著換。
  // suppressHydrationWarning：自動時 data-theme 是腳本加的，跟伺服器輸出不同是預期的
  const theme = await themePref();
  return (
    <html lang="zh-Hant" data-theme={theme === 'auto' ? undefined : theme} data-theme-pref={theme} suppressHydrationWarning>
      <head>
        {theme === 'auto' && (
          <script
            dangerouslySetInnerHTML={{
              __html:
                "(()=>{const d=document.documentElement,m=matchMedia('(prefers-color-scheme: dark)'),f=()=>{d.dataset.theme=m.matches?'dark':'light'};f();m.addEventListener('change',f)})()",
            }}
          />
        )}
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {/* 換頁、送出表單都不整頁重載（src/app/ui/soft-nav.tsx）；換頁完成時 Remount 重建內容區，表單狀態不殘留 */}
        <Remount>{children}</Remount>
        <SoftNav />
        {/* 全站唯一的 client 增強（原生 JS，不引套件）：
            1. 表單送出後按鈕轉圈＋鎖住（防連點）；樣式在 globals.css 的 .is-submitting
            2. 身分列選單的「關閉」與目前那列：只收合，不導頁——<details> 零 JS 關不掉，
               連結本身只是沒有 JS 時的退路（T10 第 1 輪：原本會跳回工具首頁、丟掉 ?month／?emp）
            3. Esc 收合身分列選單與情境膠囊（群組／員工），焦點還給按鈕（焦點原本在選單裡或沒有焦點時）。
               注音選字中按 Esc 是取消組字，不收選單：isComposing，Safari 組字結束那一下只剩 keyCode 229；
               別人先吃掉（preventDefault）的 Esc——例如先關最上層的抽屜——這裡就不再收 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "addEventListener('submit',e=>{const f=e.target;if(!(f instanceof HTMLFormElement)||e.defaultPrevented)return;f.classList.add('is-submitting');e.submitter&&e.submitter.classList.add('is-clicked')});" +
              "addEventListener('click',e=>{const a=e.target instanceof Element&&e.target.closest('.id-close,.id-row[aria-current]');if(!a)return;e.preventDefault();a.closest('details')?.removeAttribute('open')});" +
              "addEventListener('keydown',e=>{if(e.key!=='Escape'||e.isComposing||e.keyCode===229||e.defaultPrevented)return;const a=document.activeElement;document.querySelectorAll('.id-menu[open]>summary,details[open]>.ctx-pill').forEach(s=>{const d=s.parentElement;d.removeAttribute('open');if(!a||a===document.body||d.contains(a))s.focus()})})",
          }}
        />
      </body>
    </html>
  );
}
