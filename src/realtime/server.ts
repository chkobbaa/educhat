import { WebSocketServer, type WebSocket } from "ws";

type InboundEvent =
  | { type: "auth"; userId: string }
  | { type: "typing"; toId: string; fromId: string; isTyping: boolean }
  | { type: "new_message"; toId: string; fromId: string; messageId: number };

type OutboundEvent =
  | { type: "typing"; fromId: string; isTyping: boolean }
  | { type: "new_message"; fromId: string; messageId: number };

const port = Number(process.env.WS_PORT || 3001);
const wss = new WebSocketServer({ port });
const connectionsByUser = new Map<string, Set<WebSocket>>();
const userByConnection = new WeakMap<WebSocket, string>();

function addConnection(userId: string, ws: WebSocket) {
  const set = connectionsByUser.get(userId) ?? new Set<WebSocket>();
  set.add(ws);
  connectionsByUser.set(userId, set);
  userByConnection.set(ws, userId);
}

function removeConnection(ws: WebSocket) {
  const userId = userByConnection.get(ws);
  if (!userId) return;

  const set = connectionsByUser.get(userId);
  if (!set) return;

  set.delete(ws);
  if (set.size === 0) {
    connectionsByUser.delete(userId);
  }
}

function sendToUser(userId: string, event: OutboundEvent) {
  const targets = connectionsByUser.get(userId);
  if (!targets || targets.size === 0) return;

  const payload = JSON.stringify(event);
  for (const client of targets) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let event: InboundEvent;
    try {
      event = JSON.parse(String(raw)) as InboundEvent;
    } catch {
      return;
    }

    if (event.type === "auth") {
      if (!/^[a-z0-9]{6}$/.test(event.userId)) return;
      addConnection(event.userId, ws);
      return;
    }

    if (event.type === "typing") {
      if (!/^[a-z0-9]{6}$/.test(event.toId) || !/^[a-z0-9]{6}$/.test(event.fromId)) return;
      sendToUser(event.toId, {
        type: "typing",
        fromId: event.fromId,
        isTyping: event.isTyping,
      });
      return;
    }

    if (event.type === "new_message") {
      if (!/^[a-z0-9]{6}$/.test(event.toId) || !/^[a-z0-9]{6}$/.test(event.fromId)) return;
      sendToUser(event.toId, {
        type: "new_message",
        fromId: event.fromId,
        messageId: event.messageId,
      });
    }
  });

  ws.on("close", () => {
    removeConnection(ws);
  });

  ws.on("error", () => {
    removeConnection(ws);
  });
});

console.log(`[realtime] websocket server running on ws://localhost:${port}`);
