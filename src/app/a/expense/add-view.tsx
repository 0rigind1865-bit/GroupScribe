'use client';

import { useEffect, useRef, useState } from 'react';
import { PAD_KEYS, evaluate, isOp, tap, OPS } from '@/expense/calc';
import { classifyNote } from '@/expense/classify';
import { Icon } from '@/expense/icons';
import type { CategoryItem } from '@/expense/categories';
import { PAY_METHODS } from '@/expense/receipt';
import { fmtMoney } from '@/expense/types';
import type { InvoiceData } from '@/expense/invoice';
import { isSpeechSupported, startDictation, type Dictation } from '@/expense/speech';
import { blobToDataUrl, compressImage } from '@/expense/compress';
import { ZH_LABELS, type ExpenseLabels } from './labels';
import { enqueue } from '@/expense/outbox';
import { Sheet } from '@/app/ui/expense/sheet';
import { Badge } from '@/app/ui/badge';
import dynamic from 'next/dynamic';

// 掃描器（含 jsqr，約 40KB）要用才載入，平常打開記帳頁不用下載
const QRScanner = dynamic(() => import('@/app/ui/expense/qr-scanner').then((m) => m.QRScanner), { ssr: false });

// 記一筆（從 Snaptab AddView 搬來；版面照 2026-10 設計畫布 StaffExpenseAdd）：收據照片＋大字金額＋計算機鍵盤、
// 分類圖示格＋AI 分類、專案（可不選／新增／改名）、付款方式、備註（可語音）、發票號（可掃 QR）、
// 「存起來」固定在拇指區並寫出金額。存完金額歸零；「記住上次」開著才保留專案與分類。
// ponytail: 設計稿的「拍收據 → AI 讀金額 → 對嗎？」這頁還沒有——AI 讀收據只在 LINE 傳照片那條路（core/ingest），
// 要接得另開 API；目前只有掃發票 QR 讀出的金額會掛「對嗎？」
// 沒網路時先存在手機（outbox），恢復網路由外殼自動補送。
export type Loc = { lat: number | null; lng: number | null; placeName: string };
const NEW = '__new__';
const RENAME = '__rename__';

export function AddView({
  categories,
  projects,
  canManage,
  location,
  onToast,
  onSaved,
  onNewProject,
  onRenamed,
  manageHref,
  L = ZH_LABELS,
}: {
  L?: ExpenseLabels;
  categories: CategoryItem[];
  projects: string[];
  canManage: boolean;
  location: Loc | null;
  onToast: (m: string) => void;
  onSaved: (queued: boolean) => void;
  onNewProject: (name: string) => void;
  onRenamed: (from: string, to: string) => void;
  /** 能管這家公司報帳的人才有：管理端分類頁 */
  manageHref?: string;
}) {
  const [expr, setExpr] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [project, setProject] = useState('');
  const [pay, setPay] = useState('代墊');
  const [note, setNote] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [showPad, setShowPad] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showInv, setShowInv] = useState(false);
  const [readAmt, setReadAmt] = useState<number | null>(null); // 掃發票讀出的金額（等人確認）
  const [remember, setRemember] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dictRef = useRef<Dictation | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // 「記住上次」：開著才帶回上次的專案與分類（預設關＝每次重選，防止選錯）
  useEffect(() => {
    try {
      const on = localStorage.getItem('gs-expense-remember') === '1';
      setRemember(on);
      if (!on) return;
      const p = localStorage.getItem('gs-expense-last-project');
      const c = localStorage.getItem('gs-expense-last-category');
      if (p) setProject(p);
      if (c && categories.some((x) => x.name === c)) setCategory(c);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 目前選的分類被刪掉了：清掉，免得存到不存在的分類
  useEffect(() => {
    if (category && !categories.some((c) => c.name === category)) setCategory(null);
  }, [categories, category]);
  // 備註依內容自動長高（上限 160px）
  useEffect(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [note, listening]);

  const amount = evaluate(expr);
  const hasOp = OPS.some((o) => expr.includes(o));
  // 專案可以不選（2026-10 設計畫布「記一筆」）：現場先存起來最重要，專案之後在清單或管理端補
  const canSave = amount > 0 && !!category && !saving;
  const picked = categories.find((c) => c.name === category);

  const setRememberPref = (on: boolean) => {
    setRemember(on);
    try {
      localStorage.setItem('gs-expense-remember', on ? '1' : '0');
      if (on && project) localStorage.setItem('gs-expense-last-project', project);
      if (on && category) localStorage.setItem('gs-expense-last-category', category);
    } catch {}
  };
  const pickCat = (name: string) => {
    setCategory(name);
    setCatOpen(false);
  };
  const aiClassify = () => {
    if (!note.trim()) return onToast('先輸入或用語音說備註，AI 才能判斷分類');
    const hit = classifyNote(note, categories.map((c) => c.name));
    if (!hit) return onToast('AI 看不出來，請手動選分類');
    pickCat(hit);
    onToast(`✓ AI 判斷：${hit}`);
  };
  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // 同一張可以重拍
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
  };
  const clearPhoto = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(null);
    setPreview(null);
  };
  const toggleVoice = () => {
    if (listening) return dictRef.current?.stop();
    if (!isSpeechSupported()) return onToast('這個瀏覽器不支援語音，請改用鍵盤上的麥克風');
    setInterim('');
    const d = startDictation({
      lang: 'zh-TW',
      onInterim: setInterim,
      onFinal: (t) => {
        setNote((p) => (p ? `${p} ${t}` : t));
        setInterim('');
      },
      onEnd: () => {
        setListening(false);
        setInterim('');
      },
      onError: () => {
        setListening(false);
        setInterim('');
        onToast('語音辨識中斷，請再試一次');
      },
    });
    if (d) {
      dictRef.current = d;
      setListening(true);
    }
  };
  const onScan = (d: InvoiceData) => {
    setShowScanner(false);
    if (d.total > 0) {
      setExpr(String(d.total));
      setReadAmt(d.total);
    }
    if (d.invoiceNo) setInvoiceNo(d.invoiceNo);
    if (d.items.length) setNote(d.items.join('、'));
    const detail = d.totalItemCount > 0 && !d.complete ? `・明細 ${d.itemCount}/${d.totalItemCount}` : '';
    onToast(d.total > 0 ? `✓ 發票 ${d.invoiceNo}／$${fmtMoney(d.total)}${detail}` : `✓ 已帶入發票 ${d.invoiceNo}${detail}`);
  };
  const post = (fd: FormData) =>
    fetch('/api/liff/expense/project', { method: 'POST', body: fd })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: '沒有網路' }));
  const onProject = async (v: string) => {
    if (v === NEW) {
      const name = window.prompt('新增專案名稱')?.trim().slice(0, 60);
      if (!name) return;
      const fd = new FormData();
      fd.set('name', name);
      const r = await post(fd);
      if (!r.ok) return onToast(`✗ ${r.error ?? '新增失敗'}`);
      onNewProject(name);
      setProject(name);
      return onToast('✓ 已新增專案');
    }
    if (v === RENAME) {
      const to = window.prompt('重新命名專案（全公司這個專案的紀錄都會一起改）', project)?.trim().slice(0, 60);
      if (!to || to === project) return;
      const fd = new FormData();
      fd.set('action', 'rename');
      fd.set('from', project);
      fd.set('name', to);
      const r = await post(fd);
      if (!r.ok) return onToast(`✗ ${r.error ?? '改名失敗'}`);
      onRenamed(project, to);
      setProject(to);
      if (remember) localStorage.setItem('gs-expense-last-project', to);
      return onToast('✓ 已更新專案名稱');
    }
    setProject(v);
  };

  const save = async () => {
    if (!canSave || !category) return;
    setSaving(true);
    const fields: Record<string, string> = {
      client_id: crypto.randomUUID(),
      amount: String(amount),
      category,
      project,
      pay_method: pay,
      note,
      invoice_no: invoiceNo,
      spent_at: new Date().toISOString(),
      place_name: location?.placeName ?? '',
      lat: location?.lat != null ? String(location.lat) : '',
      lng: location?.lng != null ? String(location.lng) : '',
    };
    let blob: Blob | null = null;
    if (photo) blob = await compressImage(photo).catch(() => photo);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    if (blob) fd.set('photo', blob, 'receipt.jpg');

    let queued = false;
    let ok = false;
    try {
      if (!navigator.onLine) throw new Error('offline');
      const r = await fetch('/api/liff/expense/add', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) ok = true;
      else onToast(`✗ ${j.error ?? '儲存失敗，請重試'}`);
    } catch {
      // 送不出去（沒網路）：先存在手機，外殼恢復連線時自動補送
      queued = enqueue({ client_id: fields.client_id, fields, photo: blob ? await blobToDataUrl(blob) : undefined, at: Date.now() });
      ok = queued;
      if (!queued) onToast('✗ 沒網路，而且手機暫存滿了，請連上網路再記');
    }
    setSaving(false);
    if (!ok) return;
    onToast(queued ? `📶 沒網路，先存在手機（$${fmtMoney(amount)}），恢復後自動送出` : `✓ 已記下 $${fmtMoney(amount)}`);
    setExpr('');
    setNote('');
    setInvoiceNo('');
    setShowInv(false);
    clearPhoto();
    setCatOpen(false);
    if (remember) {
      try {
        localStorage.setItem('gs-expense-last-project', project);
        localStorage.setItem('gs-expense-last-category', category);
      } catch {}
    } else {
      setProject('');
      setCategory(null);
    }
    onSaved(queued);
  };

  return (
    // pb-20：讓開固定在底部的「存起來」
    <div className="space-y-3 pb-20">
      {/* 金額卡（設計稿）：左邊收據照片、右邊大字金額，點金額開計算機。
          機器讀出來的金額（目前只有發票 QR）掛「對嗎？」請人確認；一改金額就消失 */}
      <section className="card flex items-center gap-3 p-3.5">
        <button
          type="button"
          aria-label={preview ? '收據照片，點一下重拍' : L.photo}
          onClick={() => fileRef.current?.click()}
          className="flex h-24 w-[76px] flex-none flex-col items-center justify-center gap-1 overflow-hidden rounded-xl bg-gray-100 text-[11px] text-gray-600"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="收據預覽" className="h-full w-full object-cover" />
          ) : (
            <>
              <Icon name="receipt" size={24} />
              {L.photo}
            </>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
        <button type="button" onClick={() => setShowPad(true)} className="flex min-h-24 min-w-0 flex-1 flex-col items-start justify-center gap-1 text-left">
          <span className="label text-gray-600">{L.amount}</span>
          <span className={`max-w-full truncate text-4xl font-black tabular-nums ${expr ? '' : 'text-gray-400'}`} style={{ fontFamily: 'var(--font-title)' }}>
            NT$ {expr ? fmtMoney(amount) : '0'}
          </span>
          {hasOp ? (
            <span className="max-w-full truncate text-sm text-gray-500 tabular-nums">{expr}</span>
          ) : readAmt === amount && amount > 0 ? (
            <Badge tone="warn">從發票讀出來的，對嗎？</Badge>
          ) : !expr ? (
            <span className="text-sm text-gray-500">點一下輸入金額</span>
          ) : null}
        </button>
      </section>
      {preview && (
        <button type="button" className="text-xs text-gray-500 underline" onClick={clearPhoto}>
          拿掉照片
        </button>
      )}

      {/* 分類：選好收合成一行，點一下再展開 */}
      {catOpen || !category ? (
        <div>
          <h2 className="label mb-2">{L.category}</h2>
          <div className="grid grid-cols-4 gap-2">
            {categories.map((c) => (
              <button
                type="button"
                key={c.name}
                aria-pressed={category === c.name}
                onClick={() => pickCat(c.name)}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-[14px] border px-1 text-[13px] font-bold ${
                  category === c.name ? 'border-emerald-600 bg-emerald-100 text-emerald-700 ring-1 ring-emerald-600' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                <Icon name={c.icon} size={22} />
                <span className="w-full truncate text-center">{c.name}</span>
              </button>
            ))}
            <button type="button" onClick={aiClassify} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-[14px] border border-gray-200 bg-white px-1 text-[13px] font-bold text-gray-700">
              <Icon name="sparkles" size={22} />
              AI 分類
            </button>
          </div>
          {/* 分類是全公司共用的設定：個人頁不放管理格，只給一條去管理端的路（淡色＝個人，審查 F35） */}
          {manageHref && (
            <a href={manageHref} className="mt-2 block text-xs text-gray-500 underline">
              分類不夠？到管理端「報帳 · 分類」新增
            </a>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setCatOpen(true)} className="card flex w-full items-center gap-3 text-left">
          <Icon name={picked?.icon ?? 'tag'} size={20} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-gray-500">{L.category}</span>
            <span className="block font-medium">{category}</span>
          </span>
          <span className="text-sm text-gray-500">更改 ▾</span>
        </button>
      )}

      {/* 專案（可不選）＋付款方式：各佔一整列（設計稿） */}
      <label className="flex flex-col gap-1.5">
        <span className="label">
          {L.project} <span className="font-normal text-gray-600">（可以不選，之後再補）</span>
        </span>
        <select className="input" value={project} onChange={(e) => onProject(e.target.value)}>
          <option value="">（不選）</option>
          {projects.map((p) => (
            <option key={p}>{p}</option>
          ))}
          {project && !projects.includes(project) && <option>{project}</option>}
          {project && canManage && <option value={RENAME}>✎ 重新命名目前專案…</option>}
          <option value={NEW}>＋ 新增專案…</option>
        </select>
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="label">{L.pay}</span>
        <div role="group" aria-label={L.pay} className="segmented grid grid-cols-3">
          {PAY_METHODS.map((p) => (
            <button type="button" key={p} aria-pressed={pay === p} onClick={() => setPay(p)} className="min-h-10">
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* 備註＋語音（聆聽中改成即時字幕，停頓自動結束） */}
      {listening ? (
        <div className="card">
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            聆聽中<span className="text-xs text-gray-500">・停頓就會自動結束</span>
            <button type="button" className="btn btn-sm ml-auto" onClick={() => dictRef.current?.stop()}>
              完成
            </button>
          </div>
          <p className="mt-2 text-sm">
            {note && <span>{note} </span>}
            <span className="text-gray-500">{interim || (note ? '' : '請開始說話…')}</span>
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <textarea
            ref={noteRef}
            rows={1}
            className="input min-w-0 flex-1 resize-none py-2"
            placeholder="備註（選填）例如：工班便當 12 個"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="button" aria-label="語音輸入備註" className="btn h-10 w-10 flex-none px-0" onClick={toggleVoice}>
            <Icon name="mic" size={20} />
          </button>
        </div>
      )}

      {/* 發票號碼＋掃 QR：選填，平常收成一行字；點了直接開掃描器，關掉也能手打 */}
      {showInv || invoiceNo ? (
        <div className="flex gap-2">
          <input
            className="input min-w-0 flex-1"
            placeholder="發票號碼（選填）"
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value.toUpperCase())}
          />
          <button type="button" aria-label="掃描發票 QR" className="btn h-10 w-10 flex-none px-0" onClick={() => setShowScanner(true)}>
            <Icon name="scan" size={20} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="min-h-10 text-sm font-bold text-emerald-700"
          onClick={() => {
            setShowInv(true);
            setShowScanner(true);
          }}
        >
          ＋ 發票號碼（掃 QR 碼）
        </button>
      )}

      {/* 存起來：固定在拇指區（底部膠囊正上方），按鈕上直接寫金額（設計稿）。寬度對齊膠囊；
          墊一層頁面底色，還不能存（半透明）時才不會透出底下捲過的內容 */}
      <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-[26rem] rounded-2xl bg-gray-50">
        <button type="button" className="btn-primary h-14 w-full rounded-2xl text-[17px] shadow-lg" disabled={!canSave} onClick={save}>
          {saving ? '儲存中…' : amount > 0 ? `${L.save} · NT$ ${fmtMoney(amount)}` : L.save}
        </button>
      </div>
      {!canSave && !saving && (
        <p className="text-center text-xs text-gray-500">
          {amount <= 0 ? '先輸入金額' : !category ? '再選一個分類' : ''}
        </p>
      )}
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={remember} onChange={(e) => setRememberPref(e.target.checked)} />
        記住上次的專案與分類（下次打開自動帶入）
      </label>

      {showPad && (
        <Sheet label={L.amount} onClose={() => setShowPad(false)}>
          <p className="text-xs text-gray-500">{L.amount}</p>
          <p className={`text-4xl font-semibold tabular-nums ${expr ? '' : 'text-gray-400'}`}>
            <span className="mr-1 text-lg text-gray-500">$</span>
            {expr ? fmtMoney(amount) : '0'}
          </p>
          <p className="h-5 text-sm text-gray-500 tabular-nums">{hasOp ? expr : ''}</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {PAD_KEYS.map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setExpr((e) => tap(e, k))}
                className={`h-14 rounded-xl text-xl font-medium ${
                  k === '=' ? 'bg-emerald-600 text-white' : isOp(k) ? 'bg-emerald-50 text-emerald-900' : k === 'del' ? 'bg-gray-100 text-gray-700' : 'border border-gray-200'
                }`}
              >
                {k === 'del' ? '⌫' : k}
              </button>
            ))}
          </div>
          <button type="button" className="btn-primary mt-3 h-12 w-full text-base" onClick={() => setShowPad(false)}>
            完成
          </button>
        </Sheet>
      )}
      {showScanner && <QRScanner onResult={onScan} onClose={() => setShowScanner(false)} />}
    </div>
  );
}
