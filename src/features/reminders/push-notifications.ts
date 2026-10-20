import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

function isExpoGoRuntime(): boolean {
  return (
    Constants.appOwnership === "expo" || Constants.appOwnership === "guest"
  );
}

function getNotifications(): typeof import("expo-notifications") | null {
  try {
    return require("expo-notifications");
  } catch {
    return null;
  }
}

export async function ensureReminderDevicePermission(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }
  if (!Device.isDevice) {
    return false;
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    return false;
  }

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") {
    permission = await Notifications.requestPermissionsAsync();
  }

  return permission.status === "granted";
}

export async function scheduleReminderNotification(reminder: {
  id: string;
  title: string;
  description?: string | null;
  due_at: string;
}): Promise<void> {
  if (Platform.OS === "web") return;

  const Notifications = getNotifications();
  if (!Notifications) {
    throw new Error(
      "Reminder scheduling requires a native app build; Expo Go does not support this notification path.",
    );
  }

  const permissionGranted = await ensureReminderDevicePermission();
  if (!permissionGranted) {
    throw new Error(
      "Allow notifications in your device settings to receive reminder alerts.",
    );
  }

  const triggerDate = new Date(reminder.due_at);
  if (Number.isNaN(triggerDate.getTime())) {
    throw new Error("The reminder time is invalid.");
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "FarmTrack reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#208AEF",
    });
  }

  await Notifications.scheduleNotificationAsync({
    identifier: reminder.id,
    content: {
      title: reminder.title,
      body: reminder.description?.trim() || "FarmTrack reminder",
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });
}

export async function registerForReminderPush(): Promise<string> {
  if (Platform.OS === "web") {
    throw new Error(
      "Push reminders are available in the Android and iOS apps.",
    );
  }
  if (!Device.isDevice) {
    throw new Error("Push reminders require a physical device.");
  }
  if (isExpoGoRuntime()) {
    throw new Error(
      "Push reminders require a native development build or production app. Expo Go does not support Android remote push notifications.",
    );
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    throw new Error(
      "Remote push reminders require a development build or production app, not Expo Go.",
    );
  }

  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new Error(
      "Push reminders aren't configured for this app build. Set EXPO_PUBLIC_EAS_PROJECT_ID and create a development or production build.",
    );
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "FarmTrack reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#208AEF",
    });
  }

  const permissionGranted = await ensureReminderDevicePermission();
  if (!permissionGranted) {
    throw new Error(
      "Allow notifications in your device settings to use push reminders.",
    );
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}
