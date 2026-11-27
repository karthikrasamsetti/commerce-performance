// Managed by PerfAgent - regenerated on every export.
// Small HTTP helpers for tests you write by hand in this framework.
import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || '';

// Read a JSON field such as 'data.items[0].id'; undefined when it is missing.
export function field(res, path) {
  try {
    return res.json(path.replace(/\[(\d+)\]/g, '.$1'));
  } catch (e) {
    return undefined;
  }
}

// Send a JSON request. `name` groups the request in results, like generated tests do.
export function jsonRequest(method, path, body, name, headers) {
  const params = {
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    tags: { name: name || path },
  };
  const payload = body === undefined || body === null ? null : JSON.stringify(body);
  return http.request(method, `${BASE_URL}${path}`, payload, params);
}

// Check the status code; any 2xx or 3xx passes unless `expected` is given.
export function expectStatus(res, name, expected) {
  const label = expected === undefined ? `${name} status ok` : `${name} status ${expected}`;
  return check(res, {
    [label]: (r) => (expected === undefined ? r.status >= 200 && r.status < 400 : r.status === expected),
  });
}
