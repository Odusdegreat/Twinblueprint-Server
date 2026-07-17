import { supabase } from "../config/supabase.ts";
import type { Notification } from "../types/notification.types.ts";
import type { CreateNotificationInput } from "../validations/notification.validation.ts";

export const createNotification = async (
  data: CreateNotificationInput,
): Promise<Notification> => {
  const { data: notification, error } = await supabase
    .from("notifications")
    .insert({
      user_id: data.user_id,
      title: data.title,
      message: data.message,
      is_read: false,
    })
    .select()
    .single();

  if (error) {
    throw Object.assign(new Error("Failed to create notification"), {
      statusCode: 500,
    });
  }

  return notification as Notification;
};

export const getNotifications = async (
  userId: string,
): Promise<Notification[]> => {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw Object.assign(new Error("Failed to fetch notifications"), {
      statusCode: 500,
    });
  }

  return (data ?? []) as Notification[];
};

export const markAsRead = async (id: string): Promise<Notification> => {
  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    throw Object.assign(new Error("Notification not found"), {
      statusCode: 404,
    });
  }

  return data as Notification;
};

export const deleteNotification = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id);

  if (error) {
    throw Object.assign(new Error("Failed to delete notification"), {
      statusCode: 500,
    });
  }
};
