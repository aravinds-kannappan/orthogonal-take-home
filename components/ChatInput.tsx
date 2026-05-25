"use client";
import { useState, useRef, useEffect } from "react";

export default function ChatInput({ onSend, onStop, isLoading }: { onSend: (m: string) => void; onStop: () => void; isLoading: boolean }) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [value]);

  const handleSend = () => {
    const t = value.trim();
    if (!t || isLoading) return;
    onSend(t);
    setValue("");
  };

  return (
    <div style={{ padding: "12px 24px 20px", background: "var(--bg-secondary)", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, padding: "10px 12px 10px 16px", background: "var(--bg-tertiary)", border: "1px solid var(--border-light)", borderRadius: 14 }}>
          <textarea
            ref={taRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask about companies, people, contacts…"
            rows={1}
            style={{ flex: 1, background: "none", border: "none", outline: "none", resize: "none", color: "var(--text-primary)", fontSize: 14, lineHeight: 1.6, fontFamily: "inherit", maxHeight: 200, overflowY: "auto", paddingTop: 2 }}
          />
          {isLoading ? (
            <button onClick={onStop} style={{ width: 34, height: 34, borderRadius: 10, background: "var(--red)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="white"/></svg>
            </button>
          ) : (
            <button onClick={handleSend} disabled={!value.trim()} style={{ width: 34, height: 34, borderRadius: 10, background: value.trim() ? "var(--accent)" : "var(--border)", border: "none", cursor: value.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 2L13 7.5L7.5 13M2 7.5h11" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
        </div>
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
          Powered by Orthogonal APIs · Apollo, Fiber AI, Sixtyfour, Tomba
        </div>
      </div>
    </div>
  );
}
