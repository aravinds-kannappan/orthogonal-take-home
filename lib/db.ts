import { kv } from "@vercel/kv";

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

export const MAX_MESSAGES_IN_CONTEXT = 20;

export async function getAllConversations(): Promise<Conversation[]> {
  try {
    const keys = await kv.keys("conv:*");
    if (!keys.length) return [];
    const convs = await Promise.all(keys.map(k => kv.get<Conversation>(k)));
    return (convs.filter(Boolean) as Conversation[]).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch { return []; }
}

export async function getConversation(id: string): Promise<Conversation | null> {
  try { return await kv.get<Conversation>(`conv:${id}`); } catch { return null; }
}

export async function createConversation(id: string, title: string): Promise<Conversation> {
  const now = new Date().toISOString();
  const conv: Conversation = { id, title, messages: [], createdAt: now, updatedAt: now };
  await kv.set(`conv:${id}`, conv);
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
  await kv.set(`conv:${conversationId}`, conv);
}

export async function updateConversationSummary(conversationId: string, summary: string) {
  const conv = await getConversation(conversationId);
  if (!conv) return;
  conv.summary = summary;
  conv.updatedAt = new Date().toISOString();
  await kv.set(`conv:${conversationId}`, conv);
}

export async function deleteConversation(id: string) {
  await kv.del(`conv:${id}`);
}
