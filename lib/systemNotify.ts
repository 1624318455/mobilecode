import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL_ID = "replies";

let channelReady = false;

export interface ReplyNotification {
  title: string;
  body: string;
  serverId: string;
  projectId: string;
  sessionId: string;
}

export interface ReplyTap {
  serverId: string;
  projectId: string;
  sessionId: string;
}

// Foreground handler: when a notification arrives while the app is open,
// still show it as a heads-up banner (the red dot covers the chat lists,
// this covers the case where the user stares at an unrelated screen).
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureReplyChannel(): Promise<void> {
  if (channelReady || Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Session replies",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  channelReady = true;
}

export async function requestNotifyPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();

  if (current.granted) {
    return true;
  }

  const next = await Notifications.requestPermissionsAsync();

  return next.granted;
}

// The unread store defaults notifyEnabled to true, so a fresh install may
// never pass through the settings toggle that requests permission. Call
// this once per cold start: granted stays silent, ungranted shows the
// system dialog (or returns denied without a dialog when the user picked
// "don't ask again" — harmless to retry next launch).
export async function ensureNotifyPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();

    if (current.granted) {
      return true;
    }

    const next = await Notifications.requestPermissionsAsync();

    return next.granted;
  } catch {
    return false;
  }
}

export async function notifyReply(notification: ReplyNotification): Promise<void> {
  await ensureReplyChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: notification.title,
      body: notification.body,
      data: {
        serverId: notification.serverId,
        projectId: notification.projectId,
        sessionId: notification.sessionId,
      },
    },
    trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null,
  });
}

export function addReplyTapListener(onTap: (tap: ReplyTap) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;

      if (
        typeof data?.serverId === "string" &&
        typeof data?.projectId === "string" &&
        typeof data?.sessionId === "string"
      ) {
        onTap({
          serverId: data.serverId,
          projectId: data.projectId,
          sessionId: data.sessionId,
        });
      }
    },
  );

  return () => {
    subscription.remove();
  };
}
