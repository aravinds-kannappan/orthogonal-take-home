import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export interface MemoryEntry {
  id: string;
  fact: string;
  source: string;
  createdAt: string;
}

const MEMORY_KEY = "memory:global";
const MAX_MEMORIES = 50;

export async function getMemories(): Promise<MemoryEntry[]> {
  try {
    return (await redis.get<MemoryEntry[]>(MEMORY_KEY)) || [];
  } catch { return []; }
}

export async function addMemories(entries: { fact: string; source: string }[]): Promise<void> {
  if (!entries.length) return;
  try {
    const existing = await getMemories();
    const now = new Date().toISOString();
    const newEntries: MemoryEntry[] = entries.map(e => ({
      id: Math.random().toString(36).slice(2),
      fact: e.fact,
      source: e.source,
      createdAt: now,
    }));
    await redis.set(MEMORY_KEY, [...existing, ...newEntries].slice(-MAX_MEMORIES));
  } catch { /* non-fatal */ }
}
