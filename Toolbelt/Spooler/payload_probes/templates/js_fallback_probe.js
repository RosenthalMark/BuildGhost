#!/usr/bin/env node

function asBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function asInt(name, fallback, min = 0, max = 100000) {
  const parsed = parseInt(process.env[name] || "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "user-agent": "spooler-js-fallback-probe/1.0" },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, detail: `http_status=${response.status} body=${text.slice(0, 160)}` };
    }
    return { ok: true, detail: `http_status=${response.status} body=${text.slice(0, 160)}` };
  } catch (err) {
    return { ok: false, detail: `error=${String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const cfg = {
    intent: process.env.INTENT || "unset",
    latency_ms: asInt("LATENCY_MS", 120),
    packet_loss_pct: asInt("PACKET_LOSS_PCT", 0, 0, 100),
    third_party_outage: asBool("THIRD_PARTY_OUTAGE"),
    chaos_mode: asBool("CHAOS_MODE"),
    strict_rate_limit: asBool("STRICT_RATE_LIMIT"),
    auth_bypass: asBool("AUTH_BYPASS"),
    auth_token_present: Boolean(process.env.AUTH_TOKEN && process.env.AUTH_TOKEN.trim()),
    third_party_endpoint: process.env.THIRD_PARTY_ENDPOINT || "http://third-party-sim:18080/third-party",
    max_attempts: asInt("PROBE_MAX_ATTEMPTS", 3, 1, 6),
  };

  console.log("SPOOLER JS FALLBACK PROBE START");
  console.log(JSON.stringify(cfg, null, 2));

  if (cfg.auth_bypass) {
    console.log("probe_result=FAIL reason=auth_bypass_enabled");
    process.exit(1);
  }

  let fallbackMode = cfg.auth_token_present ? "token-backed-cache" : "guest-cache";
  let fallbackPayload = {
    source: "local-fallback",
    mode: fallbackMode,
    note: "Used when upstream is unavailable or unstable.",
  };

  for (let attempt = 1; attempt <= cfg.max_attempts; attempt += 1) {
    const jitter = Math.floor(Math.random() * 51) - 20;
    const delayMs = Math.max(0, cfg.latency_ms + jitter);
    await sleep(Math.min(delayMs, 2500));
    console.log(`attempt=${attempt} delay_ms=${delayMs}`);

    const timeoutMs = Math.min(1500 + cfg.latency_ms, 6000);
    const endpoint = cfg.third_party_outage ? `${cfg.third_party_endpoint}?attempt=${attempt}` : cfg.third_party_endpoint;
    const result = await fetchWithTimeout(endpoint, timeoutMs);

    if (result.ok) {
      console.log(`probe_step=upstream_success detail=${result.detail}`);
      console.log("probe_result=PASS fallback_used=false");
      process.exit(0);
    }

    console.log(`probe_step=upstream_failure detail=${result.detail}`);
    if (attempt < cfg.max_attempts) {
      const backoff = Math.min(200 * 2 ** (attempt - 1), 2000);
      console.log(`retry_backoff_ms=${backoff}`);
      await sleep(backoff);
    }
  }

  if (cfg.strict_rate_limit && !cfg.auth_token_present) {
    console.log("probe_result=FAIL fallback_blocked=true reason=strict_rate_limit_without_token");
    process.exit(1);
  }

  console.log(`probe_step=fallback_activated payload=${JSON.stringify(fallbackPayload)}`);
  console.log("probe_result=PASS fallback_used=true");
  process.exit(0);
}

main();
