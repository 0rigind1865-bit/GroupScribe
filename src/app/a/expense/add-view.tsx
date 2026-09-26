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
import { enqueue } from '@/expense/outbox';
import { Sheet } from '@/app/ui/expense/sheet';
import dynamic from 'next/dynamic';

// 掃描器（含 jsqr，約 40KB）要用才載入，平常打開記帳頁不用下載
const QRScanner = dynamic(() => import('@/app/ui/expense/qr-scanner').then((m) => m.QRScanner), { ssr: false });

// 記一筆（從 Snaptab AddView 搬來）：大字金額＋計算機鍵盤、分類圖示格＋AI 分類、案場（可新增／改名）、
// 付款方式、備註（可語音）、發票號（可掃 QR）、拍照。存完金額歸零；「記住上次」開著才保留案場與分類。
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
  onManageCategories,
}: {
  categories: CategoryItem[];
  projects: string[];
  canManage: boolean;
  location: Loc | null;
  onToast: (m: string) => void;
  onSaved: (queued: boolean) => void;
  onNewProject: (name: string) => void;
  onRenamed: (from: string, to: string) => void;
  onManageCategories: () => void;
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
  const [remember, setRemember] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dictRef = useRef<Dictation | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // 「記住上次」：開著才帶回上次的案場與分類（預設關＝每次重選，防止選錯）
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
  const canSave = amount > 0 && !!category && !!project && !saving;
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
    if (d.total > 0) setExpr(String(d.total));
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
      const name = window.prompt('新增案場／專案名稱')?.trim().slice(0, 60);
      if (!name) return;
      const fd = new FormData();
      fd.set('name', name);
      const r = await post(fd);
      if (!r.ok) return onToast(`✗ ${r.error ?? '新增失敗'}`);
      onNewProject(name);
      setProject(name);
      return onToast('✓ 已新增案場');
    }
    if (v === RENAME) {
      const to = window.prompt('重新命名案場（全公司這個案場的紀錄都會一起改）', project)?.trim().slice(0, 60);
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
      return onToast('✓ 已更新案場名稱');
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
    <div className="space-y-3">
      {/* 金額卡：點一下開計算機；右邊拍照 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setShowPad(true)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setShowPad(true)}
        className="card flex cursor-pointer items-center gap-3"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500">金額</p>
          <p className={`truncate text-4xl font-semibold tabular-nums ${expr ? '' : 'text-gray-400'}`}>
            <span className="mr-1 text-lg text-gray-500">$</span>
            {expr ? fmtMoney(amount) : '0'}
          </p>
          {hasOp ? <p className="truncate text-sm text-gray-500 tabular-nums">{expr}</p> : !expr ? <p className="text-sm text-gray-500">點一下輸入金額</p> : null}
        </div>
        <button
          type="button"
          aria-label="拍收據"
          onClick={(e) => {
            e.stopPropagation();
            fileRef.current?.click();
          }}
          className="grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-xl border border-dashed border-gray-300 text-gray-500"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="收據預覽" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center text-xs">
              <Icon name="camera" size={22} />
              拍照
            </span>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} onClick={(e) => e.stopPropagation()} />
      </div>
      {preview && (
        <button type="button" className="text-xs text-gray-500 underline" onClick={clearPhoto}>
          拿掉照片
        </button>
      )}

      {/* 分類：選好收合成一行，點一下再展開 */}
      {catOpen || !category ? (
        <div>
          <p className="mb-1.5 text-xs text-gray-500">分類</p>
          <div className="grid grid-cols-4 gap-2">
            {categories.map((c) => (
              <button
                type="button"
                key={c.name}
                onClick={() => pickCat(c.name)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-xs ${
                  category === c.name ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-gray-200'
                }`}
              >
                <Icon name={c.icon} size={22} />
                <span className="w-full truncate text-center">{c.name}</span>
              </button>
            ))}
            <button type="button" onClick={aiClassify} className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 px-1 py-2 text-xs">
              <Icon name="sparkles" size={22} />
              AI 分類
            </button>
            {canManage && (
              <button
                type="button"
                onClick={onManageCategories}
                className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-gray-300 px-1 py-2 text-xs text-gray-500"
              >
                <Icon name="sliders" size={22} />
                管理
              </button>
            )}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setCatOpen(true)} className="card flex w-full items-center gap-3 text-left">
          <Icon name={picked?.icon ?? 'tag'} size={20} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-gray-500">分類</span>
            <span className="block font-medium">{category}</span>
          </span>
          <span className="text-sm text-gray-500">更改 ▾</span>
        </button>
      )}

      {/* 案場＋付款方式 */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">案場／專案</span>
          <select className="input" value={project} onChange={(e) => onProject(e.target.value)}>
            {!project && (
              <option value="" disabled>
                請選擇案場…
              </option>
            )}
            {projects.map((p) => (
              <option key={p}>{p}</option>
            ))}
            {project && !projects.includes(project) && <option>{project}</option>}
            {project && canManage && <option value={RENAME}>✎ 重新命名目前案場…</option>}
            <option value={NEW}>＋ 新增案場…</option>
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">付款方式</span>
          <div className="flex rounded-lg border border-gray-200 p-0.5 text-sm">
            {PAY_METHODS.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setPay(p)}
                className={`flex-1 rounded-md py-1.5 ${pay === p ? 'bg-emerald-600 text-white' : 'text-gray-600'}`}
              >
                {p}
              </button>
            ))}
          </div>
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

      {/* 發票號碼＋掃 QR */}
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

      <button type="button" className="btn-primary h-12 w-full text-base" disabled={!canSave} onClick={save}>
        {saving ? '儲存中…' : '＋ 存一筆'}
      </button>
      {!canSave && !saving && (
        <p className="text-center text-xs text-gray-500">
          {amount <= 0 ? '先輸入金額' : !category ? '再選一個分類' : !project ? '再選一個案場' : ''}
        </p>
      )}
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={remember} onChange={(e) => setRememberPref(e.target.checked)} />
        記住上次的案場與分類（下次打開自動帶入）
      </label>

      {showPad && (
        <Sheet onClose={() => setShowPad(false)}>
          <p className="text-xs text-gray-500">金額</p>
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
