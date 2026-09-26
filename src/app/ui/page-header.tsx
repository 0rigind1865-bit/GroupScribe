// 子頁頁首：返回鈕 + 單行截斷標題 + 右側動作（借鑑 wenhui-materials 的 .subhead）。
//
// back 一律是硬編碼路徑，不用 router.back()：這些頁面可能從 LIFF 深連結直接開啟，
// history 是空的，back() 會直接退出 LIFF。回哪裡是資訊架構的問題，不是瀏覽歷史的問題。
export function PageHeader({
  back,
  title,
  desc,
  right,
}: {
  back?: string;
  title: string;
  desc?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      {back && (
        <a
          href={back}
          aria-label="返回"
          className="btn h-9 w-9 flex-none px-0 text-gray-600"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </a>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl md:text-3xl">{title}</h1>
        {desc && <p className="truncate text-xs text-gray-500">{desc}</p>}
      </div>
      {right && <div className="flex flex-none items-center gap-2">{right}</div>}
    </div>
  );
}
