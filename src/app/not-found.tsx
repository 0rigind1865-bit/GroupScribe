import { locale, t } from '@/attend/i18n';

// 全站 404（T10 第 2 輪）：原本是 Next 內建英文頁，沒有品牌、沒有路。
// 文案刻意不分「不存在」與「沒權限」——各 layout 用 notFound() 就是為了不洩漏公司存不存在。
// 「回首頁」經 / 依身分落地（群組成員 → /g、員工 → /a、管理者 → 上次選的工具）。
export default async function NotFound() {
  const loc = await locale();
  return (
    <main className="mx-auto max-w-md p-6 pt-16 text-center">
      <p className="mb-2 text-lg font-bold">群記</p>
      <p className="text-sm text-gray-500">{t(loc, 'NOT_FOUND')}</p>
      <a className="btn mt-4 inline-block" href="/">
        {t(loc, 'GO_HOME')}
      </a>
    </main>
  );
}
