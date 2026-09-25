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

      {/* 手機底部固定 CTA；桌機不需要（整頁一眼看得完） */}
      <div data-cta className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/90 p-3 backdrop-blur md:hidden">
        <a className="btn-primary h-11 w-full text-base" href="/start">
          免費開始 · 1 個群免費
        </a>
      </div>
    </div>
  );
}
