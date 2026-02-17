import { NextRequest, NextResponse } from "next/server";
import { getChatContacts, saveChatContact } from "@/db";
import { resolveChatIdentity, setChatIdentityCookie } from "@/lib/chatIdentity";

const ID_PATTERN = /^[a-z0-9]{6}$/;

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const identity = await resolveChatIdentity(req);
  const contacts = await getChatContacts(identity.userId);

  const res = NextResponse.json({ contacts });
  if (identity.shouldSetCookie) {
    setChatIdentityCookie(res, identity.deviceId);
  }

  return res;
}

export async function POST(req: NextRequest) {
  const identity = await resolveChatIdentity(req);

  try {
    const body = (await req.json()) as { contactId?: string; displayName?: string };
    const contactId = String(body.contactId || "").trim().toLowerCase();
    const displayName = String(body.displayName || "").trim();

    if (!ID_PATTERN.test(contactId)) {
      return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
    }

    if (!displayName) {
      return NextResponse.json({ error: "Display name is required" }, { status: 400 });
    }

    if (contactId === identity.userId) {
      return NextResponse.json({ error: "You cannot add yourself" }, { status: 400 });
    }

    await saveChatContact(identity.userId, contactId, displayName);
    const contacts = await getChatContacts(identity.userId);

    const res = NextResponse.json({ ok: true, contacts });
    if (identity.shouldSetCookie) {
      setChatIdentityCookie(res, identity.deviceId);
    }

    return res;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
