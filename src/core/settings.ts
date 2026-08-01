import { getDb } from '@/db';

// 可在 /settings 調整的設定（migration 011）。優先序：DB → 環境變數 → 程式預設。
//
// 為什麼需要同步讀取：EmbeddingProvider.modelId 是 readonly string（types.ts），
// 改成 async 會擴散到每個呼叫端。所以維持一份 module 級快取，由 refresh() 非同步更新——
// gemini.ts 在每次 API 呼叫的唯一收口 post() 裡 await refresh()，30 秒 TTL，
// 一次小小的 select 就涵蓋整批呼叫。
//
// 金鑰不在這裡：API key／token 只從環境變數讀。service-role 讀得到整張 app_settings，
// 把金鑰放進 DB 等於多開一條外洩路徑，而它們本來就不是會反覆調整的東西。

export type Settings = {
  genModel: string;
  embeddingModel: string;
  aiDailyFreeCalls: number | null;
};

export const DEFAULT_GEN_MODEL = 'gemini-3.5-flash-lite'; // 2.5-flash 已不開放新專案（2026-07 起新金鑰 404）
export const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';

const fromEnv = (): Settings => ({
  genModel: process.env.GEMINI_MODEL ?? DEFAULT_GEN_MODEL,
  embeddingModel: process.env.EMBEDDING_MODEL_ID ?? DEFAULT_EMBEDDING_MODEL,
  aiDailyFreeCalls: null,
});

const TTL = 30_000;
let cur: Settings = fromEnv();
let at = 0;

/** 目前生效的設定（同步、可能落後 TTL）。需要保證最新請先 await refresh()。 */
export const currentSettings = (): Settings => cur;

/** 從 DB 重讀（TTL 內直接回快取）。migration 011 未跑或 DB 不通時靜默沿用環境變數。 */
export async function refreshSettings(force = false): Promise<Settings> {
  if (!force && Date.now() - at < TTL) return cur;
  at = Date.now(); // 先寫時間戳：DB 掛掉時不要每次呼叫都重試
  try {
    const { data, error } = await getDb()
      .from('app_settings')
      .select('gen_model, embedding_model, ai_daily_free_calls')
      .eq('id', 1)
      .maybeSingle();
    if (error) return cur; // 欄位不存在（011 未跑）＝維持環境變數，不是錯誤
    const env = fromEnv();
    cur = {
      genModel: data?.gen_model?.trim() || env.genModel,
      embeddingModel: data?.embedding_model?.trim() || env.embeddingModel,
      aiDailyFreeCalls: Number(data?.ai_daily_free_calls) > 0 ? Number(data?.ai_daily_free_calls) : null,
    };
  } catch {
    /* DB 未設定：沿用環境變數 */
  }
  return cur;
}

/** 設定存檔後呼叫，讓下一次讀取立刻拿到新值。 */
export const invalidateSettings = () => {
  at = 0;
};
