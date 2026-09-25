'use client';

import { useState } from 'react';

// 官方網站／認領頁的互動示範：一段假的群組對話 → 點「讓群記整理」→ 變成行程、待辦、公告 →
// 點「確認」→ 從待確認變成定案。三個狀態剛好講完產品的三句話：
//   照常講話（零輸入）→ AI 整理（附原話）→ 你把關才算數。
// 對話內容是虛構的一般商務情境，不寫死任何產業（plan.md B.7）。

type Kind = 'event' | 'task' | 'note';
const CHIP: Record<Kind, { label: string; cls: string }> = {
  event: { label: '行程', cls: 'bg-emerald-600' },
  task: { label: '待辦', cls: 'bg-sky-600' },
  note: { label: '公告', cls: 'bg-purple-600' },
};

const CHAT = [
  { who: '老王', at: '09:10', text: '週四下午兩點在新莊倉庫點貨，小林記得帶清單' },
  { who: '小林', at: '09:12', text: '好', noise: true },
  { who: '雅婷', at: '09:15', text: '以後報價單一律副本給會計喔' },
  { who: '阿凱', at: '09:20', text: '我週三前把新版估價單傳上來' },
];

const RESULTS: { kind: Kind; title: string; meta: string; from: string }[] = [
  { kind: 'event', title: '新莊倉庫點貨', meta: '週四 14:00', from: '老王 09:10' },
  { kind: 'task', title: '帶點貨清單', meta: '小林 · 期限週四', from: '老王 09:10' },
  { kind: 'task', title: '傳新版估價單', meta: '阿凱 · 期限週三', from: '阿凱 09:20' },
  { kind: 'note', title: '報價單一律副本給會計', meta: '全員適用', from: '雅婷 09:15' },
];

export function IntroDemo() {
  // 0 對話中、1 已整理（待確認）、2 已確認
  const [step, setStep] = useState<0 | 1 | 2>(0);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* 假聊天室 */}
      <div className="border-b border-gray-200 px-4 py-2.5 text-sm font-semibold">宏達 · 專案群（示範）</div>
      <div className="space-y-2.5 bg-sky-50 px-3 py-4">
        {CHAT.map((m) => (
          <div
            key={m.at}
            className={`flex items-start gap-2 transition-opacity duration-500 motion-reduce:transition-none ${
              step > 0 && m.noise ? 'opacity-40' : ''
            }`}
          >
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
              {m.who.slice(-1)}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-500">{m.who}</p>
              <div className="flex items-end gap-1.5">
                <p className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm shadow-xs">{m.text}</p>
                <span className="flex-none text-[10px] text-gray-400">{m.at}</span>
              </div>
              {step > 0 && m.noise && <p className="mt-0.5 text-[11px] text-gray-500">閒聊不記錄</p>}
            </div>
          </div>
        ))}
      </div>

      {/* 整理結果 */}
      <div className="space-y-2 px-3 py-3">
        {step === 0 ? (
          <p className="px-1 py-2 text-center text-sm text-gray-500">大家照常講話，群記不會插嘴。</p>
        ) : (
          RESULTS.map((r, i) => (
            <div
              key={r.title}
              style={{ animationDelay: `${i * 120}ms` }}
              className="demo-in flex items-start gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5"
            >
              <span className={`mt-0.5 flex-none rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${CHIP[r.kind].cls}`}>
                {CHIP[r.kind].label}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.title}</p>
                <p className="text-xs text-gray-500">
                  {r.meta} · 來源：{r.from}
                </p>
              </div>
              {step === 1 ? (
                <span className="flex-none rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">待確認</span>
              ) : (
                <span className="flex-none rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900">✓ 已確認</span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-gray-200 p-3">
        {step === 0 && (
          <button className="btn-primary w-full" onClick={() => setStep(1)}>
            🦉 讓群記整理
          </button>
        )}
        {step === 1 && (
          <>
            <p className="mb-2 text-center text-xs text-gray-500">AI 整理的結果先進收件匣，每一筆都附原話。你按確認才算數。</p>
            <button className="btn-confirm w-full" onClick={() => setStep(2)}>
              全部確認
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <p className="mb-2 text-center text-xs text-gray-500">確認後，群裡每個人都能在 LINE 裡看到行程與自己的待辦。</p>
            <button className="btn w-full" onClick={() => setStep(0)}>
              重看一次
            </button>
          </>
        )}
      </div>
    </div>
  );
}
