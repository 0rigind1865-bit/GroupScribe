// 核心型別：所有 Connector / Provider 都以這裡的介面為準（規劃書第 6 節）
// 核心引擎只認介面，不認廠商。

// audio：語音是對話流的原生載體（工地常用嘴講），整型排除違反「零額外輸入捕捉」。
// 影片維持排除——不是知識載體且成本高。
export type MessageType = 'text' | 'image' | 'pdf' | 'audio' | 'other';

export interface NormalizedMessage {
  groupId: string;
  senderId?: string;
  messageId?: string; // 平台訊息 ID（去重、unsend 對應用）
  type: MessageType;
  text?: string; // 原始文字（檔名、[貼圖] 佔位也放這）
  question?: string; // 被 @ 時，去掉提及字段後的問題文字
  mentionsBot: boolean;
  replyToken?: string;
  mediaRef?: string; // 交給 fetchMedia 的媒體參照
  timestamp: Date;
  source: 'webhook' | 'import' | 'backfill';
}

export type NormalizedEvent =
  | { kind: 'message'; message: NormalizedMessage }
  | { kind: 'join'; groupId: string; replyToken?: string }
  | { kind: 'leave'; groupId: string }
  | { kind: 'unsend'; groupId: string; messageId: string }
  /** 1:1 聊天（加好友、私訊）：目前只回「我只在群組裡工作」＋註冊連結；個人筆記模式見商業計劃 G8 */
  | { kind: 'dm'; userId: string; replyToken?: string };

export interface LLMProvider {
  generate(prompt: string): Promise<string>;
  generateJson(prompt: string): Promise<unknown>; // 回 JSON.parse 後的原始值，由核心自行驗證
}

export interface VisionProvider {
  analyze(data: Buffer, mime: string): Promise<{ ocrText: string; summary: string; category: string }>;
}

export interface EmbeddingProvider {
  readonly modelId: string; // 寫進每筆向量：檢索只比對同模型（規劃書 6.2）
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface MessagingConnector {
  readonly supportsBackfill: boolean; // Discord/Slack 可原生回補歷史；LINE/Telegram 靠匯入（規劃書 6.5）
  verifyWebhook(rawBody: string, signature: string): boolean;
  parseEvents(body: unknown): NormalizedEvent[];
  fetchMedia(ref: string): Promise<{ data: Buffer; mime: string }>;
  reply(replyToken: string, text: string): Promise<void>;
  // 主動送達（計劃 B.8）：只對「自己訂閱的個人」1:1 推送，群組永遠零聲量。
  // 回傳 'blocked' 表示對方封鎖或未加好友（呼叫端應停用該訂閱），'error' 為暫時性失敗
  push?(userId: string, text: string): Promise<'ok' | 'blocked' | 'error'>;
  resolveSenderName?(groupId: string, userId: string): Promise<string | undefined>;
  /** 主動離開群組（未認領 7 天自動退群用）；回 true 表示已不在群內（含本來就不在） */
  leaveGroup?(groupId: string): Promise<boolean>;
  resolveGroupSummary?(groupId: string): Promise<{ name?: string; pictureUrl?: string } | undefined>;
}
