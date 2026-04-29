"use client";

import { useRef, useState, useEffect, ChangeEvent, FormEvent } from "react";

type Attachment = { data: string; mediaType: string; name: string };
type Message = { role: "user" | "assistant"; content: string; attachments?: Attachment[] };

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
const MAX_BYTES = 5 * 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ForecastPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function addFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError("Unsupported type — use JPEG, PNG, GIF, WEBP, or PDF");
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError("File exceeds 5 MB limit");
      return;
    }
    setFileError(null);
    const data = await readFileAsBase64(file);
    setPendingAttachments([{ data, mediaType: file.type, name: file.name }]);
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await addFile(file);
    e.target.value = "";
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageItem = Array.from(e.clipboardData.items).find((i) =>
      i.type.startsWith("image/")
    );
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) await addFile(file);
  }

  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if ((!text && pendingAttachments.length === 0) || loading) return;

    const att = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    const userMessage: Message = { role: "user", content: text, attachments: att };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setPendingAttachments([]);
    setFileError(null);
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
    <div className="flex flex-col h-screen" style={{ background: "var(--page-bg)" }}>
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
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
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
              {msg.attachments?.map((att, ai) =>
                att.mediaType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={ai}
                    src={`data:${att.mediaType};base64,${att.data}`}
                    alt={att.name}
                    className="max-w-[200px] max-h-[200px] rounded-lg mb-2 block"
                  />
                ) : (
                  <div key={ai} className="flex items-center gap-1.5 mb-2 text-xs" style={{ opacity: 0.75 }}>
                    <span>📄</span>
                    <span>{att.name}</span>
                  </div>
                )
              )}
              {msg.content || (loading && i === messages.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="flex-shrink-0 px-6 py-4 border-t"
        style={{ borderColor: "var(--page-border)", background: "var(--page-bg)" }}
      >
        {pendingAttachments.length > 0 && (
          <div className="flex gap-2 mb-2">
            {pendingAttachments.map((att, i) => (
              <div key={i} className="relative">
                {att.mediaType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:${att.mediaType};base64,${att.data}`}
                    alt={att.name}
                    className="h-16 w-16 rounded-lg object-cover"
                    style={{ border: "1px solid var(--page-border)" }}
                  />
                ) : (
                  <div
                    className="h-16 w-16 rounded-lg flex flex-col items-center justify-center gap-1 text-xs"
                    style={{
                      border: "1px solid var(--page-border)",
                      background: "var(--page-surface)",
                      color: "var(--page-text)",
                      opacity: 0.8,
                    }}
                  >
                    <span className="text-lg">📄</span>
                    <span className="truncate w-12 text-center text-[10px]">{att.name.slice(-8)}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setPendingAttachments([])}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white text-xs flex items-center justify-center"
                  style={{ background: "#6b7280" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {fileError && (
          <p className="text-xs mb-2" style={{ color: "#ef4444" }}>
            {fileError}
          </p>
        )}
        <div className="flex gap-3 items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image or PDF"
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-opacity hover:opacity-70"
            style={{
              background: "var(--page-surface)",
              border: "1px solid var(--page-border)",
              color: "var(--page-text)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder="Ask a forecast question…"
            disabled={loading}
            rows={1}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors resize-none"
            style={{
              background: "var(--page-surface)",
              border: "1px solid var(--page-border)",
              color: "var(--page-text)",
              minHeight: "42px",
              maxHeight: "120px",
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
            disabled={loading || (!input.trim() && pendingAttachments.length === 0)}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ background: "var(--accent)", color: "white" }}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
