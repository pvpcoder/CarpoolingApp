// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const NY_TZ = "America/New_York";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DEFAULT_TIMES: Record<string, string> = {
  morning: "07:30:00",
  afternoon: "15:30:00",
  late_afternoon: "16:30:00",
};
const SLOT_LABEL: Record<string, string> = {
  morning: "To school",
  afternoon: "From school",
  late_afternoon: "Late pickup",
};

// Calendar apps fetch this URL directly on their own refresh cycle with no
// Supabase session, so this function is deployed with --no-verify-jwt and
// authorizes purely off the unguessable token in calendar_feed_tokens.

// Converts a wall-clock date+time in America/New_York to the equivalent UTC
// instant, correctly handling EST/EDT for that specific date.
function nyLocalToUtc(dateStr: string, timeStr: string): Date {
  const asIfUtc = new Date(`${dateStr}T${timeStr}Z`);
  const nyString = asIfUtc.toLocaleString("en-US", { timeZone: NY_TZ });
  const utcString = asIfUtc.toLocaleString("en-US", { timeZone: "UTC" });
  const diff = new Date(utcString).getTime() - new Date(nyString).getTime();
  return new Date(asIfUtc.getTime() + diff);
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split("T")[0];
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  // RFC 5545: lines over 75 octets should be folded with a leading space.
  if (line.length <= 75) return line;
  let out = "";
  let rest = line;
  while (rest.length > 75) {
    out += rest.slice(0, 75) + "\r\n ";
    rest = rest.slice(75);
  }
  return out + rest;
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response("Missing token", { status: 400 });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: tokenRow } = await admin
      .from("calendar_feed_tokens")
      .select("user_id")
      .eq("token", token)
      .maybeSingle();

    if (!tokenRow) {
      return new Response("Not found", { status: 404 });
    }
    const userId = tokenRow.user_id;

    const { data: student } = await admin.from("students").select("id, name").eq("id", userId).maybeSingle();
    let children: { id: string; name: string }[] = [];
    if (student) {
      children = [student];
    } else {
      const { data: links } = await admin
        .from("parent_student_links")
        .select("students ( id, name )")
        .eq("parent_id", userId);
      children = (links || []).map((l: any) => l.students).filter(Boolean);
    }

    const events: string[] = [];

    if (children.length > 0) {
      const { data: memberships } = await admin
        .from("group_members")
        .select("group_id, student_id")
        .in("student_id", children.map((c) => c.id))
        .eq("status", "active");

      const groupIds = [...new Set((memberships || []).map((m: any) => m.group_id))];

      if (groupIds.length > 0) {
        const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const { data: schedules } = await admin
          .from("weekly_schedules")
          .select("id, group_id, week_start_date")
          .in("group_id", groupIds)
          .gte("week_start_date", cutoff);

        const scheduleById: Record<string, any> = {};
        (schedules || []).forEach((s: any) => { scheduleById[s.id] = s; });
        const scheduleIds = (schedules || []).map((s: any) => s.id);

        const { data: groups } = await admin.from("carpool_groups").select("id, name").in("id", groupIds);
        const groupNameById: Record<string, string> = {};
        (groups || []).forEach((g: any) => { groupNameById[g.id] = g.name; });

        if (scheduleIds.length > 0) {
          const { data: slots } = await admin
            .from("schedule_slots")
            .select("id, schedule_id, day_of_week, slot_type, driver_parent_id, departure_time, status")
            .in("schedule_id", scheduleIds)
            .neq("status", "cancelled");

          const driverIds = [...new Set((slots || []).map((s: any) => s.driver_parent_id).filter(Boolean))];
          const driverNameById: Record<string, string> = {};
          if (driverIds.length > 0) {
            const { data: drivers } = await admin.from("parents").select("id, name").in("id", driverIds);
            (drivers || []).forEach((p: any) => { driverNameById[p.id] = p.name; });
          }

          for (const slot of slots || []) {
            const sched = scheduleById[slot.schedule_id];
            if (!sched) continue;
            const dayOffset = WEEKDAYS.indexOf(slot.day_of_week);
            if (dayOffset === -1) continue;

            const dateStr = addDays(sched.week_start_date, dayOffset);
            const timeStr = slot.departure_time || DEFAULT_TIMES[slot.slot_type] || "08:00:00";
            const start = nyLocalToUtc(dateStr, timeStr);
            const end = new Date(start.getTime() + 30 * 60 * 1000);

            const groupName = groupNameById[sched.group_id] || "Carpool";
            const label = SLOT_LABEL[slot.slot_type] || slot.slot_type;
            const driverName = slot.driver_parent_id ? driverNameById[slot.driver_parent_id] : null;
            const summary = driverName
              ? `\uD83D\uDE97 ${label} \u2014 ${driverName} driving`
              : `\uD83D\uDE97 ${label} \u2014 needs a driver`;

            events.push(
              [
                "BEGIN:VEVENT",
                foldLine(`UID:slot-${slot.id}@hopin.app`),
                `DTSTAMP:${icsDate(new Date())}`,
                `DTSTART:${icsDate(start)}`,
                `DTEND:${icsDate(end)}`,
                foldLine(`SUMMARY:${escapeText(summary)}`),
                foldLine(`DESCRIPTION:${escapeText(groupName)}`),
                "END:VEVENT",
              ].join("\r\n")
            );
          }
        }
      }
    }

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//HopIn//Carpool Schedule//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:HopIn Carpool",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
      ...events,
      "END:VCALENDAR",
    ].join("\r\n");

    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "inline; filename=hopin-carpool.ics",
      },
    });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
});
