// 全站狀態語意色（第一層）：跨模組不可衝突，四個就夠。
//
// 為什麼要收斂：考勤模組併入後，emerald 在群組助理側＝事件、在考勤側＝下班卡；
// sky＝待辦 vs 上班卡——同一個人切換模組時同一個顏色意思相反，違反 principles.md 的
// 「別讓我想」。收斂後顏色只表達「狀態」，「類型」交給文字與圖示。
//
// 第二層（模組內類型色）不在這裡：群組助理的 事件=emerald / 待辦=sky / 公告=purple
// 是服役中的既有語言，維持不動——它們在單一模組內部不會與狀態語意打架。
export type Tone = 'ok' | 'warn' | 'err' | 'neutral';

/** 淺底 + 深字（徽章、橫幅）。深色模式的 remap 在 globals.css。 */
export const TONE_SOFT: Record<Tone, string> = {
  ok: 'bg-emerald-100 text-emerald-900',
  warn: 'bg-amber-100 text-amber-900',
  err: 'bg-red-100 text-red-700',
  neutral: 'bg-gray-100 text-gray-700',
};

/** 橫幅用：比徽章再淡一階，長文字不刺眼 */
export const TONE_BANNER: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-900',
  warn: 'bg-amber-50 text-amber-900',
  err: 'bg-red-50 text-red-700',
  neutral: 'bg-gray-100 text-gray-700',
};

/** 橫幅（Alert）的描邊：Origin UI 的 alert 是淡底＋同色系細框 */
export const TONE_BORDER: Record<Tone, string> = {
  ok: 'border-emerald-200',
  warn: 'border-amber-200',
  err: 'border-red-200',
  neutral: 'border-gray-200',
};

/** 數字強調用（統計卡） */
export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-emerald-700',
  warn: 'text-amber-700',
  err: 'text-red-600',
  neutral: 'text-gray-900',
};
