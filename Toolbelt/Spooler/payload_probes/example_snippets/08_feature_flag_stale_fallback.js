#!/usr/bin/env node
/**
 * SPOOLER Example: Feature Flag Fetcher with Stale Fallback
 * ----------------------------------------------------------
 * Scenario fit: Third-Party Timeout Cascade, Offline-First Failover, 3G Degraded
 *
 * Simulates a feature flag SDK that fetches flag configs from a remote service
 * and caches them locally. When the remote is unavailable or slow, the SDK must
 * fall back to a stale cache without blowing up. If no cache exists and the
 * fetch fails, the SDK must return safe defaults — not throw, not silently
 * return undefined, not default everything to "enabled". Tests the offline-first
 * resilience pattern that most feature flag systems claim but few actually test.
 */

"use strict";

function envBool(name, fallback = false) {
  const v = process.env[name];
  if (v == null) return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function envInt(name, fallback) {
  const v = parseInt(process.env[name] || "", 10);
  return Number.isNaN(v) ? fallback : v;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FLAG_DEFINITIONS = {
  "dark-mode": { default: false, description: "UI dark mode toggle" },
  "new-auth-flow": { default: false, description: "New authentication flow" },
  "rate-limit-v2": { default: true, description: "Rate limiter v2 enforcement" },
  "ml-scoring": { default: false, description: "ML-based risk scoring" },
  "strict-csp": { default: true, description: "Content Security Policy strict mode" },
};

const REMOTE_FLAG_VALUES = {
  "dark-mode": true,
  "new-auth-flow": true,
  "rate-limit-v2": true,
  "ml-scoring": false,
  "strict-csp": true,
};

let staleCache = null;
let staleCacheAgeMs = 0;
const STALE_THRESHOLD_MS = 30000;

async function fetchRemoteFlags(latencyMs, outageMode, packetLossPct) {
  const jitter = Math.floor(Math.random() * 60) - 20;
  const effectiveLatency = Math.max(0, latencyMs + jitter);
  await sleep(effectiveLatency);

  if (outageMode) {
    const mode = Math.random() < 0.7 ? "hard_down" : "timeout";
    throw new Error(`remote_flags_${mode} latency_ms=${effectiveLatency}`);
  }

  const roll = Math.random();
  if (roll < packetLossPct / 100) {
    throw new Error(`remote_flags_packet_drop roll=${roll.toFixed(2)}`);
  }

  return { ...REMOTE_FLAG_VALUES, _fetched_at: Date.now() };
}

function getFlag(flags, name) {
  if (flags && Object.prototype.hasOwnProperty.call(flags, name)) {
    return { value: flags[name], source: flags._source || "remote" };
  }
  const def = FLAG_DEFINITIONS[name];
  return { value: def ? def.default : false, source: "safe_default" };
}

async function resolveFlagSet(latencyMs, outageMode, packetLossPct, chaosMode) {
  try {
    const remote = await fetchRemoteFlags(latencyMs, outageMode, packetLossPct);
    staleCache = { ...remote, _source: "remote" };
    staleCacheAgeMs = Date.now();
    console.log(`flag_source=remote flags_fetched=${Object.keys(remote).length}`);
    return staleCache;
  } catch (err) {
    console.log(`remote_fetch_failed error="${err.message}"`);

    if (staleCache && Date.now() - staleCacheAgeMs < STALE_THRESHOLD_MS) {
      const ageS = ((Date.now() - staleCacheAgeMs) / 1000).toFixed(1);
      console.log(`flag_source=stale_cache age_s=${ageS}`);
      return { ...staleCache, _source: "stale" };
    }

    if (staleCache) {
      const ageS = ((Date.now() - staleCacheAgeMs) / 1000).toFixed(1);
      console.log(`flag_source=stale_cache_expired age_s=${ageS} using_safe_defaults=true`);
    } else {
      console.log("flag_source=safe_defaults no_cache_available=true");
    }

    const defaults = Object.fromEntries(
      Object.entries(FLAG_DEFINITIONS).map(([k, v]) => [k, v.default])
    );
    return { ...defaults, _source: "safe_default" };
  }
}

async function main() {
  const latencyMs = envInt("LATENCY_MS", 120);
  const thirdPartyOutage = envBool("THIRD_PARTY_OUTAGE");
  const chaosMode = envBool("CHAOS_MODE");
  const packetLossPct = envInt("PACKET_LOSS_PCT", 0);

  console.log("FEATURE FLAG STALE FALLBACK PROBE START");
  console.log(`latency_ms=${latencyMs}`);
  console.log(`third_party_outage=${thirdPartyOutage}`);
  console.log(`chaos_mode=${chaosMode}`);
  console.log(`packet_loss_pct=${packetLossPct}`);

  let undefinedReturns = 0;
  let unsafeSecurityFlags = 0;
  const CRITICAL_FLAGS = ["rate-limit-v2", "strict-csp"];

  for (let round = 1; round <= 4; round++) {
    console.log(`\nround=${round}`);
    const flags = await resolveFlagSet(latencyMs, thirdPartyOutage, packetLossPct, chaosMode);

    for (const flagName of Object.keys(FLAG_DEFINITIONS)) {
      const { value, source } = getFlag(flags, flagName);

      if (value === undefined || value === null) {
        undefinedReturns++;
        console.log(`flag=${flagName} value=UNDEFINED source=${source} ERROR=true`);
        continue;
      }

      if (CRITICAL_FLAGS.includes(flagName) && source === "safe_default" && value === false) {
        unsafeSecurityFlags++;
        console.log(`flag=${flagName} value=${value} source=${source} SECURITY_RISK=safe_default_disabled_security_control`);
      } else {
        console.log(`flag=${flagName} value=${value} source=${source}`);
      }
    }

    if (chaosMode) staleCache = null;
    await sleep(200);
  }

  const probePass = undefinedReturns === 0 && unsafeSecurityFlags === 0;
  console.log(`\nprobe_result=${probePass ? "PASS" : "FAIL"}`);
  console.log(`undefined_returns=${undefinedReturns}`);
  console.log(`unsafe_security_flag_states=${unsafeSecurityFlags}`);
  process.exit(probePass ? 0 : 1);
}

main().catch((err) => {
  console.error(`fatal_error=${err.message}`);
  process.exit(1);
});
