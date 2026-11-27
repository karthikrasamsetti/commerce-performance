// Exported by PerfAgent for CI/CD. Regenerate from PerfAgent rather than
// editing by hand, so the script stays in step with its approved plan.
// Auto-generated k6 script. Do not edit by hand - regenerate from the LoadModel.
//
// Target: https://dummyjson.com
// Profile: ramp | peak VUs: 50 | duration: 60s
//
// Run with:
//   k6 run loadtest.js
// Override the target at runtime:
//   k6 run -e BASE_URL=https://dummyjson.com loadtest.js
// Change how long one request may take (default 60s):
//   k6 run -e REQUEST_TIMEOUT=30s loadtest.js
// At the end, k6 prints a short summary and writes summary.json
// (choose another file with -e PERFAGENT_SUMMARY_FILE=name.json, or "off").

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Framework settings: budgets and load tiers from config/<PERF_ENV>.json, tier from
// PERF_TIER (smoke or load). Without a config file the approved plan applies as is.
import { applyFrameworkConfig, environmentName, parseConfig } from '../../lib/config.js';

const PERF_ENV = environmentName();
let PERF_CONFIG_TEXT = null;
try {
  PERF_CONFIG_TEXT = open(`../../config/${PERF_ENV}.json`);
} catch (e) {
  PERF_CONFIG_TEXT = null;
}
const PERF_CONFIG = parseConfig(PERF_CONFIG_TEXT, PERF_ENV);
const BASE_URL = __ENV.BASE_URL || "https://dummyjson.com";
const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || '60s';
const errorRate = new Rate('errors');
// Time to complete one journey, without think time.
const journeyDuration = new Trend('journey_duration', true);

function perfagentThink(spread, min) {
  const seconds = Math.random() * spread + min;
  sleep(seconds);
  return seconds * 1000;
}
export const options = {
  maxRedirects: 0,
  scenarios: {
    browse_products: {
      executor: 'constant-arrival-rate',
      rate: 3,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 50,
      exec: 'browseProducts',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<=500'],
    'http_reqs': ['count>=180'],
    'dropped_iterations': ['count<1'],
    "journey_duration{journey:Browse Products}": [],
  },
};

export function browseProducts() {
  const journeyStart = Date.now();
  let thinkMs = 0;
  group("Browse Products", function () {
    {
      const res = http.get(`${BASE_URL}/products`, { tags: { name: "view products" }, timeout: REQUEST_TIMEOUT });
      const ok = check(res, { "view products status ok": (r) => r.status >= 200 && r.status < 400 }, { perfagent_endpoint: "view products" });
      errorRate.add(res.status >= 400 || !ok, { name: "view products" });
      if (res.status >= 400 || !ok) {
        console.error(`[FAIL][VU ${__VU}] ${"view products"} — status ${res.status}`);
      }
    }
  });
  journeyDuration.add(Date.now() - journeyStart - thinkMs, { journey: "Browse Products" });
}

function perfagentNumber(value, unit) {
  if (typeof value !== 'number' || !isFinite(value)) return 'n/a';
  return (Math.round(value * 100) / 100) + (unit || '');
}

function perfagentTextSummary(data) {
  const metrics = data.metrics || {};
  const values = (name) => (metrics[name] && metrics[name].values) || {};
  const lines = ['', 'PerfAgent summary'];
  const reqs = values('http_reqs');
  lines.push('  Requests:        ' + perfagentNumber(reqs.count) + ' (' + perfagentNumber(reqs.rate, '/s') + ')');
  const latency = values('http_req_duration');
  lines.push('  Response time:   avg ' + perfagentNumber(latency.avg, ' ms') + ', p95 ' +
    perfagentNumber(latency['p(95)'], ' ms') + ', max ' + perfagentNumber(latency.max, ' ms'));
  if (metrics.errors) lines.push('  Failed requests: ' + perfagentNumber(values('errors').rate * 100, '%'));
  if (metrics.checks) lines.push('  Checks passed:   ' + perfagentNumber(values('checks').rate * 100, '%'));
  // Per-journey entries look like journey_duration(journey:NAME) with curly braces.
  const journeys = Object.keys(metrics).filter((name) =>
    name.indexOf('journey_duration') === 0 && name.indexOf('journey:') > 0).sort();
  if (journeys.length) lines.push('  Journeys (without think time):');
  for (const name of journeys) {
    const v = values(name);
    lines.push('    ' + name.slice(name.indexOf('journey:') + 'journey:'.length, -1) + ': avg ' +
      perfagentNumber(v.avg, ' ms') + ', p95 ' + perfagentNumber(v['p(95)'], ' ms'));
  }
  const rules = [];
  for (const name of Object.keys(metrics).sort()) {
    const thresholds = metrics[name].thresholds || {};
    for (const rule of Object.keys(thresholds)) {
      rules.push('    ' + (thresholds[rule].ok ? 'PASS ' : 'FAIL ') + name + ' ' + rule);
    }
  }
  if (rules.length) lines.push('  Pass rules:', ...rules);
  return lines.join('\n') + '\n\n';
}

export function handleSummary(data) {
  const output = { stdout: perfagentTextSummary(data) };
  const file = __ENV.PERFAGENT_SUMMARY_FILE || 'summary.json';
  if (file !== 'off') output[file] = JSON.stringify(data, null, 2);
  return output;
}

// Apply config/<PERF_ENV>.json budgets and the PERF_TIER load settings.
applyFrameworkConfig(options, PERF_CONFIG);
