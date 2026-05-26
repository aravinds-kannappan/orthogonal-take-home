import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export const MAX_MESSAGES_IN_CONTEXT = 8;

export async function getAllConversations(): Promise<Conversation[]> {
  try {
    const keys = await redis.keys("conv:*");
    if (!keys.length) return [];
    const convs = await Promise.all(keys.map(k => redis.get<Conversation>(k)));
    return (convs.filter(Boolean) as Conversation[]).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch { return []; }
}

export async function getConversation(id: string): Promise<Conversation | null> {
  try { return await redis.get<Conversation>(`conv:${id}`); } catch { return null; }
}

export async function createConversation(id: string, title: string): Promise<Conversation> {
  const now = new Date().toISOString();
  const conv: Conversation = { id, title, messages: [], createdAt: now, updatedAt: now };
  await redis.set(`conv:${id}`, conv);
  return conv;
}

export async function addMessage(conversationId: string, message: Message) {
  const conv = await getConversation(conversationId);
  if (!conv) return;
  conv.messages.push(message);
  conv.updatedAt = new Date().toISOString();
  if (conv.title === "New Conversation" && message.role === "user") {
    conv.title = message.content.slice(0, 60) + (message.content.length > 60 ? "…" : "");
  }
  await redis.set(`conv:${conversationId}`, conv);
}

export async function updateConversationSummary(conversationId: string, summary: string) {
  const conv = await getConversation(conversationId);
  if (!conv) return;
  conv.summary = summary;
  conv.updatedAt = new Date().toISOString();
  await redis.set(`conv:${conversationId}`, conv);
}

export async function updateConversationTitle(id: string, title: string) {
  const conv = await getConversation(id);
  if (!conv) return;
  conv.title = title;
  conv.updatedAt = new Date().toISOString();
  await redis.set(`conv:${id}`, conv);
}

export async function deleteConversation(id: string) {
  await redis.del(`conv:${id}`);
}
