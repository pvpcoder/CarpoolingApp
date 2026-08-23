// @ts-nocheck
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Pricing for google/gemini-2.5-flash via OpenRouter (USD per token)
const INPUT_COST_PER_TOKEN = 0.30 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 2.50 / 1_000_000;

const MODEL = "google/gemini-2.5-flash";

// Generating a schedule is a rare, deliberate action (a parent tapping one
// button), not something that should ever legitimately happen this often —
// this only exists to stop a runaway client retry loop or a scripted abuse
// from burning through the OpenRouter budget.
const RATE_LIMIT_MAX_CALLS = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

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
    const { prompt } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "No prompt provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: { message: "Not authenticated" } }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentCalls } = await supabaseAdmin
      .from("api_usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("function_name", "generate-schedule")
      .eq("user_id", user.id)
      .gte("created_at", windowStart);

    if ((recentCalls ?? 0) >= RATE_LIMIT_MAX_CALLS) {
      return new Response(JSON.stringify({ error: { message: "You're generating schedules too quickly. Please wait a minute and try again." } }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://carpoolapp.app",
        "X-Title": "CarpoolingApp",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    // Log token usage and cost to Supabase
    if (data.usage) {
      const inputTokens = data.usage.prompt_tokens ?? 0;
      const outputTokens = data.usage.completion_tokens ?? 0;
      const inputCost = inputTokens * INPUT_COST_PER_TOKEN;
      const outputCost = outputTokens * OUTPUT_COST_PER_TOKEN;

      await supabaseAdmin.from("api_usage_logs").insert({
        function_name: "generate-schedule",
        model: data.model ?? MODEL,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        input_cost_usd: inputCost,
        output_cost_usd: outputCost,
        total_cost_usd: inputCost + outputCost,
        user_id: user.id,
      });
    }

    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
