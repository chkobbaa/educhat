"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type Attachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

type Message = {
  id: string;
  sender: "me" | "them";
  text: string;
  createdAt: number;
  status: "sent" | "seen";
  attachment?: Attachment;
};

type Conversation = {
  id: string;
  name: string;
  handle: string;
  messages: Message[];
  updatedAt: number;
  online?: boolean;
};

const STORAGE_KEY = "educhat.local.v1";
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatMessageTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSidebarTime(timestamp: number) {
  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;

  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function getConversationPreview(conversation: Conversation) {
  const lastMessage = conversation.messages.at(-1);
  if (!lastMessage) return "No messages yet";

  if (lastMessage.attachment && lastMessage.text.trim()) {
    return `📎 ${lastMessage.text}`;
  }

  if (lastMessage.attachment) {
    return `📎 ${lastMessage.attachment.name}`;
  }

  return lastMessage.text;
}

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactHandle, setNewContactHandle] = useState("");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw) as {
        conversations?: Conversation[];
        activeChatId?: string | null;
      };

      const safeConversations = Array.isArray(parsed.conversations) ? parsed.conversations : [];
      setConversations(safeConversations);

      const safeActive =
        parsed.activeChatId && safeConversations.some((conversation) => conversation.id === parsed.activeChatId)
          ? parsed.activeChatId
          : safeConversations[0]?.id ?? null;

      setActiveChatId(safeActive);
    } catch {
      setConversations([]);
      setActiveChatId(null);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        conversations,
        activeChatId,
      }),
    );
  }, [hydrated, conversations, activeChatId]);

  const visibleChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((chat) => !q || chat.name.toLowerCase().includes(q) || chat.handle.toLowerCase().includes(q) || getConversationPreview(chat).toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [conversations, query]);

  const activeChat = useMemo(() => {
    if (!activeChatId) return null;
    return conversations.find((conversation) => conversation.id === activeChatId) ?? null;
  }, [activeChatId, conversations]);

  const sendMessage = async (attachment?: Attachment) => {
    const messageText = draft.trim();
    if (!activeChat) {
      setError("Create or select a conversation first.");
      return;
    }

    if (!messageText && !attachment) {
      return;
    }

    const message: Message = {
      id: makeId(),
      sender: "me",
      text: messageText,
      createdAt: Date.now(),
      status: "sent",
      attachment,
    };

    setConversations((previous) =>
      previous.map((conversation) => {
        if (conversation.id !== activeChat.id) {
          return conversation;
        }

        return {
          ...conversation,
          messages: [...conversation.messages, message],
          updatedAt: message.createdAt,
        };
      }),
    );

    setDraft("");
    setError(null);
  };

  const createContact = () => {
    const name = newContactName.trim();
    const handle = newContactHandle.trim().replace(/^@+/, "");

    if (!name) {
      setError("Contact name is required.");
      return;
    }

    const duplicate = conversations.some(
      (conversation) =>
        conversation.name.toLowerCase() === name.toLowerCase() ||
        (handle && conversation.handle.toLowerCase() === handle.toLowerCase()),
    );

    if (duplicate) {
      setError("That contact already exists.");
      return;
    }

    const conversation: Conversation = {
      id: makeId(),
      name,
      handle: handle || name.toLowerCase().replace(/\s+/g, "-"),
      messages: [],
      updatedAt: Date.now(),
      online: true,
    };

    setConversations((previous) => [conversation, ...previous]);
    setActiveChatId(conversation.id);
    setNewContactName("");
    setNewContactHandle("");
    setShowNewContact(false);
    setError(null);
  };

  const handleAttach = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        setError("Attachment is too large. Max file size is 5 MB.");
        return;
      }

      const dataUrl = await fileToDataUrl(file);
      await sendMessage({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
      });
    } catch {
      setError("Failed to attach file. Please try again.");
    } finally {
      event.target.value = "";
    }
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
              <button
                onClick={() => setShowNewContact((previous) => !previous)}
                className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-600"
              >
                New
              </button>
            </div>

            {showNewContact && (
              <div className="mb-4 space-y-2 rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
                <input
                  value={newContactName}
                  onChange={(event) => setNewContactName(event.target.value)}
                  placeholder="Contact name"
                  className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
                />
                <input
                  value={newContactHandle}
                  onChange={(event) => setNewContactHandle(event.target.value)}
                  placeholder="Handle (optional)"
                  className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  onClick={createContact}
                  className="w-full rounded-xl bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
                >
                  Add Contact
                </button>
              </div>
            )}

            <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search conversations"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-2">
              {visibleChats.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-500">
                  No conversations found.
                </div>
              )}

              {visibleChats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => setActiveChatId(chat.id)}
                  className={`w-full rounded-2xl px-3 py-2.5 text-left transition ${activeChat?.id === chat.id
                    ? "bg-blue-50 ring-1 ring-blue-200"
                    : "bg-white hover:bg-slate-50"
                    }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-semibold text-slate-900">{chat.name}</p>
                    <div className="flex items-center gap-2">
                      {chat.online && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                      <span className="text-[11px] text-slate-400">{formatSidebarTime(chat.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-xs text-slate-500">{getConversationPreview(chat)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col bg-[linear-gradient(180deg,#ffffff_0%,#f5f8ff_100%)]">
          <header className="flex items-center justify-between border-b border-slate-100 bg-white/80 px-4 py-3 backdrop-blur md:px-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900 md:text-lg">{activeChat?.name ?? "No conversation selected"}</h2>
              <p className="text-xs text-slate-500">
                {activeChat ? `@${activeChat.handle} • end-to-end protected` : "Create a contact to start chatting"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Call</button>
              <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Info</button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-auto px-4 py-5 md:px-6">
            {!hydrated && (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                Loading conversations...
              </div>
            )}

            {hydrated && !activeChat && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                Start by adding a contact, then send your first message.
              </div>
            )}

            {hydrated && activeChat && activeChat.messages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                No messages yet. Say hi 👋
              </div>
            )}

            {activeChat?.messages.map((message) => (
              <div key={message.id} className={`flex ${message.sender === "me" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[78%]">
                  <div
                    className={`rounded-[22px] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${message.sender === "me"
                      ? "rounded-br-md bg-blue-500 text-white"
                      : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                      }`}
                  >
                    {message.text && <div>{message.text}</div>}
                    {message.attachment && (
                      <div className={message.text ? "mt-2" : ""}>
                        {message.attachment.type.startsWith("image/") ? (
                          <Image
                            src={message.attachment.dataUrl}
                            alt={message.attachment.name}
                            width={720}
                            height={480}
                            unoptimized
                            className="max-h-64 w-full rounded-xl border border-white/30 object-cover"
                          />
                        ) : message.attachment.type.startsWith("audio/") ? (
                          <audio controls className="w-full min-w-56">
                            <source src={message.attachment.dataUrl} type={message.attachment.type} />
                          </audio>
                        ) : (
                          <a
                            href={message.attachment.dataUrl}
                            download={message.attachment.name}
                            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${message.sender === "me"
                              ? "bg-white/20 text-white"
                              : "bg-slate-100 text-slate-700"
                              }`}
                          >
                            <span>📎 {message.attachment.name}</span>
                            <span>({formatBytes(message.attachment.size)})</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={`mt-1.5 flex items-center gap-2 text-[11px] ${message.sender === "me" ? "justify-end text-slate-400" : "text-slate-400"}`}>
                    <span>{formatMessageTime(message.createdAt)}</span>
                    {message.sender === "me" && <span>{message.status === "seen" ? "Seen" : "Delivered"}</span>}
                  </div>
                </div>
              </div>
            ))}
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

            <input ref={fileInputRef} type="file" className="hidden" onChange={handleAttach} />

            <div className="flex items-end gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!activeChat}
                className="rounded-full border border-slate-200 bg-white p-2.5 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ＋
              </button>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={1}
                placeholder="Message"
                className="max-h-28 min-h-[44px] flex-1 resize-none rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100"
                disabled={!activeChat}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <button
                onClick={() => void sendMessage()}
                disabled={!activeChat || !draft.trim()}
                className="rounded-full bg-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
              </button>
            </div>

            {error && (
              <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </div>
            )}
          </footer>
        </section>
      </div>
    </main>
  );
}
