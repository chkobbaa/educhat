import { NextRequest, NextResponse } from "next/server";
import { saveChatAttachment, saveChatMessage } from "@/db";
import { resolveChatIdentity, setChatIdentityCookie } from "@/lib/chatIdentity";
import { sendDirectChatPushNotification } from "@/lib/push";

const ID_PATTERN = /^[a-z0-9]{6}$/;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const identity = await resolveChatIdentity(req);

  try {
    const formData = await req.formData();
    const toId = String(formData.get("toId") || "").trim().toLowerCase();
    const file = formData.get("file");

    if (!ID_PATTERN.test(toId)) {
      return NextResponse.json({ error: "Invalid recipient id" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File size must be between 1 byte and 5MB" }, { status: 400 });
    }

    const fileName = sanitizeName(file.name || "file");
    const mimeType = (file.type || "application/octet-stream").toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    const fileUrl = `data:${mimeType};base64,${base64}`;

    const messageId = await saveChatMessage(identity.userId, toId, `📎 ${fileName}`);
    await saveChatAttachment(messageId, fileName, fileUrl, mimeType, file.size);

    void sendDirectChatPushNotification({
      recipientUserId: toId,
      senderId: identity.userId,
      preview: `📎 ${fileName}`,
      excludeDeviceId: identity.deviceId,
    });

    const res = NextResponse.json({
      ok: true,
      attachment: {
        messageId,
        fileName,
        fileUrl: `/api/attachments/${messageId}`,
        mimeType,
        fileSize: file.size,
      },
    });

    if (identity.shouldSetCookie) {
      setChatIdentityCookie(res, identity.deviceId);
    }

    return res;
  } catch {
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
