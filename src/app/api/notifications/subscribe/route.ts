import { NextRequest, NextResponse } from "next/server";
import { deletePushSubscription, savePushSubscription } from "@/db";
import { resolveChatIdentity, setChatIdentityCookie } from "@/lib/chatIdentity";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const identity = await resolveChatIdentity(req);

  try {
    const body = (await req.json()) as { subscription?: PushSubscriptionJSON };
    if (!body.subscription?.endpoint) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    await savePushSubscription(body.subscription, identity.userId, identity.deviceId);

    const res = NextResponse.json({ ok: true });
    if (identity.shouldSetCookie) {
      setChatIdentityCookie(res, identity.deviceId);
    }

    return res;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const identity = await resolveChatIdentity(req);

  try {
    const body = (await req.json()) as { endpoint?: string };
    const endpoint = String(body.endpoint || "").trim();
    if (!endpoint) {
      return NextResponse.json({ error: "Endpoint required" }, { status: 400 });
    }

    await deletePushSubscription(endpoint);

    const res = NextResponse.json({ ok: true });
    if (identity.shouldSetCookie) {
      setChatIdentityCookie(res, identity.deviceId);
    }

    return res;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
