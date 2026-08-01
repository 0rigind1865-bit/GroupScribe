import { cookies, headers } from 'next/headers';
import zhTW from './zh-TW.json';
import en from './en.json';
import ja from './ja.json';
import vi from './vi.json';
import id from './id.json';

// 考勤模組的多語系（零依賴，計畫第六節）：
// - MsgKey 型別來自 zh-TW.json → 漏 key 直接被 typecheck 擋下
// - 語系來源：lang cookie（/api/attend/lang 設定）→ Accept-Language 猜測 → zh-TW
// - 範圍：員工 LIFF（/a）——外籍員工是多語系的真正受眾；管理端維持中文
//   （操作者是台灣管理員；等有非中文管理員需求再擴，keys 機制是現成的）

export type MsgKey = keyof typeof zhTW;
export type Locale = 'zh-TW' | 'en' | 'ja' | 'vi' | 'id';

const DICT: Record<Locale, Record<string, string>> = { 'zh-TW': zhTW, en, ja, vi, id };

export const LOCALES: [Locale, string][] = [
  ['zh-TW', '中文'],
  ['en', 'EN'],
  ['ja', '日本語'],
  ['vi', 'Tiếng Việt'],
  ['id', 'Bahasa'],
];

const isLocale = (s: string): s is Locale => s in DICT;

/** 目前請求的語系（cookie → Accept-Language → zh-TW） */
export async function locale(): Promise<Locale> {
  const c = (await cookies()).get('lang')?.value;
  if (c && isLocale(c)) return c;
  const accept = (await headers()).get('accept-language') ?? '';
  for (const part of accept.toLowerCase().split(',')) {
    if (part.startsWith('zh')) return 'zh-TW';
    if (part.startsWith('ja')) return 'ja';
    if (part.startsWith('vi')) return 'vi';
    if (part.startsWith('id')) return 'id';
    if (part.startsWith('en')) return 'en';
  }
  return 'zh-TW';
}

/** 翻譯＋{param} 插值；缺譯回退 zh-TW（理論上不會發生——MsgKey 由 zh-TW 生成） */
export function t(loc: Locale, key: MsgKey, params?: Record<string, string | number>): string {
  let s = DICT[loc][key] ?? zhTW[key];
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** 綁定語系的翻譯函式（頁面開頭 const tt = await tr(); 之後 tt('KEY')） */
export async function tr(): Promise<(key: MsgKey, params?: Record<string, string | number>) => string> {
  const loc = await locale();
  return (key, params) => t(loc, key, params);
}
