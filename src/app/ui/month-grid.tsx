import { monthGrid } from '@/core/grid';

// 月曆格線骨架：星期表頭 + 7 欄格子。取代 3 份重複的星期表頭與 2 份格線 markup。
// 每一格長什麼樣由呼叫端的 cell() 決定——這裡只管排版，不管語意。
export function MonthGrid({
  ym,
  weekLabels,
  cell,
}: {
  ym: string; // YYYY-MM
  weekLabels: string[]; // 長度 7，日→六
  cell: (iso: string, day: number) => React.ReactNode;
}) {
  const [y, m] = ym.split('-').map(Number);
  return (
    <>
      <div className="mb-1 grid grid-cols-7 text-center text-xs text-gray-500">
        {weekLabels.map((w, i) => (
          <div key={i} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthGrid(y, m)
          .flat()
          .map((c, i) => (c ? <div key={i}>{cell(c.iso, c.day)}</div> : <div key={i} />))}
      </div>
    </>
  );
}
