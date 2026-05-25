"use client";
import { useState } from "react";
import type { Conversation } from "./ChatApp";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Sidebar({ conversations, activeId, isOpen, onToggle, onSelect, onNew, onDelete }: Props) {
  const [hov, setHov] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  if (!isOpen) return null;

  return (
    <aside style={{ width: 260, flexShrink: 0, background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Conversations</span>
        <button onClick={onToggle} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px 4px" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      <div style={{ padding: "12px 12px 8px" }}>
        <button onClick={onNew} style={{ width: "100%", padding: "9px 12px", background: "var(--accent-dim)", border: "1px solid var(--accent)", borderRadius: 8, color: "var(--accent-light)", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          New conversation
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 12px" }}>
        {conversations.length === 0 ? (
          <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No conversations yet</div>
        ) : conversations.map(conv => (
          <div key={conv.id} onMouseEnter={() => setHov(conv.id)} onMouseLeave={() => setHov(null)}
            style={{ position: "relative", borderRadius: 8, marginBottom: 2, background: activeId === conv.id ? "var(--bg-tertiary)" : hov === conv.id ? "rgba(255,255,255,0.03)" : "transparent", border: activeId === conv.id ? "1px solid var(--border-light)" : "1px solid transparent" }}>
            <button onClick={() => onSelect(conv.id)} style={{ width: "100%", padding: "9px 32px 9px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left", display: "block" }}>
              <div style={{ fontSize: 13, color: activeId === conv.id ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: activeId === conv.id ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 2 }}>
                {conv.title || "New conversation"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(conv.updatedAt)}</div>
            </button>
            {(hov === conv.id || activeId === conv.id) && (
              <button onClick={e => { e.stopPropagation(); if (confirmDel === conv.id) { onDelete(conv.id); setConfirmDel(null); } else { setConfirmDel(conv.id); setTimeout(() => setConfirmDel(null), 3000); } }}
                style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: confirmDel === conv.id ? "var(--red)" : "var(--text-muted)", padding: 4, borderRadius: 4, display: "flex", alignItems: "center" }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3h9M5 3V2h3v1M4 3v7h5V3H4z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
