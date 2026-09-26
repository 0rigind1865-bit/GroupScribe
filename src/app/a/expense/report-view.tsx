'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/expense/icons';
import type { CategoryItem } from '@/expense/categories';
import { fmtHM, fmtMoney, itemTime, type ExpenseItem } from '@/expense/types';
import { toCsv } from '@/expense/csv';
import { Empty } from '@/app/ui/empty';

// 報帳（從 Snaptab ReportView 搬來）：選案場 → 依分類加總（照分類設定的順序）→ 合計、代墊請款／公司卡核銷 → 匯出。
// 匯出維持 CSV（使用者 2026-09-26 決定，不加 Excel 套件）；檔案在手機上直接產生，不經伺服器。
export function ReportView({ items, categories, onToast }: { items: ExpenseItem[]; categories: CategoryItem[]; onToast: (m: string) => void }) {
  const projects = useMemo(() => {
    const latest = new Map<string, number>();
    for (const e of items) if (e.project) latest.set(e.project, Math.max(latest.get(e.project) ?? 0, itemTime(e)));
    return [...latest].sort((a, b) => b[1] - a[1]).map(([p]) => p); // 最近有花費的案場在前
  }, [items]);
  const [picked, setPicked] = useState('');
  const current = picked || projects[0] || '';
  const rows = items.filter((e) => e.project === current).sort((a, b) => itemTime(b) - itemTime(a));

  const order = (name: string) => {
    const i = categories.findIndex((c) => c.name === name);
    return i < 0 ? 9999 : i; // 已刪的分類排最後
  };
  const byCat = new Map<string, number>();
  for (const e of rows) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  const catRows = [...byCat].sort((a, b) => order(a[0]) - order(b[0]));
  const sum = (p?: string) => rows.filter((e) => !p || e.pay_method === p).reduce((a, e) => a + e.amount, 0);

  const exportCsv = () => {
    if (!rows.length) return onToast('這個案場還沒有紀錄');
    const csv = toCsv(rows, { includePerson: false });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    const stamp = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' }).replace(/-/g, '');
    a.href = url;
    a.download = `報帳_${current}_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast('📤 已匯出');
  };

  if (!projects.length) return <Empty title="還沒有任何案場的紀錄" />;
  return (
    <div className="space-y-3">
      <select className="input w-full" value={current} onChange={(e) => setPicked(e.target.value)}>
        {projects.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <section className="card">
        <ul className="divide-y divide-gray-100 text-sm">
          {catRows.map(([name, amt]) => (
            <li key={name} className="flex items-center gap-2 py-2">
              <Icon name={categories.find((c) => c.name === name)?.icon ?? 'tag'} size={17} />
              <span className="flex-1">{name}</span>
              <span className="tabular-nums">{fmtMoney(amt)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-baseline border-t border-gray-200 pt-2">
          <span className="font-semibold">合計</span>
          <span className="ml-auto text-3xl font-black tabular-nums" style={{ fontFamily: 'var(--font-title)' }}>${fmtMoney(sum())}</span>
        </p>
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-gray-600">
          <span>代墊請款 ${fmtMoney(sum('代墊'))}</span>
          <span>公司卡核銷 ${fmtMoney(sum('公司卡'))}</span>
          {sum('現金') > 0 && <span>現金 ${fmtMoney(sum('現金'))}</span>}
        </p>
      </section>
      <button type="button" className="btn-primary h-12 w-full text-base" onClick={exportCsv} disabled={!rows.length}>
        <Icon name="download" size={18} />
        匯出報帳清單（CSV，Excel 可開）
      </button>
      <p className="text-center text-xs text-gray-500">
        {rows.length} 筆・最近一筆 {rows[0] ? `${rows[0].spent_on} ${fmtHM(rows[0])}` : ''}
      </p>
    </div>
  );
}
