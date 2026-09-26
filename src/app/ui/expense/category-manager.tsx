'use client';

import { useState } from 'react';
import { CATEGORY_ICONS, Icon } from '@/expense/icons';
import type { CategoryItem } from '@/expense/categories';
import { Sheet } from './sheet';

// 分類管理（從 Snaptab CategoryManager 搬來）：換圖示、改名、刪除、新增、上下移動排序。
// 全公司共用一份，所以只有管理者看得到。endpoint：員工 App 用 /api/liff/expense/categories，後台用 /api/expense/categories。
export function CategoryManager({
  initial,
  endpoint,
  org,
  onSaved,
  onClose,
  onToast,
}: {
  initial: CategoryItem[];
  endpoint: string;
  org?: string; // 後台要帶 org slug
  onSaved: (items: CategoryItem[]) => void;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const [items, setItems] = useState(initial);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('tag');
  const [pickingFor, setPickingFor] = useState<number | null>(null); // 正在替哪一列挑圖示
  const [busy, setBusy] = useState(false);

  const add = () => {
    const name = newName.trim().slice(0, 10);
    if (!name) return onToast('請輸入分類名稱');
    if (items.some((i) => i.name === name)) return onToast('已經有這個分類');
    setItems([...items, { name, icon: newIcon }]);
    setNewName('');
    setNewIcon('tag');
  };
  const rename = (i: number) => {
    const name = window.prompt('分類名稱（改名不會改到已記的舊資料）', items[i].name)?.trim().slice(0, 10);
    if (name && name !== items[i].name && !items.some((x) => x.name === name)) setItems(items.map((x, j) => (j === i ? { ...x, name } : x)));
  };
  const remove = (i: number) => {
    if (items[i].name === '雜支') return onToast('「雜支」是讀不出分類時的歸處，不能刪');
    if (window.confirm(`刪除分類「${items[i].name}」？\n已經記過的舊資料會保留原本的分類名稱。`)) setItems(items.filter((_, j) => j !== i));
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };
  const pickIcon = (key: string) => {
    if (pickingFor === null) return setNewIcon(key);
    setItems(items.map((x, j) => (j === pickingFor ? { ...x, icon: key } : x)));
    setPickingFor(null);
  };
  const save = async () => {
    setBusy(true);
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ org, items }),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: '沒有網路' }));
    setBusy(false);
    if (!r.ok) return onToast(`✗ ${r.error ?? '儲存失敗'}`);
    onToast('✓ 分類已更新');
    onSaved(items);
    onClose();
  };
  const selected = pickingFor === null ? newIcon : items[pickingFor]?.icon;

  return (
    <Sheet
      title="管理分類"
      onClose={onClose}
      action={
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          {busy ? '儲存中…' : '儲存'}
        </button>
      }
    >
      <ul className="space-y-1.5">
        {items.map((c, i) => (
          <li key={c.name} className="flex items-center gap-2">
            <button
              type="button"
              aria-label="換圖示"
              onClick={() => setPickingFor(pickingFor === i ? null : i)}
              className={`grid h-10 w-10 flex-none place-items-center rounded-lg border ${pickingFor === i ? 'border-emerald-600' : 'border-gray-200'}`}
            >
              <Icon name={c.icon} size={20} />
            </button>
            <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => rename(i)}>
              {c.name}
            </button>
            <button type="button" aria-label="上移" className="btn btn-sm" onClick={() => move(i, -1)}>
              ↑
            </button>
            <button type="button" aria-label="下移" className="btn btn-sm" onClick={() => move(i, 1)}>
              ↓
            </button>
            <button type="button" aria-label="刪除" className="btn btn-sm" onClick={() => remove(i)}>
              <Icon name="trash" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          aria-label="新分類的圖示"
          onClick={() => setPickingFor(null)}
          className={`grid h-10 w-10 flex-none place-items-center rounded-lg border ${pickingFor === null ? 'border-emerald-600' : 'border-gray-200'}`}
        >
          <Icon name={newIcon} size={20} />
        </button>
        <input
          className="input min-w-0 flex-1"
          placeholder="新分類名稱"
          value={newName}
          maxLength={10}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button type="button" className="btn" onClick={add}>
          ＋
        </button>
      </div>
      <p className="mt-3 mb-1 text-xs text-gray-500">{pickingFor === null ? '新分類的圖示' : `選圖示給「${items[pickingFor]?.name}」`}</p>
      <div className="grid grid-cols-6 gap-1.5">
        {CATEGORY_ICONS.map((it) => (
          <button
            type="button"
            key={it.key}
            aria-label={it.label}
            title={it.label}
            onClick={() => pickIcon(it.key)}
            className={`grid h-10 place-items-center rounded-lg border ${selected === it.key ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200'}`}
          >
            <Icon name={it.key} size={20} />
          </button>
        ))}
      </div>
    </Sheet>
  );
}
