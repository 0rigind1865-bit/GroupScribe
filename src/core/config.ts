import type { EmbeddingProvider, LLMProvider, MessagingConnector, VisionProvider } from './types';
import { geminiEmbedding, geminiLLM, geminiVision } from '@/providers/gemini';
import { lineConnector } from '@/connectors/line';

// Provider 由環境變數選擇（規劃書 6.1），核心程式碼零改動即可抽換。
// ponytail: 每個介面目前只有一個實作，新實作寫好後在對應表加一行即可
function pick<T>(envKey: string, table: Record<string, T>): T {
  const name = process.env[envKey] ?? Object.keys(table)[0];
  const impl = table[name];
  if (!impl) throw new Error(`${envKey}=${name} 沒有對應的實作（可用：${Object.keys(table).join('、')}）`);
  return impl;
}

export const getLLM = () => pick<LLMProvider>('LLM_PROVIDER', { gemini: geminiLLM });
export const getVision = () => pick<VisionProvider>('VISION_PROVIDER', { gemini: geminiVision });
export const getEmbedding = () => pick<EmbeddingProvider>('EMBEDDING_PROVIDER', { gemini: geminiEmbedding });
export const getConnector = () => pick<MessagingConnector>('CONNECTOR', { line: lineConnector });
