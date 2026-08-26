// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Deleting your own students/parents row from the client can never fully
// delete an account: several tables reference students(id)/parents(id)
// with no ON DELETE CASCADE (carpool_groups.created_by, group_invites,
// swap_requests, schedule_slots.driver_parent_id), so the final DELETE on
// students/parents just throws a foreign-key error the client never
// checked - and even when it succeeds, the auth.users row (the actual
// login credential) is something only the service role can remove.
// RLS also wouldn't let a client null out someone else's group's
// created_by or a schedule's driver anyway, so this has to run
// server-side with elevated privileges regardless.

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const userId = user.id;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: student } = await admin.from("students").select("id").eq("id", userId).maybeSingle();
    const { data: parent } = await admin.from("parents").select("id").eq("id", userId).maybeSingle();

    if (student) {
      // group_members/schedule_riders/student_exceptions/parent_student_links
      // all cascade automatically on students(id) delete. What doesn't:
      await admin.from("carpool_groups").update({ created_by: null }).eq("created_by", userId);
      await admin.from("group_invites").delete().or(`invited_by.eq.${userId},invited_student_id.eq.${userId}`);
      await admin.from("students").delete().eq("id", userId);
    }

    if (parent) {
      // parent_availability/vehicles/swap_volunteers/parent_student_links
      // all cascade automatically on parents(id) delete. What doesn't:
      await admin.from("group_members").update({ parent_id: null }).eq("parent_id", userId);
      await admin.from("schedule_slots").update({ driver_parent_id: null }).eq("driver_parent_id", userId);
      await admin.from("swap_requests").update({ requesting_parent_id: null }).eq("requesting_parent_id", userId);
      await admin.from("swap_requests").update({ covering_parent_id: null }).eq("covering_parent_id", userId);
      await admin.from("parents").delete().eq("id", userId);
    }

    // No FK on push_tokens.user_id, so it never blocks deletion - but it
    // needs explicit cleanup or a deleted user's device keeps getting pushes.
    await admin.from("push_tokens").delete().eq("user_id", userId);

    // api_usage_logs.user_id references auth.users(id) with no cascade -
    // anyone who ever generated a schedule has a row here, and it would
    // block deleteUser() below with a foreign-key violation.
    await admin.from("api_usage_logs").delete().eq("user_id", userId);

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
    if (authDeleteError) throw authDeleteError;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
