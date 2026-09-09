import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Sends a push to the driver a job was just handed to.
 *
 * Called only by the `jobs_notify_driver` database trigger, which proves itself
 * with a shared secret in `x-webhook-secret`. JWT verification is deliberately
 * off: the caller is Postgres, which has no user session to present. The secret
 * is 256 bits of randomness held in a schema PostgREST does not expose, and is
 * checked by `verify_push_secret` so it never travels back out of the database.
 *
 * Deploy with:
 *   supabase functions deploy notify-driver --no-verify-jwt
 */

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

type Event = "assigned" | "cancelled";

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

function money(value: number | null | undefined): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function compose(event: Event, job: Record<string, unknown>) {
  const address = String(job.address ?? "a delivery");
  const products = Number(job.product_count ?? 0);
  const cash = Number(job.cash_to_collect ?? 0);

  if (event === "cancelled") {
    return {
      title: "Job cancelled",
      body: `${address} has been called off. Don't head there.`,
    };
  }

  const parts = [`${products} ${products === 1 ? "item" : "items"}`];
  if (cash > 0) parts.push(`${money(cash)} to collect`);

  return {
    title: "New delivery for you",
    body: `${address} — ${parts.join(", ")}`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return json({ error: "Not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- authenticate the caller -------------------------------------------
  const presented = req.headers.get("x-webhook-secret") ?? "";
  if (!presented) return json({ error: "Unauthorized" }, 401);

  const { data: secretOk, error: secretError } = await supabase.rpc(
    "verify_push_secret",
    { p_secret: presented },
  );
  if (secretError) {
    console.error("secret check failed", secretError.message);
    return json({ error: "Unauthorized" }, 401);
  }
  if (secretOk !== true) return json({ error: "Unauthorized" }, 401);

  // --- what happened -------------------------------------------------------
  let payload: { job_id?: string; event?: Event };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Expected a JSON body" }, 400);
  }

  const jobId = payload.job_id;
  const event: Event = payload.event === "cancelled" ? "cancelled" : "assigned";
  if (!jobId) return json({ error: "Missing job_id" }, 400);

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, address, product_count, cash_to_collect, driver_id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) {
    console.error("job lookup failed", jobError.message);
    return json({ error: "Lookup failed" }, 500);
  }
  if (!job) return json({ skipped: "job no longer exists" });
  if (!job.driver_id) return json({ skipped: "job has no driver" });

  const { data: tokenRows, error: tokenError } = await supabase
    .from("device_tokens")
    .select("expo_token")
    .eq("profile_id", job.driver_id);

  if (tokenError) {
    console.error("token lookup failed", tokenError.message);
    return json({ error: "Lookup failed" }, 500);
  }

  const tokens = (tokenRows ?? []).map((row) => row.expo_token as string);
  if (tokens.length === 0) {
    return json({ skipped: "driver has no registered device" });
  }

  // --- send ----------------------------------------------------------------
  const { title, body } = compose(event, job);

  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    sound: "default",
    // A job going out is time-critical; ask both platforms to wake the handset.
    priority: "high",
    channelId: "jobs",
    data: { jobId: job.id, event },
  }));

  let tickets: ExpoTicket[] = [];
  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("expo rejected the batch", response.status, text);
      return json({ error: "Push service rejected the batch" }, 502);
    }

    const result = await response.json();
    tickets = Array.isArray(result?.data) ? result.data : [];
  } catch (err) {
    console.error("expo request failed", err);
    return json({ error: "Push service unreachable" }, 502);
  }

  // --- forget handsets that no longer exist --------------------------------
  const dead = tickets
    .map((ticket, index) => ({ ticket, token: tokens[index] }))
    .filter(({ ticket }) =>
      ticket?.status === "error" &&
      ticket.details?.error === "DeviceNotRegistered"
    )
    .map(({ token }) => token)
    .filter((token): token is string => Boolean(token));

  if (dead.length > 0) {
    const { error: pruneError } = await supabase.rpc("prune_device_tokens", {
      p_tokens: dead,
    });
    if (pruneError) console.error("prune failed", pruneError.message);
  }

  const sent = tickets.filter((ticket) => ticket?.status === "ok").length;
  const failed = tickets.filter((ticket) => ticket?.status === "error");
  if (failed.length > 0) {
    console.error("some pushes failed", JSON.stringify(failed));
  }

  return json({ event, sent, failed: failed.length, pruned: dead.length });
});
