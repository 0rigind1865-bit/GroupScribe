// 官方網站的「小手機畫面」：純 JSX 假介面，不用截圖（截圖會帶到真資料、也會跟著改版過期）。
// 內容是虛構的一般商務情境，不寫死任何產業（plan.md B.7）。

export function Phone({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="mx-auto w-full max-w-[21rem] min-w-0 rounded-[2rem] bg-gray-900 p-1.5 shadow-lg">
      <div className="overflow-hidden rounded-[1.6rem] bg-gray-50">
        <div className="border-b border-gray-200 bg-white px-3 py-2.5 text-center text-sm font-semibold">{title}</div>
        <div className="space-y-1.5 p-2.5 text-[13px]">{children}</div>
      </div>
    </div>
  );
}

// 真實後台截圖（scripts/shots.ts --site 用示範資料拍的，390×700 @2x）
export function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="mx-auto w-full max-w-[22rem] rounded-[2rem] bg-gray-900 p-1.5 shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={390} height={700} loading="lazy" className="block h-auto w-full rounded-[1.6rem]" />
    </div>
  );
}

const Row = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 ${className}`}>{children}</div>
);

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
          <span className="mt-1 block text-[11px] text-gray-500">來源：阿凱 9/18 14:02（估價單.pdf）</span>
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
            <p className="text-[11px] text-gray-500">
              {f.k} · {f.p}
            </p>
          </div>
        ))}
      </div>
      <p className="px-1 text-[11px] text-gray-500">圖片、PDF 自動辨識文字，之後搜得到</p>
    </Phone>
  );
}

export function PunchMock() {
  return (
    <Phone title="打卡">
      <div className="flex flex-col items-center gap-1.5 rounded-lg bg-white py-3">
        <span className="text-[12px] text-gray-500">9 月 25 日 週四 08:52</span>
        <span className="grid h-20 w-20 place-items-center rounded-full bg-emerald-600 text-sm font-semibold text-white shadow-md">上班打卡</span>
        <span className="rounded-full bg-emerald-100 px-2 py-px text-[12px] text-emerald-900">📍 在打卡範圍內 · 總公司</span>
      </div>
      <div className="grid grid-cols-5 gap-0.5 text-center text-[11px] text-gray-500">
        {['中文', 'English', '日本語', 'Tiếng Việt', 'Indonesia'].map((l) => (
          <span key={l} className="truncate rounded bg-white py-0.5">
            {l}
          </span>
        ))}
      </div>
      <Row>
        <span className="flex-1">忘了打卡？</span>
        <span className="rounded border border-gray-300 px-1.5 text-[12px]">申請補卡</span>
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
        <span className="flex-1 rounded border border-gray-300 bg-white py-1 text-center text-[12px]">月結鎖定</span>
        <span className="flex-1 rounded border border-gray-300 bg-white py-1 text-center text-[12px]">匯出 CSV</span>
      </div>
    </Phone>
  );
}
