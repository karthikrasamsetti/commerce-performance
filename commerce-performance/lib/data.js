// Managed by PerfAgent - regenerated on every export.
// Test-data helpers for tests you write by hand in this framework.
// k6 resolves open() paths from the test script, so read the file there and pass
// its text in:  const USERS = csvRows('users', open('./users.csv'));
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

// Parse simple CSV (a header row, comma-separated, no quoted commas) into objects.
export function csvRows(name, text) {
  return new SharedArray(name, function () {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
    const header = (lines.shift() || '').split(',').map((h) => h.trim());
    return lines.map((line) => {
      const cells = line.split(',');
      const row = {};
      header.forEach((key, i) => { row[key] = (cells[i] || '').trim(); });
      return row;
    });
  });
}

// Pick a row: 'random' (repeats possible), 'sequential' (file order, wraps) or
// 'unique' (each row once; the test stops when rows run out).
export function pickRow(rows, mode) {
  if (!rows.length) {
    exec.test.abort('The data file has no rows.');
  }
  const n = exec.scenario.iterationInTest;
  if (mode === 'sequential') {
    return rows[n % rows.length];
  }
  if (mode === 'unique') {
    if (n >= rows.length) {
      exec.test.abort(`Data file exhausted: all ${rows.length} rows were used once.`);
    }
    return rows[n];
  }
  return rows[Math.floor(Math.random() * rows.length)];
}
