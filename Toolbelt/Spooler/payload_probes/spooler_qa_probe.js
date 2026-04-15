#!/usr/bin/env node

function asBool(name, fallback = false) {
  const v = process.env[name];
  if (v == null) return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function asInt(name, fallback) {
  const v = parseInt(process.env[name] || "", 10);
  return Number.isNaN(v) ? fallback : v;
}

function bounded(n) {
  return Math.max(0, Math.min(n, 0.98));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const cfg = {
    intent: process.env.INTENT || "unset",
    network_profile: process.env.NETWORK_PROFILE || "unknown",
    latency_ms: asInt("LATENCY_MS", 120),
    packet_loss_pct: asInt("PACKET_LOSS_PCT", 0),
    cpu_budget: process.env.CPU_BUDGET || "2",
    memory_budget: process.env.MEMORY_BUDGET || "1g",
    db_engine: process.env.DB_ENGINE || "sqlite",
    chaos_mode: asBool("CHAOS_MODE"),
    auth_bypass: asBool("AUTH_BYPASS"),
    third_party_outage: asBool("THIRD_PARTY_OUTAGE"),
    strict_rate_limit: asBool("STRICT_RATE_LIMIT"),
  };

  console.log("SPOOLER QA PROBE START");
  console.log(JSON.stringify(cfg, null, 2));

  let pFail = cfg.packet_loss_pct / 100;
  if (cfg.chaos_mode) pFail += 0.15;
  if (cfg.third_party_outage) pFail += 0.2;
  if (cfg.auth_bypass) pFail += 0.1;
  if (cfg.strict_rate_limit) pFail += 0.05;
  pFail = bounded(pFail);

  const attempts = 5;
  const baseBackoffMs = 200;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const jitter = Math.floor(Math.random() * 51) - 25;
    const latency = Math.max(0, cfg.latency_ms + jitter);
    await sleep(Math.min(latency, 1000));

    const roll = Math.random();
    console.log(
      `attempt=${attempt} latency_ms=${latency} failure_probability=${pFail.toFixed(2)} roll=${roll.toFixed(2)}`
    );

    if (roll >= pFail) {
      console.log("probe_result=PASS simulated_dependency_call=SUCCESS");
      process.exit(0);
    }

    console.log("probe_result=RETRY simulated_dependency_call=FAILED");
    if (attempt < attempts) {
      const wait = baseBackoffMs * 2 ** (attempt - 1);
      console.log(`retry_backoff_ms=${wait}`);
      await sleep(wait);
    }
  }

  console.log("probe_result=FAIL exhausted_retries=true");
  process.exit(1);
}

main();
