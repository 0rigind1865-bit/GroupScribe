import { fmtHM, itemTime, type ExpenseItem } from './types';

// 報帳 CSV（欄位照 Snaptab lib/export.ts）：員工 App 在手機產生、後台匯出路由也用同一份。
// UTF-8 BOM＋CRLF，Excel 直接開不亂碼。表尾：合計＋代墊請款＋公司卡核銷＋現金（>0 才列）。
const esc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (...cells: unknown[]) => cells.map(esc).join(',');

export function toCsv(items: ExpenseItem[], opts: { includePerson: boolean }): string {
  const sorted = [...items].sort((a, b) => itemTime(b) - itemTime(a)); // 新到舊（同 Snaptab）
  const head = ['日期', '時間', '分類', '店家', '用途', '金額', '付款方式', '發票號碼', '案場', '地點', '報帳狀態', ...(opts.includePerson ? ['人'] : [])];
  const lines = [row(...head)];
  for (const e of sorted)
    lines.push(
      row(e.spent_on.replace(/-/g, '/'), fmtHM(e), e.category, e.vendor, e.note, e.amount, e.pay_method, e.invoice_no, e.project, e.place_name, e.reimbursed ? '已報帳' : '未報帳', ...(opts.includePerson ? [e.person] : [])),
    );
  const sum = (p?: string) => sorted.filter((e) => !p || e.pay_method === p).reduce((a, e) => a + e.amount, 0);
  lines.push('', row('合計', '', '', '', '', sum()));
  for (const [label, p] of [['代墊請款', '代墊'], ['公司卡核銷', '公司卡'], ['現金', '現金']] as const) if (sum(p) > 0) lines.push(row(label, '', '', '', '', sum(p)));
  return '﻿' + lines.join('\r\n');
}
