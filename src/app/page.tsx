"use client";

import { useMemo, useState } from "react";

type Chat = {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread: number;
  online?: boolean;
  pinned?: boolean;
};

type Message = {
  id: string;
  mine: boolean;
  text: string;
  time: string;
  seen?: boolean;
  reactions?: string[];
};

const seedChats: Chat[] = [
  { id: "design-lab", name: "Design Lab", preview: "Voice note sounds clean now 👌", time: "2m", unread: 3, online: true, pinned: true },
  { id: "emma", name: "Emma", preview: "That micro-interaction is perfect", time: "8m", unread: 1, online: true },
  { id: "study-club", name: "Study Club", preview: "Live room starts in 20 minutes", time: "20m", unread: 0 },
  { id: "alex", name: "Alex", preview: "Let’s ship this tonight", time: "1h", unread: 0 },
  { id: "mona", name: "Mona", preview: "Can you review the onboarding copy?", time: "4h", unread: 0 },
];

const seedMessages: Message[] = [
  { id: "m1", mine: false, text: "We should make this app feel calm and addictive in a good way.", time: "11:18", reactions: ["✨"] },
  { id: "m2", mine: true, text: "Yes — instant feedback, less friction, and delightful tiny details.", time: "11:19", seen: true, reactions: ["💙", "🔥"] },
  { id: "m3", mine: false, text: "The iMessage-style visual rhythm is working. Keep the soft depth and spacing.", time: "11:20" },
  { id: "m4", mine: true, text: "Done. I also tuned composer behavior so people stay in flow and type longer.", time: "11:21", seen: true },
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [activeChatId, setActiveChatId] = useState(seedChats[0].id);
  const [messages, setMessages] = useState(seedMessages);
  const [draft, setDraft] = useState("");

  const visibleChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    return seedChats
      .filter((chat) => !q || chat.name.toLowerCase().includes(q) || chat.preview.toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [query]);

  const activeChat = visibleChats.find((c) => c.id === activeChatId) ?? visibleChats[0] ?? seedChats[0];

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;

    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    setMessages((prev) => [
      ...prev,
      {
        id: `m-${Date.now()}`,
        mine: true,
        text,
        time,
        seen: false,
      },
    ]);

    setDraft("");
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(1200px_400px_at_80%_-10%,#3b82f61f,transparent),linear-gradient(180deg,#f8fbff_0%,#edf3ff_100%)] px-4 py-5 text-slate-900 md:px-8 md:py-8">
      <div className="mx-auto grid h-[92vh] w-full max-w-7xl grid-cols-1 overflow-hidden rounded-[28px] border border-white/60 bg-white/70 shadow-[0_20px_60px_rgba(22,34,58,0.12)] backdrop-blur md:grid-cols-[340px_minmax(0,1fr)]">
        <section className="border-b border-slate-100/80 bg-white/80 md:border-b-0 md:border-r">
          <div className="p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-500">EduChat</p>
                <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
              </div>
              <button className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-600">
                New
              </button>
            </div>

            <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search conversations"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-2">
              {visibleChats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => setActiveChatId(chat.id)}
                  className={`w-full rounded-2xl px-3 py-2.5 text-left transition ${activeChat.id === chat.id
                    ? "bg-blue-50 ring-1 ring-blue-200"
                    : "bg-white hover:bg-slate-50"
                    }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-semibold text-slate-900">{chat.name}</p>
                    <div className="flex items-center gap-2">
                      {chat.online && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                      <span className="text-[11px] text-slate-400">{chat.time}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-xs text-slate-500">{chat.preview}</p>
                    {chat.unread > 0 && (
                      <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[11px] font-semibold text-white">{chat.unread}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col bg-[linear-gradient(180deg,#ffffff_0%,#f5f8ff_100%)]">
          <header className="flex items-center justify-between border-b border-slate-100 bg-white/80 px-4 py-3 backdrop-blur md:px-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900 md:text-lg">{activeChat.name}</h2>
              <p className="text-xs text-slate-500">Active now • end-to-end protected</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Call</button>
              <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Info</button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-auto px-4 py-5 md:px-6">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.mine ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[78%]">
                  <div
                    className={`rounded-[22px] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${message.mine
                      ? "rounded-br-md bg-blue-500 text-white"
                      : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                      }`}
                  >
                    {message.text}
                  </div>

                  <div className={`mt-1.5 flex items-center gap-2 text-[11px] ${message.mine ? "justify-end text-slate-400" : "text-slate-400"}`}>
                    <span>{message.time}</span>
                    {message.mine && <span>{message.seen ? "Seen" : "Delivered"}</span>}
                  </div>

                  {!!message.reactions?.length && (
                    <div className={`mt-1 flex gap-1 ${message.mine ? "justify-end" : "justify-start"}`}>
                      {message.reactions.map((reaction, index) => (
                        <span key={`${message.id}-${index}`} className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-xs">
                          {reaction}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className="flex items-center gap-1 px-2 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300 [animation-delay:300ms]" />
              <span className="ml-1">Emma is typing…</span>
            </div>
          </div>

          <footer className="border-t border-slate-100 bg-white/90 px-4 py-3 md:px-6 md:py-4">
            <div className="mb-2 flex items-center gap-2 overflow-auto pb-1 text-xs">
              {["👍 Nice", "📚 Study Time", "✅ Done", "🔥 Ship It", "🗓️ Reminder"].map((quickReply) => (
                <button
                  key={quickReply}
                  onClick={() => setDraft(quickReply)}
                  className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 hover:bg-slate-50"
                >
                  {quickReply}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2">
              <button className="rounded-full border border-slate-200 bg-white p-2.5 text-slate-500 hover:bg-slate-50">＋</button>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={1}
                placeholder="Message"
                className="max-h-28 min-h-[44px] flex-1 resize-none rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button
                onClick={sendMessage}
                className="rounded-full bg-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600"
              >
                Send
              </button>
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}
