import {
  AttendSection,
  BrandBar,
  DemoSection,
  FaqSection,
  FeaturesSection,
  FlowSection,
  LegalFooter,
  MemberSection,
  PlansSection,
  StepsSection,
  TrustSection,
} from '@/app/ui/intro';

export const metadata = { title: '群裡講過的，都記得' };

// 官方網站：手機優先，單欄；底部固定一顆「免費開始」（拇指區，費茨定律）。
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-md pb-24">
      <BrandBar right={<a className="btn btn-sm" href="/login">登入</a>} />

      <section className="px-5 pt-6 pb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark-512.png" alt="群記的貓頭鷹標誌" className="mx-auto h-28 w-28 rounded-3xl shadow-sm" />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">群裡講過的，都記得。</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-gray-600">
          把群記邀進你的 LINE 工作群，它會安靜地把對話整理成行程、待辦和公告。不插嘴、不用換 App、不用教員工。
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <a className="btn-primary h-11 w-full text-base" href="/start">
            免費開始
          </a>
          <a className="btn h-11 w-full" href="#demo">
            看看怎麼運作
          </a>
        </div>
      </section>

      <div className="space-y-16 px-4">
        <DemoSection />
        <FlowSection />
        <FeaturesSection />
        <MemberSection />
        <AttendSection />
        <StepsSection />
        <TrustSection />
        <PlansSection />
        <FaqSection />
      </div>

      <LegalFooter />

      {/* 手機底部懸浮膠囊 CTA（與後台的懸浮導覽同一語言）；桌機不需要（整頁一眼看得完）。
          外層不吃點擊，膠囊兩側透出的頁面照樣點得到。 */}
      <div
        data-cta
        className="pointer-events-none fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-6 md:hidden"
      >
        <a className="btn-primary pointer-events-auto h-12 w-full max-w-xs rounded-full text-base shadow-lg" href="/start">
          免費開始 · 1 個群免費
        </a>
      </div>
    </div>
  );
}
