import type { EmbeddingProvider, LLMProvider, VisionProvider } from '@/core/types';
import { getDb } from '@/db';

// Gemini REST API（規劃書預設 Provider）。API 單純，直接 fetch，不裝 SDK。
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const KEY = () => {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('缺少 GEMINI_API_KEY 環境變數');
  return k;
};
const GEN_MODEL = () => process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite'; // 2.5-flash 已不開放新專案（2026-07 起新金鑰 404）
const EMB_MODEL = () => process.env.EMBEDDING_MODEL_ID ?? 'gemini-embedding-001';

const EMBEDDING_DIM = 768; // 與 supabase/schema.sql 的 vector(768) 一致

// 用量自記帳（migration 006）：Google 沒有查詢剩餘額度的 API，自己記 token 供設定頁畫進度條。
// fire-and-forget：表未建/DB 未設定時靜默略過，絕不影響主流程。
function bump(f: { calls?: number; input?: number; output?: number; embed?: number; blocked?: number }) {
  try {
    getDb()
      .rpc('bump_usage', {
        p_calls: f.calls ?? 0,
        p_in: f.input ?? 0,
        p_out: f.output ?? 0,
        p_embed: f.embed ?? 0,
        p_blocked: f.blocked ?? 0,
      })
      .then(({ error }) => {
        if (error) console.warn('用量記帳失敗（migration 006 跑了嗎？）', error.message);
      });
  } catch {
    /* DB 未設定時不擋 API 呼叫 */
  }
}

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE}/${path}?key=${KEY()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 429) bump({ blocked: 1 }); // 配額/花費上限用完
    throw new Error(`Gemini API ${res.status}：${await res.text()}`);
  }
  const json = await res.json();
  if (path.includes('batchEmbedContents')) {
    // embedding 回應沒有 usageMetadata，以字元數估 token（中文約 1 字 1 token，英文會高估）
    const chars =
      (body as any)?.requests?.reduce(
        (n: number, r: any) => n + (r?.content?.parts?.[0]?.text?.length ?? 0),
        0,
      ) ?? 0;
    bump({ calls: 1, embed: chars });
  } else {
    const u = json.usageMetadata ?? {};
    const input = u.promptTokenCount ?? 0;
    // 2.5 系列的 thinking tokens 也算輸出計費，用 total - prompt 最保險
    bump({ calls: 1, input, output: Math.max(0, (u.totalTokenCount ?? input) - input) });
  }
  return json;
}

export const geminiLLM: LLMProvider = {
  async generate(prompt) {
    const json = await post(`models/${GEN_MODEL()}:generateContent`, {
      contents: [{ parts: [{ text: prompt }] }],
    });
    return (
      json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    );
  },

  async generateJson(prompt) {
    const json = await post(`models/${GEN_MODEL()}:generateContent`, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: 'application/json' },
    });
    const text =
      json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '{}';
    return JSON.parse(text);
  },
};

export const geminiVision: VisionProvider = {
  async analyze(data, mime) {
    // Gemini 原生吃圖片、PDF 與音訊，一個 Provider 三用，不需要 PDF 函式庫也不需要語音轉寫服務
    const audio = mime.startsWith('audio/');
    const prompt = audio
      ? // 語音：逐字稿放 ocr_text，讓它跟圖片/PDF 走同一條索引與抽取路徑（下游零改動）
        '把這段語音逐字轉寫成繁體中文，回覆 JSON：{"ocr_text":"完整逐字稿（聽不清楚的地方寫 ???，不要臆測）","summary":"一到兩句話的重點","category":"語音"}'
      : '分析這份圖片或文件，回覆 JSON：{"ocr_text":"其中所有可辨識的文字","summary":"一到兩句話的內容描述","category":"報價單、收據發票、現場照片、圖表、文件、其他 擇一"}';
    const json = await post(`models/${GEN_MODEL()}:generateContent`, {
      contents: [
        { parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: data.toString('base64') } }] },
      ],
      generationConfig: { response_mime_type: 'application/json' },
    });
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = JSON.parse(text);
    return {
      ocrText: parsed.ocr_text ?? '',
      summary: parsed.summary ?? '',
      category: parsed.category ?? '其他',
    };
  },
};

export const geminiEmbedding: EmbeddingProvider = {
  get modelId() {
    return EMB_MODEL();
  },
  dimensions: EMBEDDING_DIM,
  async embed(texts) {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 50) {
      // 每批 50 筆，避開單次請求上限
      const batch = texts.slice(i, i + 50);
      const json = await post(`models/${EMB_MODEL()}:batchEmbedContents`, {
        requests: batch.map((t) => ({
          model: `models/${EMB_MODEL()}`,
          content: { parts: [{ text: t.slice(0, 8000) }] },
          outputDimensionality: EMBEDDING_DIM,
        })),
      });
      for (const e of json.embeddings) out.push(normalize(e.values));
    }
    return out;
  },
};

// gemini-embedding-001 降維輸出不是單位向量，cosine 檢索前先正規化
function normalize(v: number[]): number[] {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}
