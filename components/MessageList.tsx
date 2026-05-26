"use client";
import { useEffect, useRef } from "react";
import type { UIMessage, ToolEvent } from "./ChatApp";

const TOOL_LABELS: Record<string, string> = { search_people: "Searching people", search_companies: "Searching companies", enrich_person: "Enriching profile", find_email: "Finding email", enrich_company: "Enriching company", find_contacts_at_company: "Finding contacts", search_people_nl: "Searching people" };
const TOOL_ICONS: Record<string, string> = { search_people: "👤", search_companies: "🏢", enrich_person: "🔍", find_email: "✉️", enrich_company: "📊", find_contacts_at_company: "👥", search_people_nl: "🔎" };

function ToolEventDisplay({ events }: { events: ToolEvent[] }) {
  const toolNames = [...new Set(events.map(e => e.toolName))];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
      {toolNames.map((name, i) => {
        const startEvt = events.find(e => e.toolName === name && e.type === "tool_start");
        const resultEvt = events.find(e => e.toolName === name && e.type === "tool_result");
        const done = !!resultEvt;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: done ? "var(--green-dim)" : "var(--bg-tertiary)", border: `1px solid ${done ? "rgba(34,197,94,0.2)" : "var(--border)"}`, borderRadius: 8, fontSize: 12, color: done ? "var(--green)" : "var(--text-muted)" }}>
            <span style={{ fontSize: 14 }}>{TOOL_ICONS[name] || "⚡"}</span>
            <span style={{ flex: 1 }}>{TOOL_LABELS[name] || name}</span>
            {done ? (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {resultEvt?.price && <span style={{ opacity: 0.7, fontSize: 11 }}>${resultEvt.price}</span>}
              </span>
            ) : (
              <span style={{ display: "flex", gap: 3 }}>
                {[0,1,2].map(d => <span key={d} style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--text-muted)", animation: "pulse-dot 1.2s infinite", animationDelay: `${d*0.2}s`, display: "inline-block" }} />)}
              </span>
            )}
            {startEvt?.toolInput && (
              <span style={{ opacity: 0.5, fontSize: 11, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {Object.values(startEvt.toolInput).filter(Boolean).slice(0,2).join(", ")}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inList = false;
  for (const line of lines) {
    let p = line
      .replace(/^### (.*)$/, "<h3>$1</h3>")
      .replace(/^## (.*)$/, "<h2>$1</h2>")
      .replace(/^# (.*)$/, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    if (p.startsWith("- ")) {
      if (!inList) { result.push("<ul>"); inList = true; }
      result.push(`<li>${p.slice(2)}</li>`);
    } else {
      if (inList) { result.push("</ul>"); inList = false; }
      if (p.trim() === "") result.push("");
      else if (!p.match(/^<[h123]/)) result.push(`<p>${p}</p>`);
      else result.push(p);
    }
  }
  if (inList) result.push("</ul>");
  return result.join("\n");
}

function Message({ msg }: { msg: UIMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className="animate-in" style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 20, gap: 10, alignItems: "flex-start" }}>
      {!isUser && (
        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1L8 4.5H12L9 7l1.5 4L6.5 9 3 11l1.5-4L1 4.5h4L6.5 1z" fill="var(--accent-light)" opacity="0.8"/></svg>
        </div>
      )}
      <div style={{ maxWidth: "75%", minWidth: 0 }}>
        {!isUser && msg.toolEvents && msg.toolEvents.length > 0 && <ToolEventDisplay events={msg.toolEvents} />}
        {(msg.content || msg.isStreaming) && (
          <div style={{ padding: isUser ? "10px 14px" : "12px 16px", background: isUser ? "var(--accent)" : "var(--bg-tertiary)", border: `1px solid ${isUser ? "transparent" : "var(--border)"}`, borderRadius: isUser ? "16px 16px 4px 16px" : "4px 16px 16px 16px", fontSize: 14, lineHeight: 1.6 }}>
            {isUser ? (
              <p style={{ color: "rgba(255,255,255,0.95)", margin: 0 }}>{msg.content}</p>
            ) : (
              <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
            )}
            {msg.isStreaming && !msg.content && (
              <span style={{ display: "flex", gap: 4 }}>
                {[0,1,2].map(d => <span key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "pulse-dot 1.2s infinite", animationDelay: `${d*0.2}s`, display: "inline-block" }} />)}
              </span>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "var(--bg-tertiary)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2, color: "var(--text-muted)", fontSize: 12, fontWeight: 600 }}>U</div>
      )}
    </div>
  );
}

const EXAMPLE_PROMPTS = [
  "Find 3 HR recruiters at samsung.com with emails",
  "Enrich Stripe's company profile",
  "Find VP of Engineering contacts at Notion",
  "Search for AI startup founders in Series B",
];

export default function MessageList({ messages, isLoading, onSend }: { messages: UIMessage[]; isLoading: boolean; onSend?: (msg: string) => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  if (messages.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "var(--text-muted)", padding: 40 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2L15 9H22L16.5 13.5L18.5 21L12 17L5.5 21L7.5 13.5L2 9H9L12 2Z" fill="var(--accent-light)" opacity="0.7"/></svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Ask anything about companies & people</div>
          <div style={{ fontSize: 13, maxWidth: 380, lineHeight: 1.6 }}>
            Try <em style={{ color: "var(--text-secondary)" }}>&quot;Find the CEO of Stripe and their contact info&quot;</em> or <em style={{ color: "var(--text-secondary)" }}>&quot;Search for VP Sales at fintech startups&quot;</em>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: 480 }}>
          {EXAMPLE_PROMPTS.map(s => (
            <button
              key={s}
              onClick={() => onSend?.(s)}
              disabled={isLoading}
              style={{ padding: "6px 12px", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 20, fontSize: 12, color: "var(--text-secondary)", cursor: isLoading ? "not-allowed" : "pointer", transition: "border-color 0.15s", fontFamily: "inherit" }}
              onMouseEnter={e => { if (!isLoading) (e.target as HTMLButtonElement).style.borderColor = "var(--accent)"; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = "var(--border)"; }}
            >{s}</button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 8px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {messages.map(msg => <Message key={msg.id} msg={msg} />)}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
