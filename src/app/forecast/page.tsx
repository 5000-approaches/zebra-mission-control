"use client";

import { useRef, useState, useEffect, FormEvent } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function ForecastPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    const assistantMessage: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const res = await fetch("/api/forecast-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: `Error: ${res.statusText}` },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
        });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex flex-col h-[calc(100vh-0px)]"
      style={{ background: "var(--page-bg)" }}
    >
      <div className="px-6 py-5 border-b flex-shrink-0" style={{ borderColor: "var(--page-border)" }}>
        <h1 className="text-xl font-bold" style={{ color: "var(--page-text)" }}>
          Forecast Chat
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--page-text)", opacity: 0.55 }}>
          Ask billing and revenue questions backed by PowerOffice data
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-sm text-center mt-12" style={{ color: "var(--page-text)", opacity: 0.4 }}>
            Ask a question like &ldquo;What is our billable forecast for April?&rdquo;
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              data-testid={msg.role === "assistant" ? "assistant-message" : "user-message"}
              className="max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap"
              style={
                msg.role === "user"
                  ? { background: "var(--accent-lighter)", color: "var(--accent-darker)" }
                  : {
                      background: "var(--page-surface)",
                      border: "1px solid var(--page-border)",
                      color: "var(--page-text)",
                    }
              }
            >
              {msg.content || (loading && i === messages.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="flex-shrink-0 px-6 py-4 border-t flex gap-3"
        style={{ borderColor: "var(--page-border)", background: "var(--page-bg)" }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a forecast question…"
          disabled={loading}
          className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
          style={{
            background: "var(--page-surface)",
            border: "1px solid var(--page-border)",
            color: "var(--page-text)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
