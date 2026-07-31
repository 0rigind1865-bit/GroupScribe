import { getDb } from '@/db';
import { getLLM } from './config';
import { label } from './ingest';
import { getProfile, profileGroup } from './profile';

// 結構化抽取引擎：把對話轉成事件（月曆）與待辦（清單）
// 觸發：webhook 處理完後對觸及群組呼叫 extractGroup()；回補走 /api/extract 或 scripts/extract.ts

const BATCH = 50; // 每輪最多抽取則數，loop 到抽完
const CONTEXT = 20; // 前文脈絡則數（解決「1500」這種跨訊息指代）
const MAX_EXISTING = 60; // 餵進 prompt 的既有事件/待辦上限（events 依 starts_at 升序取，
// 太小會讓遠期行程被截斷——AI 看不到就會重複建立而不是 update。60 筆約 3k 字元，成本可忽略）

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NOTE_KIND_RE = /^(announcement|decision)$/; // 公告 / 決議

export interface RefMaps {
  msgs: Map<string, string>; // M1 → message uuid
  events: Map<string, string>; // E1 → event uuid
  tasks: Map<string, string>; // T1 → task uuid
  notes: Map<string, string>; // N1 → note uuid
}

export type ParsedOp =
  | { op: 'create_event'; title: string; date: string; time: string | null; location: string | null; note: string | null; sourceIds: string[] }
  | { op: 'update_event'; id: string; title?: string; date?: string; time?: string; location?: string; note?: string; sourceIds: string[] }
  | { op: 'create_task'; title: string; assignee: string | null; due: string | null; note: string | null; sourceIds: string[] }
  | { op: 'update_task'; id: string; title?: string; assignee?: string; due?: string; note?: string; sourceIds: string[] }
  | { op: 'create_note'; title: string; kind: string; body: string | null; sourceIds: string[] }
  | { op: 'update_note'; id: string; title?: string; kind?: string; body?: string; sourceIds: string[] };

const validDate = (s: unknown): s is string =>
  typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(new Date(s).getTime());
const validTime = (s: unknown): s is string => typeof s === 'string' && TIME_RE.test(s);
const str = (s: unknown): string | null => (typeof s === 'string' && s.trim() ? s.trim() : null);

// LLM 輸出驗證（純函式，可測試）：壞操作丟棄不毀整批；update 的 ref 必須存在；未知 source_ref 忽略
export function parseOps(raw: unknown, refs: RefMaps): ParsedOp[] {
  const ops = (raw as { operations?: unknown })?.operations;
  if (!Array.isArray(ops)) return [];
  const out: ParsedOp[] = [];

  for (const o of ops as any[]) {
    const sourceIds = (Array.isArray(o?.source_refs) ? o.source_refs : [])
      .map((r: unknown) => (typeof r === 'string' ? refs.msgs.get(r) : undefined))
      .filter((x: string | undefined): x is string => !!x);

    switch (o?.op) {
      case 'create_event': {
        const title = str(o.title);
        if (!title || !validDate(o.date)) {
          console.warn('丟棄無效 create_event', o);
          break;
        }
        out.push({
          op: 'create_event',
          title,
          date: o.date,
          time: validTime(o.time) ? o.time : null,
          location: str(o.location),
          note: str(o.note),
          sourceIds,
        });
        break;
      }
      case 'update_event': {
        const id = typeof o.ref === 'string' ? refs.events.get(o.ref) : undefined;
        if (!id) {
          console.warn('丟棄未知 ref 的 update_event', o);
          break;
        }
        const u: Extract<ParsedOp, { op: 'update_event' }> = { op: 'update_event', id, sourceIds };
        if (str(o.title)) u.title = str(o.title)!;
        if (validDate(o.date)) u.date = o.date;
        if (validTime(o.time)) u.time = o.time;
        if (str(o.location)) u.location = str(o.location)!;
        if (str(o.note)) u.note = str(o.note)!;
        if (!u.title && !u.date && !u.time && !u.location && !u.note) {
          console.warn('丟棄無更新欄位的 update_event', o);
          break;
        }
        out.push(u);
        break;
      }
      case 'create_task': {
        const title = str(o.title);
        if (!title) {
          console.warn('丟棄無效 create_task', o);
          break;
        }
        out.push({
          op: 'create_task',
          title,
          assignee: str(o.assignee),
          due: validDate(o.due_date) ? o.due_date : null,
          note: str(o.note),
          sourceIds,
        });
        break;
      }
      case 'update_task': {
        const id = typeof o.ref === 'string' ? refs.tasks.get(o.ref) : undefined;
        if (!id) {
          console.warn('丟棄未知 ref 的 update_task', o);
          break;
        }
        const u: Extract<ParsedOp, { op: 'update_task' }> = { op: 'update_task', id, sourceIds };
        if (str(o.title)) u.title = str(o.title)!;
        if (str(o.assignee)) u.assignee = str(o.assignee)!;
        if (validDate(o.due_date)) u.due = o.due_date;
        if (str(o.note)) u.note = str(o.note)!;
        if (!u.title && !u.assignee && !u.due && !u.note) {
          console.warn('丟棄無更新欄位的 update_task', o);
          break;
        }
        out.push(u);
        break;
      }
      case 'create_note': {
        const title = str(o.title);
        const kind = str(o.kind);
        if (!title || !kind || !NOTE_KIND_RE.test(kind)) {
          console.warn('丟棄無效 create_note', o);
          break;
        }
        out.push({ op: 'create_note', title, kind, body: str(o.body), sourceIds });
        break;
      }
      case 'update_note': {
        const id = typeof o.ref === 'string' ? refs.notes.get(o.ref) : undefined;
        if (!id) {
          console.warn('丟棄未知 ref 的 update_note', o);
          break;
        }
        const u: Extract<ParsedOp, { op: 'update_note' }> = { op: 'update_note', id, sourceIds };
        if (str(o.title)) u.title = str(o.title)!;
        if (str(o.kind) && NOTE_KIND_RE.test(o.kind)) u.kind = o.kind;
        if (str(o.body)) u.body = str(o.body)!;
        if (!u.title && !u.kind && !u.body) {
          console.warn('丟棄無更新欄位的 update_note', o);
          break;
        }
        out.push(u);
        break;
      }
      default:
        console.warn('丟棄未知操作', o);
    }
  }
  return out;
}

// 並發鎖：抽取中再觸發直接跳過，訊息留給下一輪（天然合批）；失敗不寫游標，下次自動補抽
const running = new Set<string>();

export interface ExtractStats {
  processed: number;
  created: number;
  updated: number;
  skipped: number; // 已過期而直接忽略的項目數（匯入歷史記錄時避免灌進大量過期資料）
}

export async function extractGroup(groupId: string): Promise<ExtractStats> {
  const totals = { processed: 0, created: 0, updated: 0, skipped: 0 };
  if (running.has(groupId)) return totals;
  running.add(groupId);
  try {
    for (;;) {
      const r = await extractBatch(groupId);
      totals.processed += r.processed;
      totals.created += r.created;
      totals.updated += r.updated;
      totals.skipped += r.skipped;
      if (r.processed < BATCH) break; // 抽完了
    }
    if (totals.processed > 0) refreshProfileIfStale(groupId); // fire-and-forget，不擋抽取回傳
    return totals;
  } finally {
    running.delete(groupId);
  }
}

// 群組理解隨用隨新：抽取到新東西且檔案超過 7 天，就自動重新歸納——AI 越用越理解這個群，
// 歸納裡的「觀察與建議」也會跟著更新。上限每週一次控制費用；手動「重新產生」不受此限。
const PROFILE_STALE_MS = 7 * 86_400_000;

function refreshProfileIfStale(groupId: string): void {
  (async () => {
    const { data } = await getDb().from('groups').select('profile_updated_at').eq('group_id', groupId).maybeSingle();
    const at = data?.profile_updated_at ? new Date(data.profile_updated_at).getTime() : 0;
    if (Date.now() - at < PROFILE_STALE_MS) return;
    await profileGroup(groupId);
    console.log('群組理解已自動更新', groupId);
  })().catch((e) => console.warn('群組理解自動更新失敗（下次抽取再試）', groupId, e));
}

type MsgRow = {
  id: string;
  sender_name: string | null;
  sender_id: string | null;
  text: string | null;
  type: string;
  is_low_info: boolean;
  created_at: string;
};

// 「好/OK/收到」這類確認語雖是低資訊，卻常是決定成立的那一句（提議＋確認＝拍板）。
// 只放行明確的同意詞；貼圖、謝謝、辛苦了不算決定，仍不進 prompt（省 LLM 費用）。
const CONFIRM_RE = /^(好|好的|好喔|好哦|OK|ok|Ok|OKAY|okay|收到|了解|瞭解|沒問題|可以|同意|成)[!！。.~～\s]*$/;

// 認領租約（migration 009 的 claimed_at）：逾期未完成即視為前一個進程已死，放回隊列
const LEASE_MS = 10 * 60_000;
// 欄位未建時自動降級；但降級不可永久黏著——否則 migration 跑完還得重啟容器才會恢復。
// 每 10 分鐘重試一次，跑完 SQL 後最多十分鐘自動恢復租約保護。
const LEASE_RECHECK_MS = 10 * 60_000;
let leaseDegradedAt = 0;
const leaseSupported = () => Date.now() - leaseDegradedAt > LEASE_RECHECK_MS;

async function extractBatch(groupId: string): Promise<ExtractStats> {
  const db = getDb();
  const res = { processed: 0, created: 0, updated: 0, skipped: 0 };

  // 1. 未抽取訊息：不再於此過濾 is_low_info 與 type——確認語與已解析媒體都可能帶決定性資訊，
  //    過濾放到「要不要進 prompt」那層（見下方 promptRows），DB 層一律認領以免隊頭堵塞。
  // 候選：未抽取，且沒有「有效租約」（claimed_at 在租約期限內＝別的進程正在處理）。
  // 租約制解決當機視窗：認領時只寫 claimed_at，成功套用後才寫 extracted_at；
  // 程序被殺（部署重啟、crash）時租約逾期自動放回隊列，不會整批永久跳過。
  const leaseCut = new Date(Date.now() - LEASE_MS).toISOString();
  let q = db
    .from('messages')
    .select('id, sender_name, sender_id, text, type, is_low_info, created_at')
    .eq('group_id', groupId)
    .is('extracted_at', null);
  const lease = leaseSupported();
  if (lease) q = q.or(`claimed_at.is.null,claimed_at.lt.${leaseCut}`);
  const { data: candidates, error } = await q.order('created_at').limit(BATCH);
  if (error) {
    if (lease && /claimed_at/.test(error.message)) {
      leaseDegradedAt = Date.now(); // migration 009 未跑：暫時退回舊行為，十分鐘後自動重試
      console.warn('claimed_at 欄位未建（migration 009），抽取暫時退回無租約模式');
      return extractBatch(groupId);
    }
    throw error;
  }
  if (!candidates?.length) return res;

  // 1b. 媒體的解析結果（vision_summary/ocr_text）——報價單、規格表是知識密度最高的載體。
  //     尚未解析完成者查不到 asset，下方只是不進 prompt（仍會被認領，理由見 1c）。
  const mediaIds = (candidates as MsgRow[]).filter((m) => m.type === 'image' || m.type === 'pdf' || m.type === 'audio').map((m) => m.id);
  const assetOf = new Map<string, { summary: string | null; ocr: string | null }>();
  if (mediaIds.length) {
    const { data: assets } = await db
      .from('media_assets')
      .select('message_id, vision_summary, ocr_text, status')
      .in('message_id', mediaIds)
      .eq('status', 'done');
    for (const a of assets ?? []) assetOf.set(a.message_id, { summary: a.vision_summary, ocr: a.ocr_text });
  }
  // 1c. 原子認領：跨進程防重（in-memory 鎖只擋單進程；NAS 與 scripts/extract.ts 可能同時跑）。
  //     條件式 update 保證同一則訊息只被一個進程搶到；失敗時（見下方 catch）回滾認領，保留「失敗自動補抽」。
  //     **一律認領全部候選**（含未解析媒體）：留任何一列不認領，它就會永遠卡在
  //     order by created_at 的隊頭——累積滿 BATCH 就讓整群抽取停擺，且 processed<BATCH
  //     會讓 extractGroup 的排空迴圈誤判「抽完了」而提前中止。未解析媒體只是不進 prompt，
  //     其內容仍可經向量索引與同時段照片被找到（ponytail: 解析成功後不回頭補抽，forward-only）。
  const claimStamp = new Date().toISOString();
  let claimQ = db
    .from('messages')
    .update(lease ? { claimed_at: claimStamp } : { extracted_at: claimStamp })
    .in('id', candidates.map((c) => c.id))
    .is('extracted_at', null);
  // 租約模式下還要確認沒有別人的有效租約（條件式 update 保證同批只被一個進程搶到）
  if (lease) claimQ = claimQ.or(`claimed_at.is.null,claimed_at.lt.${leaseCut}`);
  const { data: claimed, error: claimErr } = await claimQ.select(
    'id, sender_name, sender_id, text, type, is_low_info, created_at',
  );
  if (claimErr) throw claimErr;
  if (!claimed?.length) return res; // 整批被另一個進程認領走了
  const pending = (claimed as MsgRow[]).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // 1d. 哪些真的要餵進 prompt：一般文字、確認語、已解析媒體。純貼圖/表情只認領不送 LLM。
  const promptRows = pending.filter(
    (m) => !m.is_low_info || CONFIRM_RE.test((m.text ?? '').trim()) || assetOf.has(m.id),
  );
  if (!promptRows.length) {
    await finishClaim(pending.map((m) => m.id), lease);
    res.processed = pending.length; // 全是貼圖之類，已標記處理過，零 LLM 成本
    return res;
  }

  // 2. 前文脈絡（含低資訊：「好」也可能是確認語）
  const { data: ctxRows } = await db
    .from('messages')
    .select('id, sender_name, sender_id, text, type, is_low_info, created_at')
    .eq('group_id', groupId)
    .eq('type', 'text')
    .lt('created_at', promptRows[0].created_at)
    .order('created_at', { ascending: false })
    .limit(CONTEXT);
  const context = ((ctxRows ?? []) as MsgRow[]).reverse();

  // 3. 既有項目（近 14 天起的 active 事件＋所有待確認事件、open 待辦）
  const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const { data: exEvents } = await db
    .from('events')
    .select('id, title, starts_at, start_time, location, needs_confirmation, source_message_ids')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .or(`starts_at.gte.${cutoff},needs_confirmation.eq.true`)
    .order('starts_at')
    .limit(MAX_EXISTING);
  const { data: exTasks } = await db
    .from('tasks')
    .select('id, title, assignee, due_at, needs_confirmation, source_message_ids')
    .eq('group_id', groupId)
    .eq('status', 'open')
    .order('created_at')
    .limit(MAX_EXISTING);
  const { data: exNotes } = await db
    .from('notes')
    .select('id, kind, title, needs_confirmation, source_message_ids')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('created_at')
    .limit(MAX_EXISTING);

  // 3b. 人已否決的項目（近 30 天）——最便宜的負向訊號。不餵進去的話，話題重現時
  //     AI 會把人剛忽略掉的項目原樣重建，迫使人重複勞動（計劃 B.9 推論三）
  //
  //     **只取「還沒確認就被忽略」的**：忽略有兩種語意，混用會反過來傷害抽取品質——
  //     未確認就忽略＝人第一眼說「這不對」，是真的否決；
  //     確認過之後才忽略＝曾經是對的，只是過期或被新的取代（公告尤其常見，實測 44/47 屬此類）。
  //     把後者當負面樣本，等於教 AI「這種公告不要再抽」，但它當初抽對了。
  const ignoredCut = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const negative = (table: string) =>
    db
      .from(table)
      .select('title')
      .eq('group_id', groupId)
      .eq('status', 'ignored')
      .eq('needs_confirmation', true)
      .gte('updated_at', ignoredCut)
      .limit(MAX_EXISTING);
  const [igEv, igTk, igNt] = await Promise.all([negative('events'), negative('tasks'), negative('notes')]);
  const ignoredLines = [...(igEv.data ?? []), ...(igTk.data ?? []), ...(igNt.data ?? [])].map((r: any) => `・${r.title}`);

  // 4. 代號表（LLM 會抄錯 UUID，一律用短代號）
  const refs: RefMaps = { msgs: new Map(), events: new Map(), tasks: new Map(), notes: new Map() };
  const eventById = new Map<string, any>();
  const taskById = new Map<string, any>();
  const noteById = new Map<string, any>();

  // 媒體訊息沒有 text，改渲染解析結果——讓報價單/規格表的內容能變成事件或待辦，
  // 且 source_ref 可以指向該媒體訊息本身（取代 core/media.ts 的 ±10 分鐘時間窗猜測）
  const msgLine = (m: MsgRow, code: string) => {
    const head = `${code} ${label(new Date(m.created_at), m.sender_name ?? m.sender_id)}`;
    const asset = assetOf.get(m.id);
    if (asset) {
      const kind = m.type === 'pdf' ? 'PDF' : '圖片';
      const ocr = asset.ocr?.trim() ? `｜文字：${asset.ocr.trim().slice(0, 300)}` : '';
      return `${head}[${kind}] ${asset.summary ?? '（無摘要）'}${ocr}`;
    }
    return `${head}${m.text ?? ''}`;
  };
  // 已確認＝人背書過，AI 不得用舊對話蓋回去（計劃 B.9 推論二）
  const mark = (needsConfirmation: boolean) => (needsConfirmation ? '⚠待確認' : '✓已確認');

  let mi = 0;
  const contextLines = context.map((m) => {
    const code = `M${++mi}`;
    refs.msgs.set(code, m.id);
    return msgLine(m, code);
  });
  const newLines = promptRows.map((m) => {
    const code = `M${++mi}`;
    refs.msgs.set(code, m.id);
    return msgLine(m, code);
  });
  const eventLines = (exEvents ?? []).map((e, i) => {
    const code = `E${i + 1}`;
    refs.events.set(code, e.id);
    eventById.set(e.id, e);
    return `${code}｜${mark(e.needs_confirmation)}｜${e.title}｜${e.starts_at}｜${e.start_time ? String(e.start_time).slice(0, 5) : '時間未定'}｜${e.location ?? '地點未定'}`;
  });
  const taskLines = (exTasks ?? []).map((t, i) => {
    const code = `T${i + 1}`;
    refs.tasks.set(code, t.id);
    taskById.set(t.id, t);
    return `${code}｜${mark(t.needs_confirmation)}｜${t.title}｜負責人：${t.assignee ?? '未定'}｜期限：${t.due_at ?? '未定'}`;
  });
  const noteLines = (exNotes ?? []).map((n, i) => {
    const code = `N${i + 1}`;
    refs.notes.set(code, n.id);
    noteById.set(n.id, n);
    return `${code}｜${mark(n.needs_confirmation)}｜${n.kind === 'decision' ? '決議' : '公告'}｜${n.title}`;
  });

  // 5. 組 prompt → JSON mode → 驗證
  const now = new Date();
  const today = now.toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });
  const weekday = now.toLocaleDateString('zh-TW', { weekday: 'short', timeZone: 'Asia/Taipei' });
  const profile = await getProfile(groupId); // 群組理解：幫 LLM 讀懂此群的行話與案子代號

  const prompt = `你是工作群組的資訊整理助理。從群組對話抽取三種項目：
・事件（有明確日期的行程：會議、到場、交貨、驗收、面談、檢查…）
・待辦（交辦事項）
・公告/決議（沒有單一日期行程、但值得留存的重要宣布或拍板決定）：公告=通知、規則或政策變更（如「以後到場一律提前 30 分鐘」）；決議=討論後拍板的決定（如「這案改用 A 方案」）。

今天是 ${today}（${weekday}），時區 Asia/Taipei。
${profile ? `\n【群組背景】（AI 先前歸納的此群產業/術語/案子，幫助你正確理解對話）\n${profile}\n` : ''}
【既有事件】（同一件事請用 update 補充，不要重複建立）
${eventLines.length ? eventLines.join('\n') : '無'}

【既有待辦】
${taskLines.length ? taskLines.join('\n') : '無'}

【既有公告/決議】
${noteLines.length ? noteLines.join('\n') : '無'}
${ignoredLines.length ? `\n【人已否決的項目】（近 30 天內被人工忽略，**不要再建立同樣的項目**）\n${ignoredLines.join('\n')}\n` : ''}
【先前對話】（僅供理解脈絡，不要從這裡建立新項目）
${contextLines.length ? contextLines.join('\n') : '無'}

【新訊息】（從這裡抽取）
${newLines.join('\n')}

規則：
1. 只抽取具體的工作資訊；閒聊與提問本身不是項目。代名詞與省略主語要靠前文對回正確的案子（例如有人問某事件幾點、下一句回「1500」，就是對該事件的 update）。
2. 已在既有清單的同一件事（改期、補時間、補地點、補內容）→ 輸出對應的 update 操作並帶 ref 代號，只填要變更的欄位。
   **標記 ✓已確認 的項目是人工核對過的正確值**：只有當新訊息明確表示變更（改期、更正、取消）時才 update，不得用舊對話的說法蓋回去；標記 ⚠待確認 的則可自由補正。
2b. 新訊息若是對【先前對話】某個提議的**確認**（好、OK、收到、沒問題），代表那件事拍板成立——依前文的提議內容建立對應項目，source_refs 同時帶提議與確認兩則代號。
2c. 標示 [圖片] / [PDF] 的訊息是媒體的解析結果（摘要與其中文字）。若內容含具體工作資訊（報價、日期、清單），照樣抽取，source_refs 指向該則媒體訊息。
3. 日期一律以「該則訊息的時間戳」為基準解析：「10/20」沒寫年份取最近的未來；「週五」「明天」依該則訊息日期推算。日期輸出 YYYY-MM-DD；時間輸出 24 小時制 HH:MM（「1500」→「15:00」），沒提到就省略 time 欄位。
4. 有明確日期行程 → 事件；交辦某人做某事 → 待辦；規則/政策/拍板決定（無單一日期）→ 公告或決議。三者擇一，不要重複建立。
5. 資訊不足或不確定就不要輸出該項，禁止推測編造。
6. 每個操作的 source_refs 填依據的訊息代號（可含先前對話的代號）。
7. 只輸出 JSON，格式：
{"operations":[
 {"op":"create_event","title":"案名 動作","date":"YYYY-MM-DD","time":"HH:MM","location":"","note":"","source_refs":["M2"]},
 {"op":"update_event","ref":"E1","time":"15:00","source_refs":["M3"]},
 {"op":"create_task","title":"","assignee":"","due_date":"YYYY-MM-DD","source_refs":["M4"]},
 {"op":"update_task","ref":"T1","due_date":"YYYY-MM-DD","source_refs":["M5"]},
 {"op":"create_note","kind":"announcement","title":"一句話標題","body":"補充內容","source_refs":["M6"]},
 {"op":"update_note","ref":"N1","body":"","source_refs":["M7"]}
]}
kind 只能是 announcement（公告）或 decision（決議）。沒有可抽取的內容就輸出 {"operations":[]}。`;

  let rawOut: unknown;
  try {
    rawOut = await getLLM().generateJson(prompt);
  } catch (e) {
    // LLM 失敗 → 回滾認領（extracted_at 還原 null），下一輪自動補抽
    await db
      .from('messages')
      .update(lease ? { claimed_at: null } : { extracted_at: null })
      .in('id', pending.map((m) => m.id));
    throw e;
  }
  const allOps = parseOps(rawOut, refs);
  // 已過期/過舊的直接忽略（匯入幾個月歷史時避免灌進大量陳舊行程/待辦）；訊息本身仍在索引，不影響問答。
  // 無期限的待辦以來源訊息時間判斷：全部超過 30 天 → 視為過舊（ponytail: 陳舊門檻，誤殺再調）
  const msgTime = new Map<string, number>();
  for (const m of [...context, ...pending]) msgTime.set(m.id, new Date(m.created_at).getTime());
  const staleCut = Date.now() - 30 * 86_400_000;
  const ops = allOps.filter((op) => {
    if (op.op === 'create_event' && op.date < today) return false;
    if (op.op === 'create_task' && op.due && op.due < today) return false;
    if (op.op === 'create_task' && !op.due && op.sourceIds.length
        && op.sourceIds.every((id) => (msgTime.get(id) ?? Infinity) < staleCut)) return false;
    return true;
  });
  res.skipped = allOps.length - ops.length;

  // 6. 套用（單筆失敗不影響其他筆）
  for (const op of ops) {
    try {
      if (op.op === 'create_event') {
        const { error: e } = await db.from('events').insert({
          group_id: groupId,
          title: op.title,
          starts_at: op.date,
          start_time: op.time,
          location: op.location,
          note: op.note,
          source_message_ids: op.sourceIds,
        });
        if (e) throw e;
        res.created++;
      } else if (op.op === 'update_event') {
        const cur = eventById.get(op.id);
        const merged = [...new Set([...(cur?.source_message_ids ?? []), ...op.sourceIds])];
        // AI 改過的資料一律重新標「需確認」——AI 只提供線索，人做決定
        const patch: Record<string, unknown> = {
          needs_confirmation: true,
          updated_at: new Date().toISOString(),
          source_message_ids: merged,
        };
        if (op.title) patch.title = op.title;
        if (op.date) patch.starts_at = op.date;
        if (op.time) patch.start_time = op.time;
        if (op.location) patch.location = op.location;
        if (op.note) patch.note = op.note;
        const { error: e } = await db.from('events').update(patch).eq('id', op.id);
        if (e) throw e;
        res.updated++;
      } else if (op.op === 'create_task') {
        const { error: e } = await db.from('tasks').insert({
          group_id: groupId,
          title: op.title,
          assignee: op.assignee,
          due_at: op.due,
          note: op.note,
          source_message_ids: op.sourceIds,
        });
        if (e) throw e;
        res.created++;
      } else if (op.op === 'update_task') {
        const cur = taskById.get(op.id);
        const merged = [...new Set([...(cur?.source_message_ids ?? []), ...op.sourceIds])];
        const patch: Record<string, unknown> = {
          needs_confirmation: true,
          updated_at: new Date().toISOString(),
          source_message_ids: merged,
        };
        if (op.title) patch.title = op.title;
        if (op.assignee) patch.assignee = op.assignee;
        if (op.due) patch.due_at = op.due;
        if (op.note) patch.note = op.note;
        const { error: e } = await db.from('tasks').update(patch).eq('id', op.id);
        if (e) throw e;
        res.updated++;
      } else if (op.op === 'create_note') {
        const { error: e } = await db.from('notes').insert({
          group_id: groupId,
          kind: op.kind,
          title: op.title,
          body: op.body,
          source_message_ids: op.sourceIds,
        });
        if (e) throw e;
        res.created++;
      } else {
        const cur = noteById.get(op.id);
        const merged = [...new Set([...(cur?.source_message_ids ?? []), ...op.sourceIds])];
        const patch: Record<string, unknown> = {
          needs_confirmation: true,
          updated_at: new Date().toISOString(),
          source_message_ids: merged,
        };
        if (op.title) patch.title = op.title;
        if (op.kind) patch.kind = op.kind;
        if (op.body) patch.body = op.body;
        const { error: e } = await db.from('notes').update(patch).eq('id', op.id);
        if (e) throw e;
        res.updated++;
      }
    } catch (e) {
      console.error('套用抽取操作失敗', op, e);
    }
  }

  // 7. 套用完成 → 正式標記已抽取（租約模式下這才是「真的做完了」的唯一憑據）
  await finishClaim(pending.map((m) => m.id), lease);
  res.processed = pending.length;
  return res;
}

// 完成認領：租約模式把 claimed_at 換成 extracted_at；舊模式在認領時已寫，無事可做
async function finishClaim(ids: string[], lease: boolean): Promise<void> {
  if (!lease || !ids.length) return;
  const { error } = await getDb()
    .from('messages')
    .update({ extracted_at: new Date().toISOString(), claimed_at: null })
    .in('id', ids);
  if (error) console.error('標記已抽取失敗（租約逾期後會自動重試）', error);
}
