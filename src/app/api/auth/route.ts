import { NextRequest, NextResponse } from "next/server";
import { resolveChatIdentity, setChatIdentityCookie } from "@/lib/chatIdentity";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const identity = await resolveChatIdentity(req);
  const res = NextResponse.json({
    userId: identity.userId,
    deviceId: identity.deviceId,
  });

  if (identity.shouldSetCookie) {
    setChatIdentityCookie(res, identity.deviceId);
  }

  return res;
}
