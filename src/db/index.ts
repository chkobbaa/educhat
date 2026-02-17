import { ensureSchema, getClient } from "./schema";

async function qs() {
  await ensureSchema();
  return getClient();
}

export interface ChatIdentityRecord {
  deviceId: string;
  userId: string;
}

export interface ChatContactRecord {
  id: number;
  ownerId: string;
  contactId: string;
  displayName: string;
}

export interface ChatAttachmentRecord {
  messageId: number;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
}

export interface ChatMessageRecord {
  id: number;
  fromId: string;
  toId: string;
  message: string;
  timestamp: number;
  attachment?: ChatAttachmentRecord;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  subscription: PushSubscriptionJSON;
  userId?: string;
  deviceId?: string;
}

export async function getChatIdentityByDevice(deviceId: string): Promise<ChatIdentityRecord | null> {
  const db = await qs();
  const rs = await db.execute({
    sql: "SELECT device_id, user_id FROM chat_identities WHERE device_id = ? LIMIT 1",
    args: [deviceId],
  });

  const row = rs.rows[0];
  if (!row) return null;

  return {
    deviceId: row.device_id as string,
    userId: row.user_id as string,
  };
}

export async function createChatIdentity(deviceId: string, userId: string): Promise<ChatIdentityRecord | null> {
  const db = await qs();
  await db.execute({
    sql: "INSERT OR IGNORE INTO chat_identities (device_id, user_id) VALUES (?, ?)",
    args: [deviceId, userId],
  });

  return getChatIdentityByDevice(deviceId);
}

export async function saveChatContact(ownerId: string, contactId: string, displayName: string): Promise<void> {
  const db = await qs();
  await db.execute({
    sql: `
      INSERT INTO chat_contacts (owner_id, contact_id, display_name)
      VALUES (?, ?, ?)
      ON CONFLICT(owner_id, contact_id)
      DO UPDATE SET display_name = excluded.display_name
    `,
    args: [ownerId, contactId, displayName],
  });
}

export async function getChatContacts(ownerId: string): Promise<ChatContactRecord[]> {
  const db = await qs();
  const rs = await db.execute({
    sql: `
      SELECT id, owner_id, contact_id, display_name
      FROM chat_contacts
      WHERE owner_id = ?
      ORDER BY lower(display_name) ASC
    `,
    args: [ownerId],
  });

  return rs.rows.map((row) => ({
    id: Number(row.id),
    ownerId: row.owner_id as string,
    contactId: row.contact_id as string,
    displayName: row.display_name as string,
  }));
}

export async function deleteChatContact(ownerId: string, contactId: string): Promise<void> {
  const db = await qs();
  await db.execute({
    sql: "DELETE FROM chat_contacts WHERE owner_id = ? AND contact_id = ?",
    args: [ownerId, contactId],
  });
}

export async function getChatContactDisplayName(ownerId: string, contactId: string): Promise<string | null> {
  const db = await qs();
  const rs = await db.execute({
    sql: `
      SELECT display_name
      FROM chat_contacts
      WHERE owner_id = ? AND contact_id = ?
      LIMIT 1
    `,
    args: [ownerId, contactId],
  });

  return (rs.rows[0]?.display_name as string | undefined) ?? null;
}

export async function saveChatMessage(fromId: string, toId: string, message: string): Promise<number> {
  const db = await qs();
  const rs = await db.execute({
    sql: "INSERT INTO chat_messages (from_id, to_id, message, timestamp) VALUES (?, ?, ?, ?)",
    args: [fromId, toId, message, Date.now()],
  });

  return Number(rs.lastInsertRowid || 0);
}

export async function saveChatAttachment(
  messageId: number,
  fileName: string,
  fileUrl: string,
  mimeType: string,
  fileSize: number,
): Promise<void> {
  const db = await qs();
  await db.execute({
    sql: `
      INSERT INTO chat_attachments (message_id, file_name, file_url, mime_type, file_size)
      VALUES (?, ?, ?, ?, ?)
    `,
    args: [messageId, fileName, fileUrl, mimeType, fileSize],
  });
}

export async function getChatAttachmentByMessageId(messageId: number): Promise<ChatAttachmentRecord | null> {
  const db = await qs();
  const rs = await db.execute({
    sql: `
      SELECT message_id, file_name, file_url, mime_type, file_size
      FROM chat_attachments
      WHERE message_id = ?
      LIMIT 1
    `,
    args: [messageId],
  });

  const row = rs.rows[0];
  if (!row) return null;

  return {
    messageId: Number(row.message_id),
    fileName: row.file_name as string,
    fileUrl: row.file_url as string,
    mimeType: row.mime_type as string,
    fileSize: Number(row.file_size),
  };
}

export async function getChatMessages(userA: string, userB: string, limit: number = 200): Promise<ChatMessageRecord[]> {
  const db = await qs();
  const rs = await db.execute({
    sql: `
      SELECT id, from_id, to_id, message, timestamp
      FROM chat_messages
      WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
      ORDER BY timestamp ASC
      LIMIT ?
    `,
    args: [userA, userB, userB, userA, limit],
  });

  const messages = rs.rows.map((row) => ({
    id: Number(row.id),
    fromId: row.from_id as string,
    toId: row.to_id as string,
    message: row.message as string,
    timestamp: Number(row.timestamp),
  }));

  if (messages.length === 0) return messages;

  const ids = messages.map((m) => m.id);
  const placeholders = ids.map(() => "?").join(", ");
  const attachmentsRs = await db.execute({
    sql: `
      SELECT message_id, file_name, file_url, mime_type, file_size
      FROM chat_attachments
      WHERE message_id IN (${placeholders})
    `,
    args: ids,
  });

  const attachmentMap = new Map<number, ChatAttachmentRecord>();
  for (const row of attachmentsRs.rows) {
    const messageId = Number(row.message_id);
    attachmentMap.set(messageId, {
      messageId,
      fileName: row.file_name as string,
      fileUrl: `/api/attachments/${messageId}`,
      mimeType: row.mime_type as string,
      fileSize: Number(row.file_size),
    });
  }

  return messages.map((m) => ({
    ...m,
    attachment: attachmentMap.get(m.id),
  }));
}

export async function getIncomingChatMessages(userId: string, sinceId: number, limit: number = 200): Promise<ChatMessageRecord[]> {
  const db = await qs();
  const rs = await db.execute({
    sql: `
      SELECT id, from_id, to_id, message, timestamp
      FROM chat_messages
      WHERE to_id = ? AND id > ?
      ORDER BY id ASC
      LIMIT ?
    `,
    args: [userId, sinceId, limit],
  });

  return rs.rows.map((row) => ({
    id: Number(row.id),
    fromId: row.from_id as string,
    toId: row.to_id as string,
    message: row.message as string,
    timestamp: Number(row.timestamp),
  }));
}

export async function savePushSubscription(
  subscription: PushSubscriptionJSON,
  userId?: string,
  deviceId?: string,
): Promise<void> {
  const endpoint = subscription.endpoint;
  if (!endpoint) throw new Error("Subscription endpoint is required");

  const db = await qs();
  await db.execute({
    sql: `
      INSERT OR REPLACE INTO push_subscriptions (endpoint, subscription_json, user_id, device_id)
      VALUES (?, ?, ?, ?)
    `,
    args: [endpoint, JSON.stringify(subscription), userId ?? null, deviceId ?? null],
  });
}

export async function getPushSubscriptionsByUser(userId: string): Promise<PushSubscriptionRecord[]> {
  const db = await qs();
  const rs = await db.execute({
    sql: "SELECT endpoint, subscription_json, user_id, device_id FROM push_subscriptions WHERE user_id = ?",
    args: [userId],
  });

  return rs.rows.map((row) => ({
    endpoint: row.endpoint as string,
    subscription: JSON.parse(row.subscription_json as string) as PushSubscriptionJSON,
    userId: (row.user_id as string | undefined) ?? undefined,
    deviceId: (row.device_id as string | undefined) ?? undefined,
  }));
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const db = await qs();
  await db.execute({
    sql: "DELETE FROM push_subscriptions WHERE endpoint = ?",
    args: [endpoint],
  });
}

export async function upsertTypingPresence(userId: string, targetId: string, ttlMs: number = 6000): Promise<void> {
  const db = await qs();
  const expiresAt = Date.now() + ttlMs;
  await db.execute({
    sql: `
      INSERT INTO typing_presence (user_id, target_id, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, target_id)
      DO UPDATE SET expires_at = excluded.expires_at, updated_at = datetime('now')
    `,
    args: [userId, targetId, expiresAt],
  });
}

export async function clearTypingPresence(userId: string, targetId: string): Promise<void> {
  const db = await qs();
  await db.execute({
    sql: "DELETE FROM typing_presence WHERE user_id = ? AND target_id = ?",
    args: [userId, targetId],
  });
}

export async function getTypingUsers(targetId: string): Promise<string[]> {
  const db = await qs();
  await db.execute({
    sql: "DELETE FROM typing_presence WHERE expires_at < ?",
    args: [Date.now()],
  });

  const rs = await db.execute({
    sql: "SELECT user_id FROM typing_presence WHERE target_id = ? AND expires_at >= ?",
    args: [targetId, Date.now()],
  });

  return rs.rows.map((row) => row.user_id as string);
}
