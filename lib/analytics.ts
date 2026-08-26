import { supabase } from "./supabase";

// Fire-and-forget: analytics must never block or break the user-facing flow
// it's called from, so failures are swallowed rather than surfaced.
export function track(userId: string | null | undefined, eventName: string, properties: Record<string, any> = {}) {
  if (!userId) return;
  supabase.from("analytics_events").insert({ user_id: userId, event_name: eventName, properties }).then(
    () => {},
    () => {}
  );
}
