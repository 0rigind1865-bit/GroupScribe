// 法律文件頁的排版（隱私權政策／服務條款共用）。純靜態、無資料查詢。
export function LegalDoc({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl p-5 md:p-8">
      <p className="text-xs font-medium text-gray-500">GroupScribe</p>
      <h1 className="mt-1 mb-1 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mb-6 text-xs text-gray-500">最後更新：{updated}</p>
      <div className="space-y-6 text-sm leading-relaxed text-gray-700">{children}</div>
      <p className="mt-10 flex gap-4 text-xs text-gray-500">
        <a className="underline" href="/terms">服務條款</a>
        <a className="underline" href="/privacy">隱私權政策</a>
        <a className="underline" href="/start">建立組織</a>
      </p>
    </main>
  );
}
export const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="text-base font-semibold text-gray-900">{children}</h2>;
export const UL = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="list-disc space-y-1 pl-5">
    {items.map((it, i) => (
      <li key={i}>{it}</li>
    ))}
  </ul>
);
