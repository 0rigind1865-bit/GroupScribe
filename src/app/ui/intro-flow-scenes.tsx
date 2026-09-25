// 「整理到哪裡」每一步的小畫面。以 key={step} 重掛，每次切換都重播進場動畫（msg-in / card-pop / badge-pop）。
// 內容是虛構的一般商務情境，不寫死任何產業（plan.md B.7）。

const Bubble = ({ who, text, delay = 0, glow = false }: { who: string; text: string; delay?: number; glow?: boolean }) => (
  <div className="msg-in flex items-start gap-1.5" style={{ animationDelay: `${delay}ms` }}>
    <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-600">{who.slice(-1)}</span>
    <p className={`rounded-2xl rounded-tl-sm bg-white px-2.5 py-1.5 text-[13px] shadow-xs ${glow ? 'scan-glow' : ''}`}>{text}</p>
  </div>
);

const Card = ({ chip, cls, title, meta, delay = 0 }: { chip: string; cls: string; title: string; meta: string; delay?: number }) => (
  <div className="card-pop flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-2.5 py-2" style={{ animationDelay: `${delay}ms` }}>
    <span className={`flex-none rounded-full px-1.5 py-px text-[11px] font-medium text-white ${cls}`}>{chip}</span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13px] font-semibold">{title}</span>
      <span className="block truncate text-[11px] text-gray-500">{meta}</span>
    </span>
  </div>
);

function Chat() {
  return (
    <div className="space-y-2 bg-sky-50 p-3">
      <Bubble who="老王" text="週四下午兩點在新莊倉庫點貨" />
      <Bubble who="小林" text="好" delay={350} />
      <Bubble who="雅婷" text="以後報價單一律副本給會計" delay={700} />
    </div>
  );
}

function Extract() {
  return (
    <div className="space-y-2 p-3">
      <Bubble who="老王" text="週四下午兩點在新莊倉庫點貨" glow />
      <p className="msg-in text-center text-xs text-emerald-700" style={{ animationDelay: '350ms' }}>
        ↓ 群記整理出
      </p>
      <Card chip="行程" cls="bg-emerald-600" title="新莊倉庫點貨" meta="週四 14:00" delay={550} />
    </div>
  );
}

function Review() {
  return (
    <div className="p-3">
      <div className="card-pop space-y-1.5 rounded-xl border border-gray-200 bg-white p-2.5">
        <p className="rounded bg-gray-50 px-2 py-1 text-[11px] text-gray-500">[09:10 老王] 週四下午兩點在新莊倉庫點貨</p>
        <div className="flex items-center gap-2">
          <span className="flex-none rounded-full bg-emerald-600 px-1.5 py-px text-[11px] font-medium text-white">行程</span>
          <span className="flex-1 text-[13px] font-semibold">新莊倉庫點貨</span>
          <span className="relative">
            <span className="badge-pop inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900" style={{ animationDelay: '900ms' }}>
              ✓ 已確認
            </span>
            {/* 游標點下去的漣漪（與示範短劇同一套） */}
            <span className="click-ripple absolute top-1 left-6 h-5 w-5 rounded-full bg-amber-400" style={{ animationDelay: '750ms' }} />
          </span>
        </div>
      </div>
      <p className="msg-in mt-2 text-center text-xs text-gray-500" style={{ animationDelay: '1100ms' }}>
        對就確認・錯就修改・不是就忽略
      </p>
    </div>
  );
}

function Places() {
  const days = [22, 23, 24, 25, 26, 27, 28]; // 一週就好：小卡放不下兩週還看得清楚
  return (
    <div className="grid grid-cols-3 gap-2 p-3 text-[11px]">
      <div className="card-pop rounded-xl border border-gray-200 bg-white p-2">
        <p className="mb-1 font-semibold">月曆</p>
        <div className="grid grid-cols-7 text-center text-[10px] text-gray-400">
          {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
            <span key={w}>{w}</span>
          ))}
          {days.map((d) => (
            <span key={d} className={`flex flex-col items-center ${d === 25 ? 'font-semibold text-emerald-700' : ''}`}>
              {d}
              <span className={`h-1 w-1 rounded-full ${d === 25 ? 'bg-emerald-500' : ''}`} />
            </span>
          ))}
        </div>
        <p className="mt-1 truncate text-[10px] text-gray-500">25 · 14:00 點貨</p>
      </div>
      <div className="card-pop rounded-xl border border-gray-200 bg-white p-2" style={{ animationDelay: '200ms' }}>
        <p className="mb-1 font-semibold">待辦</p>
        <p className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 flex-none rounded-full border-2 border-sky-500" />
          帶清單
        </p>
        <p className="mt-0.5 text-[10px] text-gray-500">小林 · 週四</p>
      </div>
      <div className="card-pop rounded-xl border border-gray-200 bg-white p-2" style={{ animationDelay: '400ms' }}>
        <p className="mb-1 font-semibold">公告</p>
        <p className="leading-snug">報價單副本給會計</p>
      </div>
    </div>
  );
}

function Deliver() {
  return (
    <div className="space-y-2 p-3">
      <div className="msg-in flex items-start gap-2 rounded-2xl bg-white p-2.5 shadow-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark-512.png" alt="" className="h-8 w-8 flex-none rounded-lg" />
        <span className="min-w-0 text-[12px]">
          <span className="block font-semibold">群記 · 早安摘要</span>
          <span className="block text-gray-600">今天 14:00 新莊倉庫點貨；你的待辦：帶點貨清單</span>
        </span>
      </div>
      <p className="msg-in flex justify-end" style={{ animationDelay: '500ms' }}>
        <span className="rounded-2xl rounded-tr-sm bg-emerald-100 px-2.5 py-1.5 text-[12px] text-emerald-900">@群記 報價單要副本給誰？</span>
      </p>
      <p className="msg-in text-[12px]" style={{ animationDelay: '900ms' }}>
        <span className="inline-block rounded-2xl rounded-tl-sm bg-white px-2.5 py-1.5 shadow-xs">給會計（雅婷 9/23 說的）</span>
      </p>
    </div>
  );
}

export const SCENES = [Chat, Extract, Review, Places, Deliver];
