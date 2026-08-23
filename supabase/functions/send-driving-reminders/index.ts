// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const NY_TZ = "America/New_York";

// Reminders are entirely server-side/cron-triggered (no user session — the
// app might not even be open), which is the only reliable way to remind
// someone about a driving duty they could otherwise just forget about.

function nyParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    weekday: parts.weekday as string, // "Mon".."Sun"
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
  };
}

function dateKey(p: { year: number; month: number; day: number }) {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// Monday of the week containing the given NY calendar date, as YYYY-MM-DD.
function mondayOf(p: { year: number; month: number; day: number; weekday: string }) {
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  const asUtcNoon = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
  asUtcNoon.setUTCDate(asUtcNoon.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return asUtcNoon.toISOString().split("T")[0];
}

function getSlotLabel(type: string) {
  switch (type) {
    case "morning": return "to school";
    case "afternoon": return "from school";
    case "late_afternoon": return "for a late pickup";
    default: return type;
  }
}

function formatTime(timeStr: string) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

async function sendPush(admin: any, parentIds: string[], title: string, body: string, data: Record<string, any>) {
  if (parentIds.length === 0) return;
  const { data: tokens } = await admin.from("push_tokens").select("token").in("user_id", parentIds);
  if (!tokens || tokens.length === 0) return;
  const messages = tokens.map((t: any) => ({ to: t.token, sound: "default", title, body, data }));
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  }).catch(() => {});
}

serve(async () => {
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();
    const today = nyParts(now);
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrow = nyParts(tomorrowDate);

    let eveningSent = 0;
    let sameDaySent = 0;

    // Evening-before reminder: fires anytime during the 18:00 NY hour,
    // guarded by evening_reminder_sent_at so repeated 15-min cron ticks
    // within that hour only send once per slot.
    if (today.hour === 18 && DAYS.includes(tomorrow.weekday)) {
      const weekStart = mondayOf(tomorrow);
      // weekly_schedules is per-group, so iterate all groups' schedules for that week.
      const { data: schedules } = await admin
        .from("weekly_schedules")
        .select("id, group_id")
        .eq("week_start_date", weekStart);

      for (const sched of schedules || []) {
        const { data: slots } = await admin
          .from("schedule_slots")
          .select("id, slot_type, driver_parent_id, departure_time, status")
          .eq("schedule_id", sched.id)
          .eq("day_of_week", tomorrow.weekday)
          .not("driver_parent_id", "is", null)
          .in("status", ["confirmed", "swapped"])
          .is("evening_reminder_sent_at", null);

        for (const slot of slots || []) {
          await sendPush(
            admin,
            [slot.driver_parent_id],
            "Driving tomorrow",
            `You're driving ${getSlotLabel(slot.slot_type)} tomorrow at ${formatTime(slot.departure_time)}.`,
            { type: "reminder", groupId: sched.group_id }
          );
          await admin.from("schedule_slots").update({ evening_reminder_sent_at: new Date().toISOString() }).eq("id", slot.id);
          eveningSent++;
        }
      }
    }

    // Same-day reminder: fires 25-65 minutes before departure_time (a
    // window wide enough to guarantee at least one 15-min cron tick lands
    // inside it), guarded by same_day_reminder_sent_at.
    if (DAYS.includes(today.weekday)) {
      const weekStart = mondayOf(today);
      const { data: schedules } = await admin
        .from("weekly_schedules")
        .select("id, group_id")
        .eq("week_start_date", weekStart);

      const nowMinutes = today.hour * 60 + today.minute;

      for (const sched of schedules || []) {
        const { data: slots } = await admin
          .from("schedule_slots")
          .select("id, slot_type, driver_parent_id, departure_time, status")
          .eq("schedule_id", sched.id)
          .eq("day_of_week", today.weekday)
          .not("driver_parent_id", "is", null)
          .in("status", ["confirmed", "swapped"])
          .is("same_day_reminder_sent_at", null);

        for (const slot of slots || []) {
          if (!slot.departure_time) continue;
          const [dh, dm] = slot.departure_time.split(":").map(Number);
          const departureMinutes = dh * 60 + dm;
          const minutesUntil = departureMinutes - nowMinutes;
          if (minutesUntil < 25 || minutesUntil > 65) continue;

          await sendPush(
            admin,
            [slot.driver_parent_id],
            "Driving today",
            `Reminder: you're driving ${getSlotLabel(slot.slot_type)} today at ${formatTime(slot.departure_time)}.`,
            { type: "reminder", groupId: sched.group_id }
          );
          await admin.from("schedule_slots").update({ same_day_reminder_sent_at: new Date().toISOString() }).eq("id", slot.id);
          sameDaySent++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, eveningSent, sameDaySent }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
