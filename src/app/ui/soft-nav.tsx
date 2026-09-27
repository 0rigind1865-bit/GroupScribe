'use client';

import { Fragment, Suspense, useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// 全站換頁不整頁重載（jielin：「任何選取確認都會重新刷新畫面」「選單列有必要每次都重新載入嗎？」）。
//
// 原本每個連結都是 <a>、每張表單都 POST 到 /api/* 再 303 轉回來——瀏覽器每次都整頁重來：
// 閃白、捲回最上面。這裡在最外層接手兩件事，42 張表單與所有連結都不用改：
//   站內連結 → router.push（不向伺服器要整頁，只拿新內容）
//   表單送出 → fetch 送出、讀轉址目的地 → router.replace（不捲動）＋refresh（連選單上的數字一起更新）
// 沒有 JS 時一切照舊（HTML 本來就能用），這是純加強。
//
// 不接手的：/api/*、/go/*（伺服器端點要整頁：語言切換、下載、換身分寫 cookie）、外站、target／download、
// 修飾鍵、同頁錨點、data-hard，以及別人已經 preventDefault 的（React 元件自己處理的、身分列「關閉」的收合腳本）。
const SERVER = /^\/(api|go|_next)(\/|$)/;
const DONE = 'gs:navdone';

/**
 * 內容區：網址一變（含只換 ?note=、上一頁／下一頁）就整個重建，送出後回到同一網址也重建一次。
 * 不重建的話 React 會沿用舊表單：<select> 停在上一筆的值、全選狀態殘留，存下去就寫錯資料
 * （2026-09-27 兩輪審查抓到，所以不能省）。重建＝畫面回到伺服器給的樣子，跟整頁重載看到的一樣，只是不閃。
 */
export function Remount({ children }: { children: React.ReactNode }) {
  // 靜態預先產生的頁（404）讀不到網址參數：那時先照原樣畫內容（fallback 就是內容本身），到瀏覽器再接手
  return (
    <Suspense fallback={children}>
      <KeyByUrl>{children}</KeyByUrl>
    </Suspense>
  );
}

function KeyByUrl({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const q = new URLSearchParams(useSearchParams().toString());
  // 報帳 App 四個分頁同時掛著只切顯示（記到一半切去清單，回來金額還在）：換分頁不算換頁
  if (path === '/a/expense') q.delete('tab');
  const [n, setN] = useState(0);
  useEffect(() => {
    const bump = () => setN((x) => x + 1);
    addEventListener(DONE, bump);
    return () => removeEventListener(DONE, bump);
  }, []);
  return <Fragment key={`${path}?${q}|${n}`}>{children}</Fragment>;
}

// 表單屬性一律讀 HTML 屬性：form 元素的 .action／.target 會被 name="action" 的按鈕蓋掉（批次列、報帳、員工管理都有），
// 讀到的是按鈕元素不是網址（2026-09-27 複查抓到）
const attr = (el: Element | null | undefined, name: string) => el?.getAttribute(name) ?? null;

/**
 * 提示條的固定字：root layout 依語系（locale()）翻好傳進來。SoftNav 掛在 root、也接手員工端（/a）的表單，
 * 越南、印尼籍員工在工地網路不穩時最常看到的就是斷線那句。failed 裡的 {msg} 換成伺服器回的原因
 */
export type SoftNavText = { dismiss: string; done: string; failed: string; offline: string };

export function SoftNavClient({ text }: { text: SoftNavText }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sending, setSending] = useState(0);
  const remountAfter = useRef(false);
  // 送出結果的提示條（原本是 alert()：LINE 的 LIFF 文件警告在 Promise 回呼裡叫 alert 部分裝置會出問題，
  // 而且原生對話框會蓋住整個 App）。at 當 key：同一句話再出現也重新進場
  const [note, setNote] = useState<{ text: string; err: boolean; at: number } | null>(null);
  // 字放 ref、不放進下面 effect 的依賴：每次 router.refresh() root layout 都會重送一份新的 text 物件，
  // effect 若跟著重跑，busy 會換一個新的空集合——還在匯入中的表單就又按得下去了
  const textRef = useRef(text);
  textRef.current = text;

  // 送出後回到同一網址：網址沒變、Remount 不會自己重建——等新資料到了（transition 結束）再重建一次
  useEffect(() => {
    if (pending || !remountAfter.current) return;
    remountAfter.current = false;
    dispatchEvent(new Event(DONE));
  }, [pending]);

  // 成功訊息幾秒後自己收掉；錯誤要人按「知道了」——「沒有送出」不能一閃就過
  useEffect(() => {
    if (!note || note.err) return;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);

  useEffect(() => {
    const go = (url: string, afterPost = false) => {
      // 換到別頁（GET 表單也走這條）：上一頁的「沒有完成」不跟過去，看起來像新頁面出了錯
      if (!afterPost) setNote(null);
      start(() => {
        if (!afterPost) return router.push(url);
        if (url === location.pathname + location.search) {
          remountAfter.current = true;
          return router.refresh();
        }
        // 有錯誤橫幅（?err=）就捲到頂端讓人看到；成功就留在原位
        router.replace(url, { scroll: /[?&](err|error|cerror)=/.test(url) });
        router.refresh(); // 連 layout 一起重抓：選單上的待辦數字、群組／員工膠囊
      });
    };
    // 上一頁／下一頁（Android 返回鍵、iOS 左緣滑回）不經過 go()：一樣收掉
    const onPop = () => setNote(null);

    const closeMenus = () => document.querySelectorAll('details[open]').forEach((d) => d.removeAttribute('open'));

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest('a') : null;
      if (!a || !attr(a, 'href') || a.hasAttribute('download') || 'hard' in a.dataset) return;
      const tgt = attr(a, 'target');
      if (tgt && tgt !== '_self') return;
      const u = new URL(a.href);
      if (u.origin !== location.origin || SERVER.test(u.pathname)) return;
      if (u.hash && u.pathname === location.pathname && u.search === location.search) return; // 同頁錨點
      e.preventDefault();
      closeMenus(); // 點下去就收起膠囊／抽屜，不等換頁完成
      go(u.pathname + u.search + u.hash);
    };

    // 最後按的送出鈕：舊版 WebView 沒有 SubmitEvent.submitter，批次列靠按鈕的 name／value 分「確認／忽略」
    let lastBtn: HTMLButtonElement | HTMLInputElement | null = null;
    const onDown = (e: Event) => {
      const b = e.target instanceof Element ? e.target.closest('button, input[type=submit]') : null;
      lastBtn = b instanceof HTMLButtonElement || b instanceof HTMLInputElement ? b : null;
    };

    const busy = new WeakSet<HTMLFormElement>();
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target;
      if (!(f instanceof HTMLFormElement) || e.defaultPrevented || 'hard' in f.dataset) return;
      const raw = e.submitter ?? (lastBtn?.form === f ? lastBtn : null);
      const sub = raw instanceof HTMLButtonElement || raw instanceof HTMLInputElement ? raw : null;
      const tgt = attr(sub, 'formtarget') ?? attr(f, 'target');
      if (tgt && tgt !== '_self') return;
      const action = new URL(attr(sub, 'formaction') ?? attr(f, 'action') ?? location.href, location.href);
      const method = (attr(sub, 'formmethod') ?? attr(f, 'method') ?? 'get').toLowerCase();
      if (action.origin !== location.origin) return;
      e.preventDefault();
      if (busy.has(f)) return;
      const fd = new FormData(f);
      if (sub?.name) fd.append(sub.name, sub.value);
      const unlock = () => {
        busy.delete(f);
        f.classList.remove('is-submitting');
        f.querySelectorAll('.is-clicked').forEach((b) => b.classList.remove('is-clicked'));
      };

      if (method === 'get') {
        action.search = new URLSearchParams(fd as unknown as Record<string, string>).toString();
        unlock();
        closeMenus();
        return go(action.pathname + action.search);
      }

      busy.add(f);
      setSending((x) => x + 1);
      setNote(null); // 重送時收掉上一次的提示，免得重試成功了還掛著「沒有完成」
      // 等伺服器回話的整段期間表單都鎖著（同原生送出）：匯入聊天記錄可能跑好幾分鐘，
      // 中途解鎖會讓人再按一次、整批訊息重複入庫（2026-09-27 最終審查）。
      // ponytail: 換頁重建也會解鎖另一張還在送出中的表單——跟以前整頁送出一樣，沒再多做
      const fromPath = location.pathname;
      // Accept 跟原生表單一樣要 HTML：有些端點（/api/profile、/api/files/classify）看它決定回轉址還是 JSON
      fetch(action, { method: 'POST', body: fd, credentials: 'same-origin', headers: { Accept: 'text/html' } })
        .then(async (res) => {
          const to = new URL(res.url);
          // ponytail: fetch 會跟著 303 把目的頁整頁要回來再丟掉（伺服器多渲染一次）；
          // 要省這一次得讓 API 認得軟換頁請求改回 JSON，等真的慢了再做
          if (res.redirected && to.origin === location.origin) {
            res.body?.cancel().catch(() => {});
            if (SERVER.test(to.pathname)) return void (location.href = to.href); // 轉去端點（下載、換身分）：整頁
            // 等的時候使用者已經換到別頁（長時間的匯入、AI 解析）：不把他拉回去，只更新目前這頁
            if (location.pathname !== fromPath) {
              unlock();
              return start(() => router.refresh());
            }
            // 成功時表單會隨內容區重建而換新；這條保險絲只防「伺服器回了、換頁卻卡住」讓按鈕永遠鎖著
            setTimeout(unlock, 15_000);
            return go(to.pathname + to.search, true);
          }
          // 沒轉址又是 HTML＝登入過期被改寫成登入頁：整頁重載，讓登入頁接手（登入完會回到這一頁）
          if ((res.headers.get('content-type') ?? '').includes('text/html')) return location.reload();
          // 錯誤（403／400 回 JSON）：原本會整頁顯示一段 JSON，現在底部提示條一句話、留在原頁
          const text = await res.text();
          let msg = text;
          try {
            const j = JSON.parse(text);
            msg = j.error ?? (res.ok ? textRef.current.done : text);
          } catch {}
          unlock();
          // replace 用函式：伺服器回的原因裡有 $& 之類也照字面放進去
          const why = String(msg).slice(0, 200);
          setNote(
            res.ok
              ? { text: String(msg).slice(0, 300), err: false, at: Date.now() }
              : { text: textRef.current.failed.replace('{msg}', () => why), err: true, at: Date.now() },
          );
        })
        .catch(() => {
          unlock();
          // 斷線不代表伺服器沒收到（長時間的匯入會照樣跑完）：不叫人直接重送，先看結果
          setNote({ text: textRef.current.offline, err: true, at: Date.now() });
        })
        .finally(() => setSending((x) => x - 1));
    };

    // 掛在 window、比 layout 裡的原生腳本晚註冊：那兩段（送出轉圈、身分列「關閉」只收合）先跑
    addEventListener('pointerdown', onDown, true);
    addEventListener('keydown', onDown, true);
    addEventListener('click', onClick);
    addEventListener('submit', onSubmit);
    addEventListener('popstate', onPop);
    return () => {
      removeEventListener('pointerdown', onDown, true);
      removeEventListener('keydown', onDown, true);
      removeEventListener('click', onClick);
      removeEventListener('submit', onSubmit);
      removeEventListener('popstate', onPop);
    };
  }, [router]);

  // 換頁中、送出中：頂端一條細的進度線（點了有反應，長時間的 AI 解析也看得出還在跑）
  // 提示條：位置在 globals.css 的 .softnav-note（平常浮在底部膠囊上方、手機批次列浮出時改貼頂端）。
  // 報讀：錯誤 role=alert（連區塊帶字一起插入也會念）；成功走下面常駐的 role=status——polite 的即時區域
  // 要先在 DOM 裡、之後內容改變才會被念，跟著提示條整塊插進來的 NVDA／JAWS 多半不念。提示條本身 aria-hidden 免得念兩次
  return (
    <>
      {(pending || sending > 0) && <div className="softnav-bar" aria-hidden="true" />}
      <div role="status" className="sr-only">
        {note && !note.err && <span key={note.at}>{note.text}</span>}
      </div>
      {note && (
        <div
          key={note.at}
          role={note.err ? 'alert' : undefined}
          aria-hidden={note.err ? undefined : true}
          className="softnav-note msg-in fixed inset-x-4 z-[70] mx-auto flex max-w-md items-center gap-2 rounded-xl bg-gray-900 py-1 pr-1 pl-4 text-sm text-white shadow-lg ring-1 ring-white/15"
        >
          <p className="min-w-0 flex-1 py-2 break-words">{note.text}</p>
          {note.err && (
            <button type="button" className="min-h-11 flex-none rounded-lg px-3 font-bold" onClick={() => setNote(null)}>
              {text.dismiss}
            </button>
          )}
        </div>
      )}
    </>
  );
}
