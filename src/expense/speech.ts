// 從 Snaptab lib/speech.ts 搬來：瀏覽器語音辨識（Web Speech API，免費、不需套件）。只在瀏覽器跑。
// 瀏覽器語音辨識(Web Speech API)封裝。預設繁體中文 zh-TW。
// iOS Safari / Android Chrome / 桌面 Chrome 大多支援;不支援時 isSpeechSupported() 回 false。
//
// UX 重點:
// - interimResults:邊講邊回傳「即時(未定稿)字幕」,讓使用者知道有在聽
// - 靜音自動結束:停止說話超過 silenceMs 就自動收音,使用者不必猜何時結束
// - maxMs:硬性上限,避免忘了關一直錄

interface RecognitionResultLike {
  readonly transcript: string;
}
interface RecognitionAlternativesLike extends ArrayLike<RecognitionResultLike> {
  readonly isFinal: boolean;
}
interface RecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionAlternativesLike>;
}
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: RecognitionEventLike) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return getCtor() !== null;
}

export interface Dictation {
  stop: () => void;
}

/**
 * 開始一次語音輸入。
 * - onInterim:即時(未定稿)字幕,持續更新;結束時會清空為 ''
 * - onFinal:一段定稿文字,應「附加」到既有內容
 * - 停止說話超過 silenceMs 自動結束;maxMs 為硬性上限
 * 不支援時回 null。
 */
export function startDictation(opts: {
  lang?: string;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onEnd?: () => void;
  onError?: () => void;
  silenceMs?: number;
  maxMs?: number;
}): Dictation | null {
  const Ctor = getCtor();
  if (!Ctor) return null;

  const silenceMs = opts.silenceMs ?? 1500;
  const maxMs = opts.maxMs ?? 20000;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const rec = new Ctor();
  rec.lang = opts.lang ?? 'zh-TW';
  rec.interimResults = true; // 即時字幕:邊講邊顯示
  rec.continuous = true; // 由我們用靜音計時器決定何時結束,而非講一句就斷

  const clearTimers = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (maxTimer) clearTimeout(maxTimer);
    silenceTimer = null;
    maxTimer = null;
  };
  const doStop = () => {
    if (stopped) return;
    stopped = true;
    clearTimers();
    try {
      rec.stop();
    } catch {
      /* 已停止或狀態異常時忽略 */
    }
  };
  // 偵測到語音活動就重設靜音計時:停頓滿 silenceMs 才自動收
  const bumpSilence = (ms: number) => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(doStop, ms);
  };

  rec.onresult = (e) => {
    let interim = '';
    let final = '';
    for (let i = e.resultIndex ?? 0; i < e.results.length; i++) {
      const alt = e.results[i];
      const t = alt?.[0]?.transcript ?? '';
      if (alt?.isFinal) final += t;
      else interim += t;
    }
    if (final) opts.onFinal?.(final);
    opts.onInterim?.(interim);
    bumpSilence(silenceMs);
  };
  rec.onend = () => {
    clearTimers();
    opts.onEnd?.();
  };
  rec.onerror = () => {
    clearTimers();
    opts.onError?.();
  };

  try {
    rec.start();
  } catch {
    // 某些瀏覽器在無權限/狀態異常時 start() 會直接丟錯,避免崩潰
    return null;
  }
  // 開場給較長的等待(還沒開口);硬性上限避免忘記關
  bumpSilence(silenceMs + 5000);
  maxTimer = setTimeout(doStop, maxMs);

  return { stop: doStop };
}
