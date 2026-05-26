"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import Sidebar from "./Sidebar";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolEvents?: ToolEvent[];
  createdAt: string;
}

export interface ToolEvent {
  id: string;
  type: "tool_start" | "tool_result";
  toolName: string;
  toolInput?: Record<string, unknown>;
  result?: unknown;
  price?: string;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

function extractContactsFromResult(result: unknown): Record<string, string>[] {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;
  const data = (r.data as Record<string, unknown>) || r;
  const out: Record<string, string>[] = [];

  const toPerson = (p: Record<string, unknown>) => ({
    name: String(p.name || p.fullName || `${p.first_name || ""} ${p.last_name || ""}`.trim() || ""),
    title: String(p.title || p.headline || ""),
    company: String((p.organization as Record<string, unknown>)?.name || (p.company as Record<string, unknown>)?.name || p.companyName || p.company_domain || ""),
    email: String(Array.isArray(p.emails) ? p.emails[0] : (p.email || "")),
    linkedin: String(p.linkedin_url || p.linkedInUrl || ""),
    phone: String(p.phone_number || p.phone || ""),
  });

  if (Array.isArray(data?.people)) (data.people as Record<string, unknown>[]).forEach(p => out.push(toPerson(p)));
  if (data?.person && typeof data.person === "object") out.push(toPerson(data.person as Record<string, unknown>));
  if (Array.isArray(data?.profiles)) (data.profiles as Record<string, unknown>[]).forEach(p => out.push(toPerson(p)));
  if (data?.lead && typeof data.lead === "object") out.push(toPerson(data.lead as Record<string, unknown>));
  if (Array.isArray(data?.emails)) {
    (data.emails as Record<string, unknown>[]).forEach(e => out.push({
      name: `${e.first_name || ""} ${e.last_name || ""}`.trim(),
      title: String(e.position || e.title || ""),
      company: "",
      email: String(e.value || e.email || ""),
      linkedin: String(e.linkedin || ""),
      phone: "",
    }));
  }
  return out.filter(c => c.name || c.email);
}

export default function ChatApp() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [memoryCount, setMemoryCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refreshConvList = useCallback(() => {
    fetch("/api/conversations").then(r => r.json()).then(d => { if (Array.isArray(d)) setConversations(d); }).catch(() => {});
  }, []);

  const refreshMemoryCount = useCallback(() => {
    fetch("/api/memory").then(r => r.json()).then(d => { if (typeof d.count === "number") setMemoryCount(d.count); }).catch(() => {});
  }, []);

  useEffect(() => { refreshConvList(); refreshMemoryCount(); }, [refreshConvList, refreshMemoryCount]);

  const loadConversation = useCallback(async (id: string) => {
    setActiveConvId(id);
    setMessages([]);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages.map((m: { id: string; role: string; content: string; createdAt: string }) => ({
          id: m.id, role: m.role as "user" | "assistant", content: m.content, createdAt: m.createdAt,
        })));
      }
    } catch { /* silent */ }
  }, []);

  const newConversation = useCallback(() => { setActiveConvId(null); setMessages([]); }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await fetch("/api/conversations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setConversations(p => p.filter(c => c.id !== id));
    if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
  }, [activeConvId]);

  const renameConversation = useCallback(async (id: string, title: string) => {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setConversations(p => p.map(c => c.id === id ? { ...c, title } : c));
  }, []);

  const exportContacts = useCallback(() => {
    const all: Record<string, string>[] = [];
    for (const msg of messages) {
      for (const ev of msg.toolEvents || []) {
        if (ev.type === "tool_result" && ev.result) all.push(...extractContactsFromResult(ev.result));
      }
    }
    const seen = new Set<string>();
    const unique = all.filter(c => {
      const key = c.name || c.email;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!unique.length) { alert("No contacts found in this conversation to export."); return; }
    const headers = ["Name", "Title", "Company", "Email", "LinkedIn", "Phone"];
    const csv = [
      headers.join(","),
      ...unique.map(c => [c.name, c.title, c.company, c.email, c.linkedin, c.phone].map(v => `"${(v || "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "contacts.csv";
    a.click();
  }, [messages]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;
    const convId = activeConvId || uuidv4();
    if (!activeConvId) setActiveConvId(convId);

    const userMsg: UIMessage = { id: uuidv4(), role: "user", content, createdAt: new Date().toISOString() };
    const asstId = uuidv4();
    const asstMsg: UIMessage = { id: asstId, role: "assistant", content: "", isStreaming: true, toolEvents: [], createdAt: new Date().toISOString() };
    setMessages(p => [...p, userMsg, asstMsg]);
    setIsLoading(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, message: content }),
        signal: abort.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "text") {
              setMessages(p => p.map(m => m.id === asstId ? { ...m, content: m.content + ev.text } : m));
            } else if (ev.type === "tool_start") {
              setMessages(p => p.map(m => m.id === asstId ? { ...m, toolEvents: [...(m.toolEvents || []), { id: uuidv4(), type: "tool_start", toolName: ev.toolName, toolInput: ev.toolInput }] } : m));
            } else if (ev.type === "tool_result") {
              setMessages(p => p.map(m => m.id === asstId ? { ...m, toolEvents: [...(m.toolEvents || []), { id: uuidv4(), type: "tool_result", toolName: ev.toolName, result: ev.result, price: ev.price }] } : m));
            } else if (ev.type === "done") {
              refreshConvList();
              refreshMemoryCount();
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setMessages(p => p.map(m => m.id === asstId ? { ...m, content: "Something went wrong. Please try again.", isStreaming: false } : m));
      }
    } finally {
      setIsLoading(false);
      setMessages(p => p.map(m => m.id === asstId ? { ...m, isStreaming: false } : m));
    }
  }, [activeConvId, isLoading, refreshConvList, refreshMemoryCount]);

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg)", overflow: "hidden" }}>
      <Sidebar conversations={conversations} activeId={activeConvId} isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(v => !v)} onSelect={loadConversation} onNew={newConversation}
        onDelete={deleteConversation} onRename={renameConversation} />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <header style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-secondary)", flexShrink: 0 }}>
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--accent-dim)", border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="var(--accent-light)" strokeWidth="1.5"/><path d="M7 4v3l2 2" stroke="var(--accent-light)" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
            <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 15 }}>Orthogonal Chat</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {memoryCount > 0 && (
              <div title={`${memoryCount} facts remembered from previous conversations`}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", background: "var(--accent-dim)", border: "1px solid var(--accent)", borderRadius: 12, fontSize: 11, color: "var(--accent-light)", cursor: "default" }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1C3 1 1 3 1 5.5S3 10 5.5 10 10 8 10 5.5 8 1 5.5 1z" stroke="currentColor" strokeWidth="1.2"/><path d="M3.5 5c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="5.5" cy="5" r=".6" fill="currentColor"/></svg>
                {memoryCount} {memoryCount === 1 ? "memory" : "memories"}
              </div>
            )}
            {messages.length > 0 && (
              <button onClick={exportContacts}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Export CSV
              </button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Connected</span>
            </div>
          </div>
        </header>
        <MessageList messages={messages} isLoading={isLoading} onSend={sendMessage} />
        <ChatInput onSend={sendMessage} onStop={() => abortRef.current?.abort()} isLoading={isLoading} />
      </main>
    </div>
  );
}
