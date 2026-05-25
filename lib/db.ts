import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "conversations.json");

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

interface DB { conversations: Record<string, Conversation>; }

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readDB(): DB {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) return { conversations: {} };
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf-8")); } catch { return { conversations: {} }; }
}

function writeDB(db: DB) {
  ensureDataDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

export function getAllConversations(): Conversation[] {
  const db = readDB();
  return Object.values(db.conversations).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getConversation(id: string): Conversation | null {
  return readDB().conversations[id] || null;
}

export function createConversation(id: string, title: string): Conversation {
  const db = readDB();
  const now = new Date().toISOString();
  const conv: Conversation = { id, title, messages: [], createdAt: now, updatedAt: now };
  db.conversations[id] = conv;
  writeDB(db);
  return conv;
}

export function addMessage(conversationId: string, message: Message) {
  const db = readDB();
  const conv = db.conversations[conversationId];
  if (!conv) return;
  conv.messages.push(message);
  conv.updatedAt = new Date().toISOString();
  if (conv.title === "New Conversation" && message.role === "user") {
    conv.title = message.content.slice(0, 60) + (message.content.length > 60 ? "…" : "");
  }
  writeDB(db);
}

export function updateConversationSummary(conversationId: string, summary: string) {
  const db = readDB();
  const conv = db.conversations[conversationId];
  if (!conv) return;
  conv.summary = summary;
  conv.updatedAt = new Date().toISOString();
  writeDB(db);
}

export function deleteConversation(id: string) {
  const db = readDB();
  delete db.conversations[id];
  writeDB(db);
}

export const MAX_MESSAGES_IN_CONTEXT = 20;
