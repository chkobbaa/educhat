import { NextRequest, NextResponse } from "next/server";
import { clearTypingPresence, getTypingUsers, upsertTypingPresence } from "@/db";
import { resolveChatIdentity, setChatIdentityCookie } from "@/lib/chatIdentity";

const ID_PATTERN = /^[a-z0-9]{6}$/;

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const identity = await resolveChatIdentity(req);
  const withId = req.nextUrl.searchParams.get("with")?.trim().toLowerCase() || "";

  if (!ID_PATTERN.test(withId)) {
    return NextResponse.json({ error: "Invalid target id" }, { status: 400 });
  }

  const typingUsers = await getTypingUsers(identity.userId);
  const isTyping = typingUsers.includes(withId);

  const res = NextResponse.json({ isTyping, typingUsers });
  if (identity.shouldSetCookie) {
    setChatIdentityCookie(res, identity.deviceId);
  }

  return res;
}

export async function POST(req: NextRequest) {
  const identity = await resolveChatIdentity(req);

  try {
    const body = (await req.json()) as { toId?: string; isTyping?: boolean };
    const toId = String(body.toId || "").trim().toLowerCase();
    const isTyping = Boolean(body.isTyping);

    if (!ID_PATTERN.test(toId)) {
      return NextResponse.json({ error: "Invalid target id" }, { status: 400 });
    }

    if (isTyping) {
      await upsertTypingPresence(identity.userId, toId, 6000);
    } else {
      await clearTypingPresence(identity.userId, toId);
    }

    const res = NextResponse.json({ ok: true });
    if (identity.shouldSetCookie) {
      setChatIdentityCookie(res, identity.deviceId);
    }

    return res;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
