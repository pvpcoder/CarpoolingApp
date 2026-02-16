import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Register for push notifications and save token
export async function registerForPushNotifications(userId: string) {
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission not granted");
    return null;
  }

  // Get the Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: undefined, // Uses the projectId from app.json
  });

  const token = tokenData.data;

  // Save to database (upsert to avoid duplicates)
  await supabase.from("push_tokens").upsert(
    { user_id: userId, token },
    { onConflict: "user_id,token" }
  );

  // Android needs a notification channel
  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  return token;
}

// Send push notification to specific users
export async function sendPushNotification(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, any>
) {
  // Get tokens for these users
  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token")
    .in("user_id", userIds);

  if (!tokens || tokens.length === 0) return;

  // Send via Expo push service
  const messages = tokens.map((t: any) => ({
    to: t.token,
    sound: "default",
    title,
    body,
    data: data || {},
  }));

  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error("Failed to send push notification:", err);
  }
}

// Helper: notify all group members except the sender
export async function notifyGroupMembers(
  groupId: string,
  senderId: string,
  title: string,
  body: string
) {
  const { data: members } = await supabase
    .from("group_members")
    .select("student_id, parent_id")
    .eq("group_id", groupId)
    .eq("status", "active");

  if (!members) return;

  const userIds = members
    .flatMap((m: any) => [m.student_id, m.parent_id])
    .filter((id: any) => id && id !== senderId);

  const unique = [...new Set(userIds)];
  await sendPushNotification(unique, title, body, { groupId });
}
