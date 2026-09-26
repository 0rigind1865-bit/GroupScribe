'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FloatingNav } from '@/app/ui/floating-nav';
import { Icon } from '@/expense/icons';
import type { CategoryItem } from '@/expense/categories';
import type { ExpenseItem } from '@/expense/types';
import { dataUrlToBlob } from '@/expense/compress';
import { flushOutbox, readOutbox } from '@/expense/outbox';
import { Sheet, Toast } from '@/app/ui/expense/sheet';
import { CategoryManager } from '@/app/ui/expense/category-manager';
import { AnalyticsView } from '@/app/ui/expense/analytics-view';
import { AddView, type Loc } from './add-view';
import { ListView } from './list-view';
import { ReportView } from './report-view';

// 我的報帳 App 外殼（從 Snaptab AppShell 搬來）：四個分頁（記一筆／清單／報帳／分析）、自動定位＋附近地點、
// 小提示、離線暫存自動補送。分頁用 ?tab=，但四個分頁同時掛著只切顯示——記到一半切去看清單，回來金額還在。
export type Tab = 'add' | 'list' | 'report' | 'analytics';
const TABS: [Tab, string, string][] = [
  ['add', '記一筆', 'edit'],
  ['list', '清單', 'list'],
  ['report', '報帳', 'receipt'],
  ['analytics', '分析', 'chart'],
];
const WEEK = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const NEARBY_MONTHLY = 500; // 每支手機每月最多查幾次附近地點（伺服器另有全站上限）

async function lookupNearby(lat: number, lng: number): Promise<string[]> {
  const key = `gs-nearby:${new Date().toISOString().slice(0, 7)}`;
  const cacheKey = `gs-nearby-cache:${lat.toFixed(4)},${lng.toFixed(4)}`; // 約 11 公尺內不重查
  try {
    const hit = sessionStorage.getItem(cacheKey);
    if (hit) return JSON.parse(hit);
    if (Number(localStorage.getItem(key) ?? 0) >= NEARBY_MONTHLY) return [];
    const r = await fetch(`/api/liff/expense/nearby?lat=${lat}&lng=${lng}`);
    const j = r.ok ? await r.json() : { candidates: [] };
    localStorage.setItem(key, String(Number(localStorage.getItem(key) ?? 0) + 1));
    sessionStorage.setItem(cacheKey, JSON.stringify(j.candidates ?? []));
    return j.candidates ?? [];
  } catch {
    return [];
  }
}

export function ExpenseApp({
  tab,
  header,
  canManage,
  categories: initialCats,
  projects: initialProjects,
  items,
  hasNearby,
}: {
  tab: Tab;
  header: React.ReactNode;
  canManage: boolean;
  categories: CategoryItem[];
  projects: string[];
  items: ExpenseItem[];
  hasNearby: boolean;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCats);
  const [projects, setProjects] = useState(initialProjects);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loc, setLoc] = useState<Loc | null>(null);
  const [locating, setLocating] = useState(true);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [showPlaces, setShowPlaces] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => setCategories(initialCats), [initialCats]);
  useEffect(() => setProjects((p) => [...new Set([...initialProjects, ...p])]), [initialProjects]);

  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1800);
  }, []);

  // 離線暫存補送：打開時、恢復網路時各試一次
  const flush = useCallback(async () => {
    if (!readOutbox().length || !navigator.onLine) return setPending(readOutbox().length);
    const before = readOutbox().length;
    const left = await flushOutbox(async (p) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(p.fields)) fd.set(k, v);
      if (p.photo) fd.set('photo', await dataUrlToBlob(p.photo), 'receipt.jpg');
      const r = await fetch('/api/liff/expense/add', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      return r.ok && !!j.ok;
    });
    setPending(left);
    if (left < before) {
      showToast(`✓ 補送了 ${before - left} 筆離線記的帳`);
      router.refresh();
    }
  }, [router, showToast]);

  useEffect(() => {
    flush();
    window.addEventListener('online', flush);
    // 離線開啟（Service Worker）：只在正式環境註冊，範圍限定報帳頁
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator)
      navigator.serviceWorker.register('/expense-sw.js', { scope: '/a/expense' }).catch(() => {});
    return () => window.removeEventListener('online', flush);
  }, [flush]);

  // 打開就定位；有設 Google 金鑰才查附近地點，自動帶最近的（已手動選過就不覆蓋）
  useEffect(() => {
    if (!navigator.geolocation) return setLocating(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setLoc((p) => ({ lat, lng, placeName: p?.placeName ?? '' }));
        setLocating(false);
        if (hasNearby)
          lookupNearby(lat, lng).then((c) => {
            if (!c.length) return;
            setCandidates(c);
            setLoc((p) => (p?.placeName ? p : { lat, lng, placeName: c[0] }));
          });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [hasNearby]);

  const pickPlace = (name: string) => {
    setLoc((p) => ({ lat: p?.lat ?? null, lng: p?.lng ?? null, placeName: name }));
    setShowPlaces(false);
  };
  const manualPlace = () => {
    const name = window.prompt('輸入地點名稱（例如：中油 鼎金站）', loc?.placeName ?? '');
    if (name !== null) pickPlace(name.trim().slice(0, 60));
  };

  const now = new Date();
  const title = tab === 'add' ? `${now.getMonth() + 1}月${now.getDate()}日 ${WEEK[now.getDay()]}` : tab === 'list' ? '代墊與核銷' : tab === 'report' ? '匯出報帳單' : '花費分析';
  const locText = locating ? '定位中…' : loc?.placeName || (loc?.lat != null ? '已定位・點此選地點' : '點此輸入地點');
  const icons = Object.fromEntries(categories.map((c) => [c.name, c.icon]));

  return (
    <main className="mx-auto max-w-md p-4">
      <div className="mb-2">{header}</div>
      <header className="mb-3 flex items-end gap-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{TABS.find(([k]) => k === tab)?.[1]}</p>
          <h1 className="truncate">{title}</h1>
        </div>
        {tab === 'add' && (
          <button type="button" onClick={() => setShowPlaces(true)} className="ml-auto flex max-w-[55%] items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs">
            <span className={`h-2 w-2 flex-none rounded-full ${loc?.lat != null ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            <span className="truncate">{locText}</span>
          </button>
        )}
      </header>
      {pending > 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">📶 有 {pending} 筆還存在手機裡，連上網路會自動送出。</p>
      )}

      <div className="nav-gap">
        <div hidden={tab !== 'add'}>
          <AddView
            categories={categories}
            projects={projects}
            canManage={canManage}
            location={loc}
            onToast={showToast}
            onSaved={(queued) => (queued ? setPending(readOutbox().length) : router.refresh())}
            onNewProject={(n) => setProjects((p) => [n, ...p.filter((x) => x !== n)])}
            onRenamed={(from, to) => {
              setProjects((p) => [...new Set(p.map((x) => (x === from ? to : x)))]);
              router.refresh();
            }}
            onManageCategories={() => setShowCats(true)}
          />
        </div>
        <div hidden={tab !== 'list'}>
          <ListView items={items} categories={categories} projects={projects} onToast={showToast} onChanged={() => router.refresh()} />
        </div>
        <div hidden={tab !== 'report'}>
          <ReportView items={items} categories={categories} onToast={showToast} />
        </div>
        <div hidden={tab !== 'analytics'}>
          <AnalyticsView items={items} icons={icons} projectLabel="案場" />
        </div>
      </div>

      <Toast msg={toast} />
      {showPlaces && (
        <Sheet title="選擇地點" onClose={() => setShowPlaces(false)}>
          {candidates.length ? (
            <ul className="space-y-1">
              {candidates.map((c) => (
                <li key={c}>
                  <button type="button" onClick={() => pickPlace(c)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left hover:bg-gray-50">
                    <Icon name="pin" size={16} />
                    <span className="flex-1">{c}</span>
                    {c === loc?.placeName && <span className="text-emerald-700">✓</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-gray-500">附近找不到地點（沒開定位，或還沒設定附近地點服務）</p>
          )}
          <button type="button" className="btn mt-3 w-full" onClick={manualPlace}>
            <Icon name="edit" size={16} />
            手動輸入地點
          </button>
        </Sheet>
      )}
      {showCats && (
        <CategoryManager
          initial={categories}
          endpoint="/api/liff/expense/categories"
          onSaved={(c) => {
            setCategories(c);
            router.refresh();
          }}
          onClose={() => setShowCats(false)}
          onToast={showToast}
        />
      )}
      <FloatingNav
        tabs={TABS.map(([k, label, icon]) => ({
          href: `/a/expense?tab=${k}`,
          label,
          icon: <Icon name={icon} size={22} />,
          active: k === tab,
        }))}
      />
    </main>
  );
}
