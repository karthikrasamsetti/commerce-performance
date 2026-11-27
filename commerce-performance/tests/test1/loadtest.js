// Exported by PerfAgent for CI/CD. Regenerate from PerfAgent rather than
// editing by hand, so the script stays in step with its approved plan.
// Auto-generated k6 script. Do not edit by hand - regenerate from the LoadModel.
//
// Target: https://dummyjson.com
// Profile: ramp | peak VUs: 10 | duration: 30s
//
// Run with:
//   k6 run loadtest.js
// Override the target at runtime:
//   k6 run -e BASE_URL=https://dummyjson.com loadtest.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';
const BASE_URL = __ENV.BASE_URL || "https://dummyjson.com";
const errorRate = new Rate('errors');
export const options = {
  scenarios: {
    browse_products: {
      executor: 'ramping-vus',
      exec: 'browseProducts',
      gracefulStop: '30s',
      startVUs: 0,
      stages: [
        { duration: '6s', target: 10 },
        { duration: '18s', target: 10 },
        { duration: '6s', target: 0 },
      ],
    },
  },
  thresholds: {
    'errors': ['rate<0.05'],
    'http_req_duration': ['p(95)<=500'],
  },
};

export function browseProducts() {
  group("browse products", function () {
    {
      const res = http.get(`${BASE_URL}/products`, { tags: { name: "view product list" } });
      const ok = check(res, { "view product list status ok": (r) => r.status >= 200 && r.status < 400 }, { perfagent_endpoint: "view product list" });
      errorRate.add(res.status >= 400 || !ok);
      if (res.status >= 400 || !ok) {
        console.error(`[FAIL][VU ${__VU}] ${"view product list"} — status ${res.status}`);
      }
    }
    sleep(Math.random() * 2.0 + 1.0);
  });
}
