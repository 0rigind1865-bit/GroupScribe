// 前端（員工 App、後台分析）共用的一筆報帳形狀：伺服器整理好、照片已換成 1 小時簽名網址
export type ExpenseItem = {
  id: string;
  amount: number;
  category: string;
  note: string;
  vendor: string;
  project: string;
  pay_method: string;
  invoice_no: string;
  spent_on: string; // YYYY-MM-DD
  spent_at: string | null; // ISO；舊資料或還沒貼 migration 027 時為 null
  place_name: string;
  reimbursed: boolean;
  photo: string | null;
  person: string;
};

/** 排序與顯示用的時間（ms）：有精確時間用它，否則用日期中午 */
export const itemTime = (e: Pick<ExpenseItem, 'spent_at' | 'spent_on'>) =>
  e.spent_at ? Date.parse(e.spent_at) : Date.parse(`${e.spent_on}T12:00:00+08:00`);

const TZ = { timeZone: 'Asia/Taipei' } as const;
export const fmtMoney = (n: number) => n.toLocaleString('en-US');
export const fmtMD = (e: Pick<ExpenseItem, 'spent_on'>) => `${Number(e.spent_on.slice(5, 7))}/${Number(e.spent_on.slice(8, 10))}`;
export const fmtHM = (e: Pick<ExpenseItem, 'spent_at'>) =>
  e.spent_at ? new Date(e.spent_at).toLocaleTimeString('zh-TW', { ...TZ, hour: '2-digit', minute: '2-digit', hour12: false }) : '';
