import { IntroDemo } from './intro-demo';

// 官方網站（/about）與認領頁（/claim）共用的介紹區塊。純靜態，唯一的互動在 IntroDemo。

export function BrandBar({ right }: { right?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-2.5 px-4 py-3">
      <a href="/about" className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark-512.png" alt="" className="h-9 w-9 rounded-xl" />
        <span className="leading-tight">
          <span className="block text-base font-semibold tracking-tight">群記</span>
          <span className="block text-[10px] font-medium tracking-widest text-gray-500">GROUPSCRIBE</span>
        </span>
      </a>
      {right && <div className="ml-auto">{right}</div>}
    </header>
  );
}

export function DemoSection({ title = '點一下，看它怎麼整理' }: { title?: string }) {
  return (
    <section id="demo" className="scroll-mt-4">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      <IntroDemo />
    </section>
  );
}

const STEPS = [
  { t: '把群記邀進 LINE 工作群', d: '跟邀朋友進群一樣。它會發一次說明，之後就安靜記錄。' },
  { t: '管理員點連結認領', d: '用 LINE 登入，按一下「認領」，這個群就歸你的公司管理。' },
  { t: '照常講話，其餘自動發生', d: '行程、待辦、公告自動整理好，你在收件匣確認，全員在 LINE 裡就看得到。' },
];

export function StepsSection() {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold tracking-tight">三步開始</h2>
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.t} className="flex gap-3">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
              {i + 1}
            </span>
            <span>
              <span className="block font-semibold">{s.t}</span>
              <span className="block text-sm text-gray-600">{s.d}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const TRUST = [
  { t: '不在群裡說話', d: '進群說明一次後就安靜。只有被 @ 才回答，不刷版、不通知全群。' },
  { t: '你按確認才算數', d: 'AI 整理的每一筆都附上原話，錯了一鍵忽略，它不會再犯。' },
  { t: '收回就刪除', d: '在 LINE 收回的訊息，對應的紀錄、索引與檔案一併刪除。' },
  { t: '只看得到自己的群', d: '群成員只看得到自己所在群的整理，退群立刻失去存取。' },
];

export function TrustSection() {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold tracking-tight">為什麼可以放心</h2>
      <div className="grid grid-cols-2 gap-2.5">
        {TRUST.map((x) => (
          <div key={x.t} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-sm font-semibold">{x.t}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-600">{x.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const PLANS = [
  { n: 'Free', p: '免費', d: '1 個群 · 每月 1,500 次 AI' },
  { n: 'Starter', p: 'NT$690/月', d: '3 個群 · 每月 6,000 次 AI' },
  { n: 'Team', p: 'NT$2,190/月', d: '10 個群 · 每月 20,000 次 AI · 考勤' },
];

export function PlansSection() {
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold tracking-tight">方案</h2>
      <p className="mb-3 text-sm text-gray-600">群組成員永遠免費，不用註冊、不用裝 App。</p>
      <div className="space-y-2">
        {PLANS.map((x) => (
          <div key={x.n} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
            <span className="w-16 text-xs font-medium text-gray-500">{x.n}</span>
            <span className="flex-1 text-sm">{x.d}</span>
            <span className="text-sm font-semibold">{x.p}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const FAQ = [
  {
    q: '群裡已經有其他機器人，可以用嗎？',
    a: 'LINE 規定一個群只能有一個官方帳號。要先把原本的機器人移出，群記才進得去。',
  },
  { q: '群記會在群裡說話嗎？', a: '只在剛進群時說明一次，以及有人 @群記 提問時回答。其餘時間完全安靜。' },
  {
    q: '跟 LINE 內建的聊天摘要有什麼不同？',
    a: '群記會把一句話變成有負責人、有期限的待辦，跨好幾個群一起看今天要做什麼，而且每一筆都能點回原話、經你確認才定案。',
  },
  { q: '資料存在哪裡？怎麼刪除？', a: '存在加密傳輸的雲端資料庫。管理員可以一鍵刪除整個群的資料；把群記移出群組就停止記錄。' },
  { q: '沒人認領會怎樣？', a: '認領前群記不記錄任何訊息。7 天內沒人認領，它會自動離開群組。' },
];

export function FaqSection() {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold tracking-tight">常見問題</h2>
      <div className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
        {FAQ.map((x) => (
          <details key={x.q} className="group px-3 py-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <span className="flex-1">{x.q}</span>
              <span className="text-gray-400 transition-transform group-open:rotate-45">＋</span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{x.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function LegalFooter() {
  return (
    <footer className="mt-10 flex flex-wrap justify-center gap-x-4 gap-y-1 pb-4 text-xs text-gray-500">
      <a className="underline" href="/terms">服務條款</a>
      <a className="underline" href="/privacy">隱私權政策</a>
      <a className="underline" href="/login">登入</a>
    </footer>
  );
}
