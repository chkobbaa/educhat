import webPush from "web-push";
import { deletePushSubscription, getPushSubscriptionsByUser } from "@/db";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:admin@bahroun.me";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!publicKey || !privateKey) return;

  webPush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export async function sendDirectChatPushNotification(params: {
  recipientUserId: string;
  senderId: string;
  preview: string;
  excludeDeviceId?: string;
}) {
  ensureConfigured();
  if (!configured) return;

  const subscriptions = await getPushSubscriptionsByUser(params.recipientUserId);
  const filtered = subscriptions.filter((subscription) =>
    params.excludeDeviceId ? subscription.deviceId !== params.excludeDeviceId : true,
  );

  if (filtered.length === 0) return;

  const payload = JSON.stringify({
    title: `New message from ${params.senderId}`,
    body: params.preview,
    tag: `chat-${params.senderId}`,
    data: {
      type: "chat-message",
      fromId: params.senderId,
    },
  });

  await Promise.all(
    filtered.map(async (subscription) => {
      try {
        if (!subscription.subscription.endpoint) {
          return;
        }

        await webPush.sendNotification(subscription.subscription as unknown as webPush.PushSubscription, payload);
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : undefined;

        if (statusCode === 404 || statusCode === 410) {
          await deletePushSubscription(subscription.endpoint);
        }
      }
    }),
  );
}
