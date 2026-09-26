'use client';

import { useState } from 'react';
import { Icon } from '@/expense/icons';
import type { CategoryItem } from '@/expense/categories';
import { PAY_METHODS } from '@/expense/receipt';
import { fmtHM, fmtMD, fmtMoney, itemTime, type ExpenseItem } from '@/expense/types';
import { Empty } from '@/app/ui/empty';
import { Badge } from '@/app/ui/badge';
import { Lightbox, Sheet } from '@/app/ui/expense/sheet';

// 我的清單（從 Snaptab ListView／EditExpenseModal 搬來）：依案場分組＋小計，組照最新一筆排、組內新到舊。
// 點一列開編輯；已被管理者標「已報帳」的鎖定（多人共用下，改了會讓會計對不上帳）。
const PAY_TONE: Record<string, string> = { 代墊: 'bg-amber-100 text-amber-900', 公司卡: 'bg-sky-100 text-sky-900', 現金: 'bg-emerald-100 text-emerald-900' };

export function ListView({
  items,
  categories,
  projects,
  onToast,
  onChanged,
}: {
  items: ExpenseItem[];
  categories: CategoryItem[];
  projects: string[];
  onToast: (m: string) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const icon = (name: string) => categories.find((c) => c.name === name)?.icon ?? 'tag';

  if (!items.length) return <Empty title="還沒有任何紀錄" hint="到「記一筆」記第一筆，或把收據拍照私訊給群記。" />;

  const sorted = [...items].sort((a, b) => itemTime(b) - itemTime(a));
  const groups = new Map<string, ExpenseItem[]>();
  for (const e of sorted) groups.set(e.project || '未分類', [...(groups.get(e.project || '未分類') ?? []), e]);

  return (
    <div className="space-y-4">
      {[...groups].map(([name, rows]) => (
        <section key={name}>
          <p className="mb-1.5 flex items-baseline text-sm font-medium text-gray-600">
            <span className="text-base font-semibold text-gray-900">{name}</span>
            <span className="ml-auto tabular-nums">
              {rows.length} 筆・${fmtMoney(rows.reduce((a, r) => a + r.amount, 0))}
            </span>
          </p>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditing(r)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditing(r)}
                  className={`card flex cursor-pointer items-center gap-3 ${r.reimbursed ? 'opacity-60' : ''}`}
                >
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-gray-100 text-gray-700">
                    <Icon name={icon(r.category)} size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.category}</span>
                    {(r.note || r.vendor) && <span className="block truncate text-sm text-gray-600">{r.note || r.vendor}</span>}
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                      <span className={`rounded px-1.5 py-0.5 ${PAY_TONE[r.pay_method] ?? 'bg-gray-100 text-gray-700'}`}>{r.pay_method}</span>
                      <span>
                        {fmtMD(r)} {fmtHM(r)}
                        {r.place_name ? `・${r.place_name}` : ''}
                      </span>
                      {r.photo && (
                        <button
                          type="button"
                          aria-label="看收據照片"
                          className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPhoto(r.photo);
                          }}
                        >
                          <Icon name="image" size={14} />
                        </button>
                      )}
                    </span>
                  </span>
                  <span className="flex flex-none flex-col items-end gap-1">
                    <span className="text-lg font-semibold tabular-nums">{fmtMoney(r.amount)}</span>
                    {r.reimbursed && <Badge tone="ok">已報帳</Badge>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {editing && (
        <EditSheet
          item={editing}
          categories={categories}
          projects={projects}
          onToast={onToast}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      {photo && <Lightbox url={photo} onClose={() => setPhoto(null)} />}
    </div>
  );
}

/** ISO → datetime-local 的值（台北時間） */
function toLocalInput(e: ExpenseItem): string {
  if (!e.spent_at) return `${e.spent_on}T12:00`;
  const s = new Date(e.spent_at).toLocaleString('sv', { timeZone: 'Asia/Taipei' }); // 2026-09-26 18:05:00
  return s.slice(0, 16).replace(' ', 'T');
}

function EditSheet({
  item,
  categories,
  projects,
  onToast,
  onClose,
  onDone,
}: {
  item: ExpenseItem;
  categories: CategoryItem[];
  projects: string[];
  onToast: (m: string) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(item.amount));
  const [category, setCategory] = useState(item.category);
  const [project, setProject] = useState(item.project);
  const [pay, setPay] = useState(item.pay_method);
  const [dt, setDt] = useState(toLocalInput(item));
  const [note, setNote] = useState(item.note);
  const [place, setPlace] = useState(item.place_name);
  const [invoiceNo, setInvoiceNo] = useState(item.invoice_no);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = item.reimbursed;
  const names = categories.map((c) => c.name);

  const send = async (fd: FormData, okMsg: string) => {
    setBusy(true);
    const r = await fetch('/api/liff/expense/mine', { method: 'POST', body: fd })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: '沒有網路' }));
    setBusy(false);
    if (!r.ok) return onToast(`✗ ${r.error ?? '更新失敗'}`);
    onToast(okMsg);
    onDone();
  };
  const save = () => {
    if (!(Number(amount) > 0)) return onToast('金額要大於 0');
    const at = new Date(`${dt}:00+08:00`); // 輸入的是台北時間
    const fd = new FormData();
    fd.set('id', item.id);
    fd.set('action', 'save');
    Object.entries({ amount, category, project, pay_method: pay, note, place_name: place, invoice_no: invoiceNo, vendor: item.vendor }).forEach(([k, v]) => fd.set(k, v));
    if (Number.isFinite(at.getTime())) fd.set('spent_at', at.toISOString());
    if (removePhoto) fd.set('remove_photo', '1');
    send(fd, '✓ 已更新');
  };
  const remove = () => {
    if (!window.confirm('刪除這筆紀錄？刪了就救不回來。')) return;
    const fd = new FormData();
    fd.set('id', item.id);
    fd.set('action', 'delete');
    send(fd, '✓ 已刪除');
  };

  const label = 'mt-3 mb-1 block text-xs text-gray-500';
  return (
    <Sheet title={locked ? '已報帳的紀錄' : '編輯紀錄'} onClose={onClose} action={<button type="button" className="btn btn-sm" onClick={onClose}>取消</button>}>
      {locked && <p className="mb-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">管理者已標記「已報帳」，不能再修改。有問題請找管理者。</p>}
      <fieldset disabled={locked || busy}>
        <label className={label}>金額</label>
        <input className="input w-full tabular-nums" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <label className={label}>分類</label>
        <select className="input w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
          {(names.includes(category) ? names : [category, ...names]).map((c) => (
            <option key={c} value={c}>
              {c}
              {names.includes(c) ? '' : '（已刪）'}
            </option>
          ))}
        </select>
        <label className={label}>案場／專案</label>
        <select className="input w-full" value={project} onChange={(e) => setProject(e.target.value)}>
          {(project && !projects.includes(project) ? [project, ...projects] : projects).map((p) => (
            <option key={p}>{p}</option>
          ))}
          {!project && <option value="">（未填）</option>}
        </select>
        <label className={label}>付款方式</label>
        <div className="flex rounded-lg border border-gray-200 p-0.5 text-sm">
          {PAY_METHODS.map((p) => (
            <button type="button" key={p} onClick={() => setPay(p)} className={`flex-1 rounded-md py-1.5 ${pay === p ? 'bg-emerald-600 text-white' : 'text-gray-600'}`}>
              {p}
            </button>
          ))}
        </div>
        <label className={label}>日期時間</label>
        <input className="input w-full" type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} />
        <label className={label}>備註</label>
        <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註（選填）" />
        <label className={label}>地點</label>
        <input className="input w-full" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="地點（選填）" />
        <label className={label}>發票號碼</label>
        <input className="input w-full" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value.toUpperCase())} placeholder="發票號碼（選填）" />
      </fieldset>
      {item.photo && !removePhoto && (
        <>
          <label className={label}>收據照片</label>
          <div className="flex items-end gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.photo} alt="收據照片" className="h-24 w-24 cursor-pointer rounded-lg object-cover" onClick={() => setShowPhoto(true)} />
            {!locked && (
              <button type="button" className="btn btn-sm" onClick={() => setRemovePhoto(true)}>
                移除
              </button>
            )}
          </div>
        </>
      )}
      {item.photo && removePhoto && (
        <button type="button" className="mt-3 text-sm text-amber-700 underline" onClick={() => setRemovePhoto(false)}>
          照片會在儲存後移除（點這裡復原）
        </button>
      )}
      {!locked && (
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn" onClick={remove} disabled={busy}>
            <Icon name="trash" size={16} />
            刪除
          </button>
          <button type="button" className="btn-primary flex-1" onClick={save} disabled={busy}>
            {busy ? '…' : '儲存'}
          </button>
        </div>
      )}
      {showPhoto && item.photo && <Lightbox url={item.photo} onClose={() => setShowPhoto(false)} />}
    </Sheet>
  );
}
