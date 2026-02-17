import { NextRequest, NextResponse } from "next/server";
import { getChatMessages, getIncomingChatMessages, saveChatMessage } from "@/db";
import { resolveChatIdentity, setChatIdentityCookie } from "@/lib/chatIdentity";
import { sendDirectChatPushNotification } from "@/lib/push";

const ID_PATTERN = /^[a-z0-9]{6}$/;

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const identity = await resolveChatIdentity(req);
  const withId = req.nextUrl.searchParams.get("with")?.trim().toLowerCase();
  const incomingSinceId = Number(req.nextUrl.searchParams.get("incomingSinceId") || "0");

  if (withId && ID_PATTERN.test(withId)) {
    const messages = await getChatMessages(identity.userId, withId, 250);
    const res = NextResponse.json({ messages });
    if (identity.shouldSetCookie) {
      setChatIdentityCookie(res, identity.deviceId);
    }
    return res;
  }

  if (Number.isInteger(incomingSinceId) && incomingSinceId >= 0) {
    const messages = await getIncomingChatMessages(identity.userId, incomingSinceId, 100);
    const res = NextResponse.json({ messages });
    if (identity.shouldSetCookie) {
      setChatIdentityCookie(res, identity.deviceId);
    }
    return res;
  }

  return NextResponse.json({ error: "Missing or invalid query parameter" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const identity = await resolveChatIdentity(req);

  try {
    const body = (await req.json()) as { toId?: string; message?: string };
    const toId = String(body.toId || "").trim().toLowerCase();
    const message = String(body.message || "").trim();

    if (!ID_PATTERN.test(toId)) {
      return NextResponse.json({ error: "Invalid recipient id" }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
    }

    const messageId = await saveChatMessage(identity.userId, toId, message);

    void sendDirectChatPushNotification({
      recipientUserId: toId,
      senderId: identity.userId,
      preview: message,
      excludeDeviceId: identity.deviceId,
    });

    const res = NextResponse.json({ ok: true, messageId });
    if (identity.shouldSetCookie) {
      setChatIdentityCookie(res, identity.deviceId);
    }

    return res;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
