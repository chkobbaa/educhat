"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  id: number;
  fromId: string;
  toId: string;
  message: string;
  timestamp: number;
  attachment?: {
    messageId: number;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    fileSize: number;
  };
};

type ChatContact = {
  id: number;
  ownerId: string;
  contactId: string;
  displayName: string;
};

type WsEvent =
  | { type: "typing"; fromId: string; isTyping: boolean }
  | { type: "new_message"; fromId: string; messageId: number };

const DEVICE_STORAGE_KEY = "educhat-device-id";
const DEVICE_ID_PATTERN = /^[a-f0-9]{32}$/;
const CHAT_ID_PATTERN = /^[a-z0-9]{6}$/;

function createDeviceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_STORAGE_KEY)?.trim().toLowerCase();
  if (existing && DEVICE_ID_PATTERN.test(existing)) {
    return existing;
  }

  const generated = createDeviceId();
  localStorage.setItem(DEVICE_STORAGE_KEY, generated);
  return generated;
}

function formatSidebarTime(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  return `${Math.floor(diffHour / 24)}d`;
}

function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function base64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export default function Home() {
  const [myId, setMyId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [activeToId, setActiveToId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [typingRemote, setTypingRemote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactId, setNewContactId] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const lastIncomingIdRef = useRef(0);
  const typingTimerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchWithIdentity = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers || {});
      if (deviceId && DEVICE_ID_PATTERN.test(deviceId)) {
        headers.set("x-chat-device-id", deviceId);
      }

      return fetch(url, {
        ...init,
        headers,
      });
    },
    [deviceId],
  );

  const sortedContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .filter(
        (c) =>
          !q ||
          c.displayName.toLowerCase().includes(q) ||
          c.contactId.toLowerCase().includes(q),
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [contacts, query]);

  const activeContact = useMemo(
    () => contacts.find((c) => c.contactId === activeToId) ?? null,
    [contacts, activeToId],
  );

  const loadContacts = useCallback(async () => {
    const res = await fetchWithIdentity("/api/contacts");
    const data = (await res.json()) as { contacts?: ChatContact[]; error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Failed to load contacts");
    }

    const nextContacts = data.contacts || [];
    setContacts(nextContacts);
    if (!activeToId && nextContacts[0]) {
      setActiveToId(nextContacts[0].contactId);
    }
  }, [activeToId, fetchWithIdentity]);

  const loadMessages = useCallback(
    async (toId: string) => {
      if (!CHAT_ID_PATTERN.test(toId)) {
        setMessages([]);
        return;
      }

      const res = await fetchWithIdentity(`/api/messages?with=${toId}`);
      const data = (await res.json()) as { messages?: ChatMessage[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to load messages");
      }

      const nextMessages = data.messages || [];
      setMessages(nextMessages);
      const maxId = nextMessages.reduce((acc, m) => Math.max(acc, m.id), 0);
      lastIncomingIdRef.current = Math.max(lastIncomingIdRef.current, maxId);
    },
    [fetchWithIdentity],
  );

  const pollIncoming = useCallback(async () => {
    if (!myId) return;

    const res = await fetchWithIdentity(`/api/messages?incomingSinceId=${lastIncomingIdRef.current}`);
    const data = (await res.json()) as { messages?: ChatMessage[] };
    if (!res.ok || !data.messages?.length) return;

    const incoming = data.messages;
    const maxId = incoming.reduce((acc, m) => Math.max(acc, m.id), lastIncomingIdRef.current);
    lastIncomingIdRef.current = maxId;

    if (activeToId && incoming.some((message) => message.fromId === activeToId || message.toId === activeToId)) {
      await loadMessages(activeToId);
    }
  }, [activeToId, fetchWithIdentity, loadMessages, myId]);

  const sendTyping = useCallback(
    async (isTyping: boolean) => {
      if (!CHAT_ID_PATTERN.test(activeToId)) return;

      await fetchWithIdentity("/api/presence/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toId: activeToId, isTyping }),
      });

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && myId) {
        wsRef.current.send(
          JSON.stringify({
            type: "typing",
            toId: activeToId,
            fromId: myId,
            isTyping,
          }),
        );
      }
    },
    [activeToId, fetchWithIdentity, myId],
  );

  useEffect(() => {
    if (!activeToId || !myId) return;

    const interval = window.setInterval(async () => {
      try {
        const res = await fetchWithIdentity(`/api/presence/typing?with=${activeToId}`);
        const data = (await res.json()) as { isTyping?: boolean };
        if (res.ok) {
          setTypingRemote(Boolean(data.isTyping));
        }
      } catch {
        // keep quiet on polling failures
      }
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeToId, fetchWithIdentity, myId]);

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);
  }, []);

  useEffect(() => {
    if (!deviceId) return;

    (async () => {
      try {
        const authRes = await fetchWithIdentity("/api/auth");
        const authData = (await authRes.json()) as { userId?: string; error?: string };
        if (!authRes.ok || !authData.userId) {
          throw new Error(authData.error || "Failed to initialize identity");
        }

        setMyId(authData.userId);
        await loadContacts();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialize app");
      }
    })();
  }, [deviceId, fetchWithIdentity, loadContacts]);

  useEffect(() => {
    if (!activeToId) return;

    loadMessages(activeToId).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    });
  }, [activeToId, loadMessages]);

  useEffect(() => {
    if (!myId) return;

    const interval = window.setInterval(() => {
      void pollIncoming();
    }, 2500);

    return () => {
      window.clearInterval(interval);
    };
  }, [myId, pollIncoming]);

  useEffect(() => {
    if (!myId) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", userId: myId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as WsEvent;
          if (data.type === "typing" && data.fromId === activeToId) {
            setTypingRemote(data.isTyping);
          }

          if (data.type === "new_message") {
            lastIncomingIdRef.current = Math.max(lastIncomingIdRef.current, data.messageId);
            if (data.fromId === activeToId) {
              void loadMessages(activeToId);
            }
          }
        } catch {
          // ignore malformed realtime payloads
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
      };

      ws.onerror = () => {
        if (wsRef.current === ws) wsRef.current = null;
      };

      return () => {
        if (wsRef.current === ws) wsRef.current = null;
        ws.close();
      };
    } catch {
      return;
    }
  }, [activeToId, loadMessages, myId]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return;
    }

    setPushSupported(true);

    (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        setPushEnabled(Boolean(subscription));
      } catch {
        setPushEnabled(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, typingRemote]);

  const sendMessage = async () => {
    const messageText = draft.trim();
    if (!CHAT_ID_PATTERN.test(activeToId) || !messageText) return;

    try {
      const res = await fetchWithIdentity("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toId: activeToId, message: messageText }),
      });

      const data = (await res.json()) as { ok?: boolean; messageId?: number; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to send message");
      }

      setDraft("");
      await sendTyping(false);
      await loadMessages(activeToId);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && myId && data.messageId) {
        wsRef.current.send(
          JSON.stringify({
            type: "new_message",
            toId: activeToId,
            fromId: myId,
            messageId: data.messageId,
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    }
  };

  const uploadAttachment = async (file: File) => {
    if (!CHAT_ID_PATTERN.test(activeToId)) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("toId", activeToId);
      formData.append("file", file);

      const res = await fetchWithIdentity("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as { ok?: boolean; attachment?: { messageId: number }; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload file");
      }

      await loadMessages(activeToId);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && myId && data.attachment?.messageId) {
        wsRef.current.send(
          JSON.stringify({
            type: "new_message",
            toId: activeToId,
            fromId: myId,
            messageId: data.attachment.messageId,
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onSelectAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadAttachment(file);
    }
  };

  const addContact = async () => {
    const id = newContactId.trim().toLowerCase();
    const name = newContactName.trim();

    if (!CHAT_ID_PATTERN.test(id)) {
      setError("Contact ID must be 6 lowercase letters or numbers");
      return;
    }

    if (!name) {
      setError("Contact name is required");
      return;
    }

    try {
      const res = await fetchWithIdentity("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: id, displayName: name }),
      });

      const data = (await res.json()) as { contacts?: ChatContact[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to add contact");
      }

      setContacts(data.contacts || []);
      setActiveToId(id);
      setShowNewContact(false);
      setNewContactId("");
      setNewContactName("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contact");
    }
  };

  const togglePush = async () => {
    if (!pushSupported) return;

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();

      if (existing) {
        await fetchWithIdentity("/api/notifications/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setPushEnabled(false);
        return;
      }

      const permission =
        Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notification permission denied");
        return;
      }

      const vapidRes = await fetchWithIdentity("/api/notifications/vapid");
      const vapidData = (await vapidRes.json()) as { publicKey?: string };
      if (!vapidData.publicKey) {
        throw new Error("VAPID public key missing on server");
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(vapidData.publicKey) as unknown as BufferSource,
      });

      await fetchWithIdentity("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });

      setPushEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle push notifications");
    }
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (!CHAT_ID_PATTERN.test(activeToId)) return;

    void sendTyping(true);

    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = window.setTimeout(() => {
      void sendTyping(false);
    }, 2500);
  };

  const conversationPreview = (contactId: string): string => {
    const related = messages.filter((m) => m.fromId === contactId || m.toId === contactId);
    const last = related.at(-1);
    if (!last) return "No messages yet";
    if (last.attachment) return `📎 ${last.attachment.fileName}`;
    return last.message;
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(1200px_400px_at_80%_-10%,#3b82f61f,transparent),linear-gradient(180deg,#f8fbff_0%,#edf3ff_100%)] px-4 py-5 text-slate-900 md:px-8 md:py-8">
      <div className="mx-auto grid h-[92vh] w-full max-w-7xl grid-cols-1 overflow-hidden rounded-[28px] border border-white/60 bg-white/70 shadow-[0_20px_60px_rgba(22,34,58,0.12)] backdrop-blur md:grid-cols-[340px_minmax(0,1fr)]">
        <section className="border-b border-slate-100/80 bg-white/80 md:border-b-0 md:border-r">
          <div className="p-4 md:p-5">
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-500">EduChat</p>
              <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
              <p className="mt-1 text-xs text-slate-500">Your ID: {myId || "..."}</p>
            </div>

            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => setShowNewContact((prev) => !prev)}
                className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-600"
              >
                New Contact
              </button>
              <button
                onClick={togglePush}
                disabled={!pushSupported}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
              >
                {pushEnabled ? "Push On" : "Push Off"}
              </button>
            </div>

            {showNewContact && (
              <div className="mb-4 space-y-2 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
                <input
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="Display name"
                  className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
                />
                <input
                  value={newContactId}
                  onChange={(e) => setNewContactId(e.target.value)}
                  placeholder="Contact ID (6 chars)"
                  className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  onClick={addContact}
                  className="w-full rounded-xl bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
                >
                  Add
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
              {sortedContacts.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-500">
                  Add a contact using their 6-char ID to start chatting.
                </div>
              )}

              {sortedContacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => setActiveToId(contact.contactId)}
                  className={`w-full rounded-2xl px-3 py-2.5 text-left transition ${activeToId === contact.contactId ? "bg-blue-50 ring-1 ring-blue-200" : "bg-white hover:bg-slate-50"}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-semibold text-slate-900">{contact.displayName}</p>
                    <span className="text-[11px] text-slate-400">{messages.length > 0 ? formatSidebarTime(messages.at(-1)?.timestamp || Date.now()) : ""}</span>
                  </div>
                  <p className="line-clamp-1 text-xs text-slate-500">{conversationPreview(contact.contactId)}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col bg-[linear-gradient(180deg,#ffffff_0%,#f5f8ff_100%)]">
          <header className="flex items-center justify-between border-b border-slate-100 bg-white/80 px-4 py-3 backdrop-blur md:px-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900 md:text-lg">{activeContact?.displayName || "No recipient selected"}</h2>
              <p className="text-xs text-slate-500">{activeContact ? `ID: ${activeContact.contactId}` : "Select a contact to chat"}</p>
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-auto px-4 py-5 md:px-6">
            {!activeToId && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                Add or select a contact to begin.
              </div>
            )}

            {activeToId && messages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                No messages yet. Send the first one.
              </div>
            )}

            {messages.map((message) => {
              const mine = message.fromId === myId;
              return (
                <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[78%]">
                    <div
                      className={`rounded-[22px] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${mine ? "rounded-br-md bg-blue-500 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800"}`}
                    >
                      <div>{message.message}</div>
                      {message.attachment && (
                        <div className="mt-2">
                          {message.attachment.mimeType.startsWith("image/") ? (
                            <Image
                              src={message.attachment.fileUrl}
                              alt={message.attachment.fileName}
                              width={720}
                              height={480}
                              unoptimized
                              className="max-h-72 w-full rounded-xl object-cover"
                            />
                          ) : message.attachment.mimeType.startsWith("audio/") ? (
                            <audio controls className="w-full min-w-56">
                              <source src={message.attachment.fileUrl} type={message.attachment.mimeType} />
                            </audio>
                          ) : (
                            <a
                              href={message.attachment.fileUrl}
                              download={message.attachment.fileName}
                              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${mine ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}
                            >
                              <span>📎 {message.attachment.fileName}</span>
                              <span>({formatBytes(message.attachment.fileSize)})</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={`mt-1.5 flex items-center gap-2 text-[11px] ${mine ? "justify-end text-slate-400" : "text-slate-400"}`}>
                      <span>{formatMessageTime(message.timestamp)}</span>
                      {mine && <span>Delivered</span>}
                    </div>
                  </div>
                </div>
              );
            })}

            {typingRemote && (
              <div className="flex items-center gap-1 px-2 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300 [animation-delay:300ms]" />
                <span className="ml-1">{activeContact?.displayName || "Contact"} is typing…</span>
              </div>
            )}
          </div>

          <footer className="border-t border-slate-100 bg-white/90 px-4 py-3 md:px-6 md:py-4">
            <input ref={fileRef} type="file" className="hidden" onChange={onSelectAttachment} />

            <div className="flex items-end gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading || !activeToId}
                className="rounded-full border border-slate-200 bg-white p-2.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                ＋
              </button>

              <textarea
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                rows={1}
                placeholder={activeToId ? "Message" : "Select a contact to message"}
                className="max-h-28 min-h-[44px] flex-1 resize-none rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2 disabled:opacity-50"
                disabled={!activeToId}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
              />

              <button
                onClick={() => void sendMessage()}
                disabled={!activeToId || !draft.trim()}
                className="rounded-full bg-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-40"
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
