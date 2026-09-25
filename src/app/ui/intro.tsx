import { IntroDemo } from './intro-demo';
import { AskMock, CalendarMock, FilesMock, InboxMock, MemberMock, PayrollMock, PunchMock, TasksMock, TodayMock } from './intro-mocks';

// 官方網站（/about）與認領頁（/claim）共用的介紹區塊。純靜態，唯一的互動在 IntroDemo。
// 捲動動畫全部是 CSS（globals.css 的 .reveal / .flow-line，animation-timeline: view()）：
// 不支援的瀏覽器直接顯示內容，只是沒有動畫——不會出現「捲到了卻是空白」。

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1 text-xs font-semibold tracking-widest text-emerald-700">{children}</p>
);

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
    <section id="demo" className="reveal scroll-mt-4">
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
    <section className="reveal">
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
          <div key={x.t} className="reveal rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-sm font-semibold">{x.t}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-600">{x.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 整理到哪裡：一條從對話到送達的流程線（捲動時線條長出來，節點逐個浮入）──
const FLOW = [
  { t: '群組對話', d: '大家照常講話。文字、圖片、PDF、語音都收，貼圖和「好」「收到」這類閒聊不記錄。', tag: '零輸入' },
  { t: 'AI 提取', d: '找出日期、時間、地點、負責人和拍板的決定，整理成行程、待辦、公告。', tag: '自動' },
  { t: '收件匣：人員確認', d: '每一筆都附上 AI 根據的那句原話。管理員或最清楚狀況的群成員按「確認」、改錯字，或一鍵忽略。', tag: '你把關' },
  { t: '定案歸位', d: '確認過的內容進月曆、待辦、公告與檔案。之後的對話若改期，AI 會提出更新，再等你確認。', tag: '可回溯' },
  { t: '送到每個人手上', d: '成員在 LINE 裡點開就看得到；訂閱的人每天早上收到私訊提醒；忘了就在群裡 @群記 問。', tag: '在 LINE 裡' },
];

export function FlowSection() {
  return (
    <section className="reveal">
      <Eyebrow>整理到哪裡</Eyebrow>
      <h2 className="mb-1 text-lg font-semibold tracking-tight">從一句話，到每個人的行事曆</h2>
      <p className="mb-5 text-sm text-gray-600">AI 只負責提出線索，人確認過才算數。</p>
      <ol className="relative space-y-5 pl-9">
        <span aria-hidden className="absolute top-2 bottom-2 left-[13px] w-0.5 rounded bg-gray-200" />
        <span aria-hidden className="flow-line absolute top-2 bottom-2 left-[13px] w-0.5 rounded bg-emerald-500" />
        {FLOW.map((s, i) => (
          <li key={s.t} className="reveal relative">
            <span className="absolute top-0 -left-9 grid h-7 w-7 place-items-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
              {i + 1}
            </span>
            <p className="flex items-center gap-2 font-semibold">
              {s.t}
              <span className="rounded-full bg-emerald-100 px-2 py-px text-[11px] font-medium text-emerald-900">{s.tag}</span>
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-gray-600">{s.d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── 功能巡禮：每個功能一段文字配一支小手機 ──
const FEATURES = [
  { t: '今天', d: '打開就知道今天要做什麼：跨好幾個群的行程與到期待辦排在同一條時間線，逾期的標紅，要你處理的放最上面。', mock: <TodayMock /> },
  { t: '收件匣', d: 'AI 整理的東西先到這裡排隊。每張卡片上面是原話、下面是整理結果：對就確認，錯就修改，不是就忽略——它會記住，不再犯。', mock: <InboxMock /> },
  { t: '月曆', d: '月、週、日、議程四種看法。有時間的行程自動排進時間軸；綠點是已確認、琥珀是待確認，一眼分得出。', mock: <CalendarMock /> },
  { t: '待辦', d: '每件事都有負責人與期限。點圈圈就完成，逾期自動提醒；群成員也能在 LINE 裡自己按完成。', mock: <TasksMock /> },
  { t: '檔案', d: '群裡傳的報價單、照片、PDF、語音都自動辨識文字，依專案歸類。之後搜「估價單」就找得到。', mock: <FilesMock /> },
  { t: '@群記 問答', d: '忘了？在群裡 @群記 問就好。它會回答，並告訴你是誰、哪天、在哪一則說的；查不到就直說查不到。', mock: <AskMock /> },
];

export function FeaturesSection() {
  return (
    <section>
      <div className="reveal">
        <Eyebrow>管理後台</Eyebrow>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">整理好的東西，都在這裡</h2>
        <p className="mb-6 text-sm text-gray-600">手機、電腦都能用。另外還有公告／決議、群組管理、聊天記錄匯入。</p>
      </div>
      <div className="space-y-12">
        {FEATURES.map((f, i) => (
          <div key={f.t} className={`reveal flex flex-col gap-4 md:items-center ${i % 2 ? 'md:flex-row-reverse' : 'md:flex-row'}`}>
            <div className="md:flex-1">
              <h3 className="text-base font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{f.d}</p>
            </div>
            <div className="md:flex-1">{f.mock}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function MemberSection() {
  return (
    <section className="reveal flex flex-col gap-4">
      <div>
        <Eyebrow>群組成員</Eyebrow>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">成員不用裝 App、不用註冊</h2>
        <p className="text-sm leading-relaxed text-gray-600">
          在 LINE 裡點一下就看得到自己群的行程、待辦、公告和檔案，「我的待辦」放最上面。最清楚狀況的人可以順手確認或修正 AI 整理的內容，也可以自己打開每天早上的私訊提醒。
        </p>
      </div>
      <MemberMock />
    </section>
  );
}

const ATTEND = [
  { t: 'GPS 打卡', d: '員工在 LINE 裡按一下打卡，伺服器確認人在公司設定的範圍內。' },
  { t: '補卡申請與審核', d: '忘了打卡就線上申請，主管核准後才算數，不會混進工時。' },
  { t: '五種語言', d: '中文、英文、日文、越南文、印尼文，外籍同事也看得懂。' },
  { t: '薪資自動計算', d: '內建台灣勞基法：平日、休息日、例假日、國定假日加班費與休息時段自動算。' },
  { t: '月結與報表', d: '結算後金額鎖定，改規則不影響已結算月份；一鍵匯出 CSV 給會計。' },
];

export function AttendSection() {
  return (
    <section>
      <div className="reveal">
        <Eyebrow>考勤模組 · Team 方案</Eyebrow>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">打卡與薪資，也在 LINE 裡完成</h2>
        <p className="mb-5 text-sm text-gray-600">同一個 LINE 帳號，員工打卡、主管審核、月底算薪一次搞定。</p>
      </div>
      <div className="reveal grid gap-6 md:grid-cols-2 md:items-start">
        <PunchMock />
        <PayrollMock />
      </div>
      <ul className="mt-6 space-y-3">
        {ATTEND.map((x) => (
          <li key={x.t} className="reveal flex gap-3">
            <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-emerald-500" />
            <span>
              <span className="block text-sm font-semibold">{x.t}</span>
              <span className="block text-sm text-gray-600">{x.d}</span>
            </span>
          </li>
        ))}
      </ul>
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
    <section className="reveal">
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
    <section className="reveal">
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
