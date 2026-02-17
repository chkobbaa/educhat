import { createClient, type Client } from "@libsql/client";

const DB_URL = process.env.TURSO_DATABASE_URL || "file:educhat.db";
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN;

let client: Client | null = null;
let initPromise: Promise<void> | null = null;

export function getClient(): Client {
  if (!client) {
    client = createClient({
      url: DB_URL,
      authToken: DB_TOKEN,
    });
  }

  return client;
}

export async function ensureSchema(): Promise<void> {
  if (initPromise) return initPromise;

  const db = getClient();
  initPromise = (async () => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS chat_identities (
        device_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_identities_user_id ON chat_identities(user_id)`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS chat_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(owner_id, contact_id)
      )
    `);

    await db.execute(`CREATE INDEX IF NOT EXISTS idx_chat_contacts_owner ON chat_contacts(owner_id)`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    await db.execute(`CREATE INDEX IF NOT EXISTS idx_chat_from_to_ts ON chat_messages(from_id, to_id, timestamp DESC)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_chat_to_from_ts ON chat_messages(to_id, from_id, timestamp DESC)`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS chat_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
      )
    `);

    await db.execute(`CREATE INDEX IF NOT EXISTS idx_chat_attachments_message ON chat_attachments(message_id)`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        subscription_json TEXT NOT NULL,
        user_id TEXT,
        device_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    await db.execute(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_device_id ON push_subscriptions(device_id)`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS typing_presence (
        user_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY(user_id, target_id)
      )
    `);

    await db.execute(`CREATE INDEX IF NOT EXISTS idx_typing_presence_target ON typing_presence(target_id, expires_at DESC)`);
  })();

  return initPromise;
}
