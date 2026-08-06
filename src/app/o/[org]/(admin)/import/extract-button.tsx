'use client';

import { usePathname } from 'next/navigation';

import { useRef, useState } from 'react';

// 抽取按鈕＋即時進度：POST /api/extract 期間每 2 秒輪詢 GET /api/extract 的未提取數畫進度條。
// 完成後接著自動更新「群組理解」（產業/術語/案子摘要，注入後續抽取與回答的 prompt）。
type Stats = { processed: number; created: number; updated: number; skipped: number; deduped: number };

export function ExtractButton({ groupId, pending }: { groupId: string; pending: number }) {
  // 多租戶：從 pathname 取 org 前綴（/o/[org]/...），連結補回前綴
  const base = usePathname().match(/^\/o\/[^/]+/)?.[0] ?? '';
  const [phase, setPhase] = useState<'idle' | 'extract' | 'profile' | 'done' | 'error'>('idle');
  const [left, setLeft] = useState(pending);
  const [stats, setStats] = useState<Stats | null>(null);
  const [profileOk, setProfileOk] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function run() {
    setPhase('extract');
    timer.current = setInterval(async () => {
      const r = await fetch(`/api/extract?group_id=${encodeURIComponent(groupId)}`).catch(() => null);
      if (r?.ok) setLeft((await r.json()).pending);
    }, 2000);
    try {
      const fd = new FormData();
      fd.set('group_id', groupId);
      const res = await fetch('/api/extract', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr: ({ group_id: string } & Stats)[] = await res.json();
      if (timer.current) clearInterval(timer.current);
      const s = arr[0] ?? null;
      setStats(s);
      setLeft(0);

      // 只有真的處理過訊息才更新群組理解；撞鎖跳過（processed=0，另一抽取進行中）
      // 不觸發——那時 events/tasks 只完成一半，會寫入半成品又白燒一次 LLM
      if (s && s.processed > 0) {
        setPhase('profile');
        const p = await fetch('/api/profile', { method: 'POST', body: fd }).catch(() => null);
        setProfileOk(!!p?.ok);
      }
      setPhase('done');
    } catch {
      if (timer.current) clearInterval(timer.current);
      setPhase('error');
    }
  }

  if (phase === 'idle')
    return (
      <button className="btn-primary" onClick={run}>
        抽取事件／待辦（{pending} 則）
      </button>
    );

  if (phase === 'extract' || phase === 'profile') {
    const done = Math.max(0, pending - left);
    const pct = pending ? Math.round((done / pending) * 100) : 100;
    return (
      <div className="w-full max-w-sm space-y-1 text-sm">
        <p className="text-gray-600">
          {phase === 'extract' ? `抽取中… ${done}/${pending} 則（${pct}%）` : '整理群組理解中…（產業/術語/案子摘要）'}
        </p>
        <div className="h-2 overflow-hidden rounded bg-gray-200">
          <div
            className="h-full rounded bg-emerald-500 transition-all duration-700"
            style={{ width: `${phase === 'profile' ? 100 : pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (phase === 'error')
    return (
      <p className="text-sm text-red-700">
        抽取失敗，請稍後再試（伺服器 log 有詳情）。
        <button className="ml-2 underline" onClick={run}>
          重試
        </button>
      </p>
    );

  // done
  const zero = stats && stats.processed === 0 && pending > 0;
  return (
    <div className="space-y-1 text-sm">
      {zero ? (
        <p className="text-amber-700">
          沒有可提取的訊息——可能已在別處提取完成，或另一個抽取正在進行中。
          <a className="ml-1 underline" href={`${base}/import`}>重新整理查看最新狀態</a>
        </p>
      ) : (
        <p>
          <strong>✅ 抽取完成：</strong>處理 {stats?.processed ?? 0} 則，新增 {stats?.created ?? 0} 筆、更新{' '}
          {stats?.updated ?? 0} 筆{stats?.skipped ? `、略過過期 ${stats.skipped} 筆` : ''}
          {stats?.deduped ? `、略過重複 ${stats.deduped} 筆` : ''}。
          {!profileOk && <span className="text-amber-700">（群組理解更新失敗——可能尚未執行 migration 004）</span>}
        </p>
      )}
      <p className="text-gray-500">
        查看：<a className="text-emerald-700 underline" href={base || '/'}>總覽</a>｜
        <a className="text-emerald-700 underline" href={`${base}/calendar`}>月曆</a>｜
        <a className="text-emerald-700 underline" href={`${base}/tasks`}>待辦</a>
      </p>
    </div>
  );
}
