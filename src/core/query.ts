import { getDb } from '@/db';
import { aiScope } from './quota';
import { getEmbedding, getLLM } from './config';
import { getProfile } from './profile';

// 「最新狀態」型問題：加快時間衰減，讓最近的資訊排前面（規劃書第 1 節推論 2）
const LATEST_RE = /最新|目前|現在|報價|價格|金額|多少|數量|幾[個台組支條張筆]|日期|時間|幾點|什麼時候|進度|狀態/;

// 時間加權排序：相似度 × 指數時間衰減（最新狀態型半衰期 7 天，一般問題 60 天）
export function rankHits<T extends { similarity: number; created_at: string }>(
  hits: T[],
  question: string,
  now = Date.now(),
): T[] {
  const halfLifeDays = LATEST_RE.test(question) ? 7 : 60;
  return hits
    .map((h) => ({
      h,
      score:
        h.similarity *
        Math.exp((-Math.LN2 / halfLifeDays) * Math.max(0, (now - new Date(h.created_at).getTime()) / 86_400_000)),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.h);
}

// 已確認的結構化資料（計劃 B.9）：人背書過，信度高於原始對話片段。
// 沒有這段的話，人在 Dashboard 把時間從 15:00 改成 14:00，@bot 問還是會從舊聊天答 15:00
// ——人的確認勞動對 AI 零回報，迴路斷在出口端。
const UPCOMING_LIMIT = 20; // 未來事件（最相關）
const RECENT_PAST_LIMIT = 5; // 剛過去的事件，供「上次那場」類問題
const OTHER_LIMIT = 20;
const NOTE_MAX_AGE_DAYS = 365; // 太舊的公告不當現行權威（行末仍附日期讓 LLM 自行判斷）

// 每筆都附「最後更新時間」——沒有它，LLM 無從判斷「對話裡較新的更正/取消」與這裡誰才是現況
const stamp = (d?: string | null) => (d ? `（更新於 ${String(d).slice(0, 10)}）` : '');

async function confirmedFacts(groupId: string, todayIso: string): Promise<string> {
  const db = getDb();
  const past7 = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const noteCut = new Date(Date.now() - NOTE_MAX_AGE_DAYS * 86_400_000).toISOString();
  const base = () => db.from('events').select('title, starts_at, start_time, location, updated_at').eq('group_id', groupId).eq('status', 'active').eq('needs_confirmation', false);
  const [up, past, tk, nt] = await Promise.all([
    // 由今天往未來取——原本從 14 天前開始升冪＋limit，會讓最舊的填滿額度、把當期項目靜默截掉
    base().gte('starts_at', todayIso).order('starts_at').limit(UPCOMING_LIMIT),
    base().gte('starts_at', past7).lt('starts_at', todayIso).order('starts_at', { ascending: false }).limit(RECENT_PAST_LIMIT),
    db.from('tasks').select('title, assignee, due_at, updated_at').eq('group_id', groupId)
      .eq('status', 'open').eq('needs_confirmation', false)
      .order('due_at', { nullsFirst: false }).limit(OTHER_LIMIT),
    db.from('notes').select('title, body, kind, created_at, updated_at').eq('group_id', groupId)
      .eq('status', 'active').eq('needs_confirmation', false).gte('created_at', noteCut)
      .order('created_at', { ascending: false }).limit(OTHER_LIMIT),
  ]);
  // 權威資料靜默消失比沒有更危險（會讓 bot 用舊對話回答且無跡可循）
  for (const [name, r] of [['事件', up], ['近期事件', past], ['待辦', tk], ['公告', nt]] as const) {
    if (r.error) console.error(`已確認${name}查詢失敗，本次回答缺少這部分權威資料`, groupId, r.error);
  }
  const lines = [
    ...[...(up.data ?? []), ...(past.data ?? [])]
      .sort((a: any, b: any) => a.starts_at.localeCompare(b.starts_at))
      .map((e: any) =>
        `事件｜${e.starts_at}${e.start_time ? ` ${String(e.start_time).slice(0, 5)}` : ''}｜${e.title}${e.location ? `｜地點：${e.location}` : ''}${stamp(e.updated_at)}`),
    ...(tk.data ?? []).map((t: any) =>
      `待辦｜${t.title}${t.assignee ? `｜負責：${t.assignee}` : ''}${t.due_at ? `｜期限：${t.due_at}` : ''}${stamp(t.updated_at)}`),
    ...(nt.data ?? []).map((n: any) =>
      `${n.kind === 'decision' ? '決議' : '公告'}｜${n.title}${n.body ? `：${n.body.slice(0, 80)}` : ''}${stamp(n.updated_at ?? n.created_at)}`),
  ];
  return lines.join('\n');
}

// 費用煞車：進門先查該 org 本月額度（core/quota.ts）
export async function answer(groupId: string, question: string): Promise<string> {
  return aiScope(groupId, () => answerInner(groupId, question));
}

async function answerInner(groupId: string, question: string): Promise<string> {
  const emb = getEmbedding();
  const todayIso = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });
  const [qv] = await emb.embed([question]);
  const [{ data: hits, error }, confirmed] = await Promise.all([
    getDb().rpc('match_embeddings', {
      query_embedding: qv,
      p_group_id: groupId,
      p_model_id: emb.modelId,
      match_count: 50,
    }),
    confirmedFacts(groupId, todayIso),
  ]);
  if (error) throw error;
  if (!hits?.length && !confirmed) return '這個群組還沒有可查詢的紀錄（可先在 Dashboard 匯入聊天記錄）。';

  const top = rankHits((hits ?? []) as { similarity: number; created_at: string; chunk_text: string }[], question)
    .slice(0, 8)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); // 給 LLM 的脈絡照時間排

  const profile = await getProfile(groupId); // 群組理解：讓回答讀懂此群行話、給貼合其產業的建議

  const prompt = `你是工作群組的資訊助理，根據下方資料回答問題。今天是 ${todayIso}（時區 Asia/Taipei），相對日期（明天、下週）一律以此推算。
規則：
1. 一律使用繁體中文，簡短直接。
2. **【已確認資料】是核對過的現況，優先於【對話紀錄】**（例如已確認資料寫 14:00、舊對話說 15:00，答 14:00）。
3. **例外——比較時間先後**：每筆已確認資料都附「更新於 YYYY-MM-DD」。若對話紀錄中有**更晚**的訊息明確表示改期、更正或取消，那則對話才是最新狀況：此時要兩者都講（例如「已確認的行程是 9/3 08:00，但 7/24 阿華在群裡說這場取消了，請再確認」），不要只答其中一邊。
4. 必須註明來源——出自對話紀錄的要說誰、什麼時候說的（每行開頭的 [時間 人名] 就是來源）；出自已確認資料的說「已確認的行程/待辦」即可。
5. 同一來源有多筆相關資訊時以最新一筆為準，可附註舊資訊供對照。
6. 事實性問題：兩邊都找不到答案就直接說「紀錄中查不到」，禁止推測或編造。
7. 對方要的是建議或做法時：根據資料與群組背景給具體可行的建議，並區分哪些出自紀錄、哪些是你的建議。
${profile ? `\n【群組背景】（AI 從此群紀錄歸納的產業/術語/案子，僅供理解脈絡與給建議）\n${profile}\n` : ''}${confirmed ? `\n【已確認資料】（已核對的現況，每筆附最後更新日）\n${confirmed}\n` : ''}
【對話紀錄】（原始對話，未經核對）
${top.length ? top.map((h) => h.chunk_text).join('\n') : '（無相關對話片段）'}

【問題】${question}`;

  return getLLM().generate(prompt);
}
