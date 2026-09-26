'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/expense/icons';
import type { CategoryItem } from '@/expense/categories';
import { CategoryManager } from '@/app/ui/expense/category-manager';
import { Toast } from '@/app/ui/expense/sheet';

// 後台分類頁：列出目前分類（含圖示），按「管理分類」開同一個管理面板（員工 App 的管理者用的也是它）
export function ManageCategories({ slug, items, defaults }: { slug: string; items: CategoryItem[]; defaults: CategoryItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState('');
  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 1800);
  };
  const reset = async () => {
    if (!window.confirm('恢復成預設的六個分類？已經記過的舊資料會保留原本的分類名稱。')) return;
    const r = await fetch('/api/expense/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ org: slug, items: defaults }),
    }).then((x) => x.json());
    say(r.ok ? '✓ 已恢復預設' : `✗ ${r.error ?? '失敗'}`);
    router.refresh();
  };
  return (
    <>
      <ul className="card divide-y divide-gray-100">
        {items.map((c) => (
          <li key={c.name} className="flex items-center gap-3 py-2">
            <Icon name={c.icon} size={20} />
            {c.name}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          管理分類
        </button>
        <button type="button" className="btn" onClick={reset}>
          恢復預設
        </button>
      </div>
      {open && (
        <CategoryManager initial={items} endpoint="/api/expense/categories" org={slug} onSaved={() => router.refresh()} onClose={() => setOpen(false)} onToast={say} />
      )}
      <Toast msg={toast} />
    </>
  );
}
