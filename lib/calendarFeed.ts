import { supabase } from "./supabase";

// The calendar-feed edge function is fetched directly by calendar apps
// (Apple/Google Calendar "subscribe by URL"), not through the JS client, so
// it authorizes off this per-user token rather than a Supabase session.
export async function getOrCreateCalendarFeedUrl(userId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("calendar_feed_tokens")
    .select("token")
    .eq("user_id", userId)
    .maybeSingle();

  let token = existing?.token;

  if (!token) {
    const { data: created, error } = await supabase
      .from("calendar_feed_tokens")
      .insert({ user_id: userId })
      .select("token")
      .single();
    if (error || !created) throw new Error(error?.message || "Couldn't create calendar link.");
    token = created.token;
  }

  const base = (process.env.EXPO_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return `${base}/functions/v1/calendar-feed?token=${token}`;
}

export function toWebcalUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https?:\/\//, "webcal://");
}
