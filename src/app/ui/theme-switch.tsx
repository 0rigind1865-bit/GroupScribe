import { cookies } from 'next/headers';

export type ThemePref = 'auto' | 'light' | 'dark';
export const THEME_PREFS: ThemePref[] = ['auto', 'light', 'dark'];

/** 使用者選的外觀（theme cookie）；沒選＝自動跟系統。layout.tsx 寫進 <html data-theme-pref> */
export async function themePref(): Promise<ThemePref> {
  const v = (await cookies()).get('theme')?.value;
  return v === 'light' || v === 'dark' ? v : 'auto';
}

/** 換外觀的連結：走 /api/theme 整頁回來（soft-nav 不接手 /api/*，新外觀立刻套上）。
 *  目前選的那個由 globals.css 依 <html data-theme-pref> 標出（.theme-opt），元件不必讀 cookie */
export const themeHref = (v: ThemePref, back?: string) => `/api/theme?to=${v}${back ? `&back=${encodeURIComponent(back)}` : ''}`;

/** 外觀三選一（跟系統／淺色／深色）：管理端工具選單用的分段籤 */
export function ThemeSwitch({ title, labels }: { title: string; labels: Record<ThemePref, string> }) {
  return (
    <nav className="segmented w-full" aria-label={title}>
      {THEME_PREFS.map((v) => (
        <a key={v} href={themeHref(v)} data-v={v} className="theme-opt flex-1">
          {labels[v]}
        </a>
      ))}
    </nav>
  );
}
