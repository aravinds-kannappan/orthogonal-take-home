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

export default function ChatApp() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const refreshConvList = useCallback(() => {
    fetch("/api/conversations").then(r => r.json()).then(d => { if (Array.isArray(d)) setConversations(d); }).catch(() => {});
  }, []);

  useEffect(() => { refreshConvList(); }, [refreshConvList]);

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
              setMessages(p => p.map(m => m.id === asstId ? { ...m, toolEvents: [...(m.toolEvents||[]), { id: uuidv4(), type: "tool_start", toolName: ev.toolName, toolInput: ev.toolInput }] } : m));
            } else if (ev.type === "tool_result") {
              setMessages(p => p.map(m => m.id === asstId ? { ...m, toolEvents: [...(m.toolEvents||[]), { id: uuidv4(), type: "tool_result", toolName: ev.toolName, result: ev.result, price: ev.price }] } : m));
            } else if (ev.type === "done") {
              refreshConvList();
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
  }, [activeConvId, isLoading, refreshConvList]);

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg)", overflow: "hidden" }}>
      <Sidebar conversations={conversations} activeId={activeConvId} isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(v => !v)} onSelect={loadConversation} onNew={newConversation} onDelete={deleteConversation} />
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
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} />
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Connected</span>
          </div>
        </header>
        <MessageList messages={messages} isLoading={isLoading} onSend={sendMessage} />
        <ChatInput onSend={sendMessage} onStop={() => abortRef.current?.abort()} isLoading={isLoading} />
      </main>
    </div>
  );
}
