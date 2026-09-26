// 全站唯一的路由表（取代原本散在五處的定義：BottomNav / TopNav / MORE_PATHS /
// more 頁的 ENTRIES / attend layout 的 tabs）。
//
// docs/plan.md:118 的紀律：「nav 連結做成陣列常數，未來加頁＝加一行」——
// 五份表意味著加一頁要改五處，遲早會漏。現在三個消費者（TopNav / BottomNav / more 頁）
// 全部從這裡推導。
//
// path 一律是模組內相對路徑，由 module.base(slug) 或 oh() 補上 /o/<slug>。

export type BadgeKey = 'pending' | 'reviews' | 'pendingEmps';
export type ModuleId = 'gs' | 'attend' | 'expense';

export type NavItem = {
  key: string; // 穩定 id（active 判斷與測試錨點；不隨 label 改動）
  path: string; // 模組內相對路徑；'' = 模組首頁
  label: string;
  desc: string; // 只有 /more 用得到
  icon: React.ReactNode;
  primary?: boolean; // true → 進手機底部 tab 的前四格
  badge?: BadgeKey;
};

export type ModuleDef = {
  id: ModuleId;
  label: string; // 工作區切換器上的名字
  base: (slug: string) => string;
  ctxParam: 'group' | 'emp' | null; // 換頁要保留的 context 參數
  items: NavItem[];
};

const I = {
  today: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M12 14h.01" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13l3-8h12l3 8v6H3z" />
      <path d="M3 13h5l2 3h4l2-3h5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M9 13h.01M14 13h.01M9 17h.01M14 17h.01" />
    </>
  ),
  tasks: (
    <>
      <path d="M4 6l2 2 3-3M4 12l2 2 3-3M4 18l2 2 3-3" />
      <path d="M12 7h9M12 13h9M12 19h9" />
    </>
  ),
  notes: <path d="M4 4h16v12H8l-4 4z" />,
  files: (
    <>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v4h4" />
    </>
  ),
  groups: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M21 20c0-2.5-1.8-4.5-4-4.9" />
    </>
  ),
  import: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 21h16" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.2" />
    </>
  ),
  check: <path d="M4 12l5 5L20 6" />,
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </>
  ),
  rules: (
    <>
      <path d="M4 6h16M4 12h16M4 18h10" />
      <circle cx="18" cy="18" r="2.5" />
    </>
  ),
};

export const GS_MODULE: ModuleDef = {
  id: 'gs',
  label: '群組助理',
  base: (slug) => `/o/${slug}`,
  ctxParam: 'group',
  items: [
    { key: 'today', path: '', label: '今天', desc: '本週行程與到期待辦', icon: I.today, primary: true },
    { key: 'inbox', path: '/inbox', label: '收件匣', desc: 'AI 抽取待你確認的項目', icon: I.inbox, primary: true, badge: 'pending' },
    { key: 'calendar', path: '/calendar', label: '月曆', desc: '行程的月／週／日檢視', icon: I.calendar, primary: true },
    { key: 'tasks', path: '/tasks', label: '待辦', desc: '群組交辦的事情', icon: I.tasks, primary: true },
    { key: 'notes', path: '/notes', label: '公告 / 決議', desc: '群組裡拍板的規則與宣布', icon: I.notes },
    { key: 'files', path: '/files', label: '檔案', desc: '圖片與文件，依類型/專案分類', icon: I.files },
    { key: 'groups', path: '/groups', label: '群組', desc: '群組名稱、分類與資料管理', icon: I.groups },
    { key: 'import', path: '/import', label: '匯入', desc: '把既有的 LINE 聊天記錄匯進來', icon: I.import },
    { key: 'settings', path: '/settings', label: '設定', desc: '進群告知、AI 模型與用量', icon: I.settings },
  ],
};

export const ATTEND_MODULE: ModuleDef = {
  id: 'attend',
  label: '考勤',
  base: (slug) => `/o/${slug}/attend`,
  ctxParam: 'emp',
  items: [
    { key: 'overview', path: '', label: '總覽', desc: '待處理事項與本月異常', icon: I.clock, primary: true },
    { key: 'employees', path: '/employees', label: '員工', desc: '啟用、月薪、部門與管理權', icon: I.people, primary: true, badge: 'pendingEmps' },
    { key: 'reviews', path: '/reviews', label: '審核', desc: '員工送出的補卡申請', icon: I.check, primary: true, badge: 'reviews' },
    { key: 'report', path: '/report', label: '報表', desc: '月曆、工時與薪資明細', icon: I.chart, primary: true },
    { key: 'locations', path: '/locations', label: '打卡地點', desc: 'GPS 座標與允許半徑', icon: I.pin },
    { key: 'rules', path: '/rules', label: '薪資規則', desc: '倍率、休息時段與假日表', icon: I.rules },
  ],
};

// 報帳（X1，整合 Snaptab）：員工私訊群記收據照 → 自動記一筆；管理者在這裡看、補專案、標已報帳、匯出
export const EXPENSE_MODULE: ModuleDef = {
  id: 'expense',
  label: '報帳',
  base: (slug) => `/o/${slug}/expense`,
  ctxParam: null,
  items: [
    { key: 'list', path: '', label: '清單', desc: '員工私訊的收據，標已報帳', icon: I.receipt, primary: true },
    { key: 'report', path: '/report', label: '報帳', desc: '依專案或月份加總、匯出 CSV', icon: I.chart, primary: true },
    { key: 'stats', path: '/stats', label: '統計', desc: '每月合計、月份×分類、專案×人', icon: I.chart },
    { key: 'categories', path: '/categories', label: '分類', desc: '報帳分類的名稱與順序', icon: I.rules },
  ],
};

export const MODULES: ModuleDef[] = [GS_MODULE, ATTEND_MODULE, EXPENSE_MODULE];

/** 依 id 取模組定義（nav、頂欄共用；取代各處的三元判斷） */
export const moduleById = (id: ModuleId): ModuleDef => MODULES.find((m) => m.id === id) ?? GS_MODULE;

/** 手機底部 tab：primary 四格 ＋ 有非 primary 項時合成一格「更多」 */
export function bottomItems(m: ModuleDef): NavItem[] {
  const primary = m.items.filter((i) => i.primary);
  const rest = m.items.filter((i) => !i.primary);
  if (!rest.length) return primary;
  return [...primary, { key: 'more', path: '/more', label: '更多', desc: '', icon: I.more }];
}

/** /more 頁列出的項目＝沒進底部 tab 的那些 */
export const moreItems = (m: ModuleDef): NavItem[] => m.items.filter((i) => !i.primary);

/** 從 pathname 反查所屬模組（client 端 nav 用；有子路徑前綴的模組先比對） */
export function moduleOf(pathname: string): ModuleDef {
  if (/^\/o\/[^/]+\/attend(\/|$)/.test(pathname)) return ATTEND_MODULE;
  if (/^\/o\/[^/]+\/expense(\/|$)/.test(pathname)) return EXPENSE_MODULE;
  return GS_MODULE;
}
