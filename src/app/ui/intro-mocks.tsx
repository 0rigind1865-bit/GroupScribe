// 官方網站的「小手機畫面」：純 JSX 假介面，不用截圖（截圖會帶到真資料、也會跟著改版過期）。
// 內容是虛構的一般商務情境，不寫死任何產業（plan.md B.7）。

export function Phone({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="mx-auto w-full max-w-[17rem] min-w-0 rounded-[2rem] bg-gray-900 p-1.5 shadow-lg">
      <div className="overflow-hidden rounded-[1.6rem] bg-gray-50">
        <div className="border-b border-gray-200 bg-white px-3 py-2 text-center text-xs font-semibold">{title}</div>
        <div className="space-y-1.5 p-2.5 text-[11px]">{children}</div>
      </div>
    </div>
  );
}

const Chip = ({ c, t }: { c: string; t: string }) => (
  <span className={`flex-none rounded-full px-1.5 py-px text-[10px] font-medium text-white ${c}`}>{t}</span>
);
const Row = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 ${className}`}>{children}</div>
);
const Circle = ({ late = false }: { late?: boolean }) => (
  <span className={`h-3.5 w-3.5 flex-none rounded-full border-2 ${late ? 'border-red-400' : 'border-sky-500'}`} />
);

export function TodayMock() {
  return (
    <Phone title="今天">
      <p className="px-1 text-[10px] font-semibold text-amber-700">需要你處理</p>
      <Row className="border-amber-200 bg-amber-50">
        <b className="text-sm text-amber-900">3</b>
        <span className="text-amber-900">待你確認</span>
      </Row>
      <div className="flex gap-2 pt-1">
        <div className="w-7 text-center">
          <b className="block text-base leading-none text-emerald-700">25</b>
          <span className="text-[9px] text-gray-500">今天</span>
        </div>
        <div className="flex-1 space-y-1.5">
          <Row>
            <Circle late />
            <span className="flex-1">回覆廠商報價</span>
            <span className="text-[9px] text-red-600">逾期</span>
          </Row>
          <Row>
            <span className="rounded bg-emerald-100 px-1 text-[9px] font-semibold text-emerald-900">14:00</span>
            <span className="flex-1">新莊倉庫點貨</span>
          </Row>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="w-7 text-center">
          <b className="block text-base leading-none">26</b>
          <span className="text-[9px] text-gray-500">週五</span>
        </div>
        <Row className="flex-1">
          <Circle />
          <span className="flex-1">傳新版估價單</span>
          <span className="rounded-full bg-emerald-100 px-1 text-[9px] text-emerald-900">專案群</span>
        </Row>
      </div>
    </Phone>
  );
}

export function InboxMock() {
  return (
    <Phone title="收件匣 · 還剩 3 筆">
      <div className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-2">
        <p className="rounded bg-gray-50 px-1.5 py-1 text-[10px] text-gray-500">[09:10 老王] 週四下午兩點在新莊倉庫點貨</p>
        <div className="flex items-center gap-1.5">
          <Chip c="bg-emerald-600" t="行程" />
          <b className="flex-1">新莊倉庫點貨</b>
          <span className="rounded-full bg-amber-100 px-1.5 text-[9px] text-amber-900">待確認</span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
          <span className="rounded border border-gray-300 py-1">忽略</span>
          <span className="rounded border border-gray-300 py-1">修改</span>
          <span className="rounded border border-amber-300 bg-amber-50 py-1 font-semibold text-amber-900">確認</span>
        </div>
      </div>
      <div className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-2 opacity-70">
        <p className="rounded bg-gray-50 px-1.5 py-1 text-[10px] text-gray-500">[09:15 雅婷] 以後報價單一律副本給會計</p>
        <div className="flex items-center gap-1.5">
          <Chip c="bg-purple-600" t="公告" />
          <b className="flex-1">報價單副本給會計</b>
        </div>
      </div>
    </Phone>
  );
}

export function CalendarMock() {
  const dots: Record<number, string> = { 3: 'bg-emerald-500', 9: 'bg-emerald-500', 14: 'bg-amber-500', 18: 'bg-emerald-500', 25: 'bg-emerald-500', 26: 'bg-amber-500' };
  return (
    <Phone title="月曆 · 9 月">
      <div className="grid grid-cols-7 gap-0.5 rounded-lg bg-white p-1.5 text-center text-[10px]">
        {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
          <span key={d} className="text-gray-400">
            {d}
          </span>
        ))}
        {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
          <span key={d} className={`flex flex-col items-center rounded py-0.5 ${d === 25 ? 'bg-emerald-600 font-semibold text-white' : ''}`}>
            {d}
            <span className={`mt-px h-1 w-1 rounded-full ${dots[d] ?? ''}`} />
          </span>
        ))}
      </div>
      <Row>
        <span className="rounded bg-emerald-100 px-1 text-[9px] font-semibold text-emerald-900">14:00</span>
        <span className="flex-1">新莊倉庫點貨</span>
      </Row>
      <p className="px-1 text-[9px] text-gray-500">綠點＝已確認・琥珀＝待確認</p>
    </Phone>
  );
}

export function TasksMock() {
  return (
    <Phone title="待辦">
      {[
        { t: '回覆廠商報價', who: '雅婷', due: '逾期 9/24', late: true },
        { t: '帶點貨清單', who: '小林', due: '期限 9/25' },
        { t: '傳新版估價單', who: '阿凱', due: '期限 9/26' },
      ].map((x) => (
        <Row key={x.t}>
          <Circle late={x.late} />
          <span className="flex-1">{x.t}</span>
          <span className="rounded-full bg-gray-100 px-1.5 text-[9px] text-gray-600">{x.who}</span>
          <span className={`text-[9px] ${x.late ? 'font-semibold text-red-600' : 'text-gray-500'}`}>{x.due}</span>
        </Row>
      ))}
      <p className="px-1 text-[9px] text-gray-500">點圈圈＝完成；每一筆都能點回原話</p>
    </Phone>
  );
}

export function AskMock() {
  return (
    <Phone title="專案群">
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-2xl rounded-tr-sm bg-emerald-100 px-2 py-1.5 text-emerald-900">@群記 上次那份估價單多少錢？</p>
      </div>
      <div className="flex items-start gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark-512.png" alt="" className="h-6 w-6 flex-none rounded-lg" />
        <p className="rounded-2xl rounded-tl-sm bg-white px-2 py-1.5 shadow-xs">
          9/18 阿凱傳的估價單，總計 NT$48,000，含運費。
          <span className="mt-1 block text-[9px] text-gray-500">來源：阿凱 9/18 14:02（估價單.pdf）</span>
        </p>
      </div>
    </Phone>
  );
}

export function FilesMock() {
  return (
    <Phone title="檔案">
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { n: '估價單.pdf', k: '報價', p: '倉儲案' },
          { n: '現場照片', k: '照片', p: '倉儲案' },
          { n: '合約草稿.pdf', k: '合約', p: '辦公室案' },
          { n: '語音 0:42', k: '已轉文字', p: '辦公室案' },
        ].map((f) => (
          <div key={f.n} className="rounded-lg border border-gray-200 bg-white p-1.5">
            <div className="mb-1 h-8 rounded bg-gray-100" />
            <p className="truncate font-semibold">{f.n}</p>
            <p className="text-[9px] text-gray-500">
              {f.k} · {f.p}
            </p>
          </div>
        ))}
      </div>
      <p className="px-1 text-[9px] text-gray-500">圖片、PDF 自動辨識文字，之後搜得到</p>
    </Phone>
  );
}

export function MemberMock() {
  return (
    <Phone title="專案群 · 在 LINE 裡打開">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">有 1 件 AI 整理的內容要你確認</div>
      <p className="px-1 pt-1 text-[10px] font-semibold text-sky-700">我的待辦</p>
      <Row>
        <Circle />
        <span className="flex-1">帶點貨清單</span>
        <span className="rounded-full bg-sky-100 px-1.5 text-[9px] text-sky-900">可能是你的</span>
      </Row>
      <p className="px-1 pt-1 text-[10px] font-semibold text-gray-600">本週行程</p>
      <Row>
        <span className="rounded bg-emerald-100 px-1 text-[9px] font-semibold text-emerald-900">14:00</span>
        <span className="flex-1">新莊倉庫點貨</span>
      </Row>
      <Row className="justify-between">
        <span>每天早上私訊我摘要</span>
        <span className="h-4 w-7 rounded-full bg-emerald-500 p-0.5">
          <span className="ml-auto block h-3 w-3 rounded-full bg-white" />
        </span>
      </Row>
    </Phone>
  );
}

export function PunchMock() {
  return (
    <Phone title="打卡">
      <div className="flex flex-col items-center gap-1.5 rounded-lg bg-white py-3">
        <span className="text-[10px] text-gray-500">9 月 25 日 週四 08:52</span>
        <span className="grid h-20 w-20 place-items-center rounded-full bg-emerald-600 text-sm font-semibold text-white shadow-md">上班打卡</span>
        <span className="rounded-full bg-emerald-100 px-2 py-px text-[10px] text-emerald-900">📍 在打卡範圍內 · 總公司</span>
      </div>
      <div className="grid grid-cols-5 gap-0.5 text-center text-[9px] text-gray-500">
        {['中文', 'English', '日本語', 'Tiếng Việt', 'Indonesia'].map((l) => (
          <span key={l} className="truncate rounded bg-white py-0.5">
            {l}
          </span>
        ))}
      </div>
      <Row>
        <span className="flex-1">忘了打卡？</span>
        <span className="rounded border border-gray-300 px-1.5 text-[10px]">申請補卡</span>
      </Row>
    </Phone>
  );
}

export function PayrollMock() {
  const rows = [
    ['正常工時', '168 小時', ''],
    ['平日加班', '12 小時', '×4/3、×5/3'],
    ['休息日加班', '8 小時', '×4/3→×8/3'],
    ['國定假日', '1 天', '加倍'],
  ];
  return (
    <Phone title="報表 · 9 月 · 小林">
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {rows.map(([a, b, c]) => (
          <div key={a} className="flex items-center gap-1 px-2 py-1">
            <span className="flex-1">{a}</span>
            <span className="text-gray-500">{c}</span>
            <b className="w-14 text-right">{b}</b>
          </div>
        ))}
      </div>
      <Row className="justify-between border-emerald-200 bg-emerald-50">
        <span className="text-emerald-900">本月應發</span>
        <b className="text-sm text-emerald-900">NT$36,850</b>
      </Row>
      <div className="flex gap-1">
        <span className="flex-1 rounded border border-gray-300 bg-white py-1 text-center text-[10px]">月結鎖定</span>
        <span className="flex-1 rounded border border-gray-300 bg-white py-1 text-center text-[10px]">匯出 CSV</span>
      </div>
    </Phone>
  );
}
