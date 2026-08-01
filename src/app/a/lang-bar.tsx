import { LOCALES, type Locale } from '@/attend/i18n';

// 語言切換列（伺服端渲染的純連結；/api/attend/lang 設 cookie 後導回）
export function LangBar({ current, back }: { current: Locale; back: string }) {
  return (
    <p className="mt-6 text-center text-xs text-gray-400">
      {LOCALES.map(([loc, label], i) => (
        <span key={loc}>
          {i > 0 && ' · '}
          {loc === current ? (
            <b className="text-gray-600">{label}</b>
          ) : (
            <a className="underline" href={`/api/attend/lang?to=${loc}&back=${encodeURIComponent(back)}`}>
              {label}
            </a>
          )}
        </span>
      ))}
    </p>
  );
}
