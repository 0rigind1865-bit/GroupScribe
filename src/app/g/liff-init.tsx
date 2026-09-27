'use client';

import { useEffect, useState } from 'react';

declare global {
  interface Window {
    liff: any;
  }
}

// 文案由伺服端傳入：這支同時服務 /g（繁中）與 /a（員工端五語系）。
// 越南籍員工開打卡連結時，第一眼不該是繁體中文的 GroupScribe。
export type LiffMsgs = {
  brand: string;
  connecting: string;
  noId: string;
  noIdentity: string;
  authFailed: string;
  sdkFailed: string;
  initFailed: string; // 含 {msg}
};

const ZH: LiffMsgs = {
  brand: '群記',
  connecting: '連線 LINE 中…',
  noId: '尚未設定 LIFF_ID（管理者請在 .env 加入後重啟）',
  noIdentity: '取不到 LINE 身份，請關閉後重新開啟',
  authFailed: '身份驗證失敗，請關閉後重新開啟',
  sdkFailed: '無法載入 LINE SDK，請檢查網路',
  initFailed: '初始化失敗：{msg}',
};

// LIFF 開機：載 SDK（CDN，不進 npm）→ init → 取 ID token → 後端驗證換 session cookie → 重載出內容
export function LiffInit({ liffId, msgs = ZH }: { liffId: string; msgs?: LiffMsgs }) {
  const [msg, setMsg] = useState(msgs.connecting);
  useEffect(() => {
    if (!liffId) {
      setMsg(msgs.noId);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    s.onload = async () => {
      try {
        await window.liff.init({ liffId });
        if (!window.liff.isLoggedIn()) {
          window.liff.login(); // 外部瀏覽器開啟時導去 LINE 登入；LINE 內開啟不會走到這
          return;
        }
        const idToken = window.liff.getIDToken();
        if (!idToken) {
          setMsg(msgs.noIdentity);
          return;
        }
        const r = await fetch('/api/liff/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        if (!r.ok) {
          setMsg(msgs.authFailed);
          return;
        }
        location.reload();
      } catch (e) {
        setMsg(msgs.initFailed.replace('{msg}', String(e)));
      }
    };
    s.onerror = () => setMsg(msgs.sdkFailed);
    document.head.appendChild(s);
  }, [liffId, msgs]);
  // 連線中才轉圈（初始 state 就是連線中，SSR 出來的 HTML 已帶轉圈，不用等 JS）；
  // 錯誤訊息不轉圈——轉圈＝「等一下就好」，錯誤時那是在騙人
  const connecting = msg === msgs.connecting;
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="mb-2 text-lg font-bold">{msgs.brand}</p>
        <p role="status" aria-live="polite" className="flex items-center justify-center gap-2 text-sm text-gray-500">
          {connecting && <span className="spinner h-4 w-4 flex-none" aria-hidden="true" />}
          {msg}
        </p>
      </div>
    </main>
  );
}
