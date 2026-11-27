"""Standalone POSIX k6 wrapper copied into exported frameworks. Standard library only."""

import bisect
import json
import math
import os
from pathlib import Path
import queue
import random
import subprocess
import sys
import threading
import time
from urllib import request
from urllib.parse import urlsplit


class Durations:
    """Uniform reservoir keeps percentile memory bounded throughout long tests."""

    def __init__(self):
        self.count = 0
        self.total = 0.0
        self.values = []
        self.random = random.Random(119)

    def add(self, value):
        self.count += 1
        self.total += value
        if len(self.values) < 2048:
            bisect.insort(self.values, value)
        else:
            index = self.random.randrange(self.count)
            if index < len(self.values):
                # Replace a uniform member independently of its sorted position.
                self.values.pop(index)
                bisect.insort(self.values, value)

    def p95(self):
        if not self.values:
            return None
        position = .95 * (len(self.values) - 1)
        low = int(position)
        high = min(low + 1, len(self.values) - 1)
        return round(self.values[low] + (self.values[high] - self.values[low]) * (position - low), 4)


def label(value):
    if isinstance(value, str) and 0 < len(value) <= 128 and value.isprintable() and not any(
        marker in value for marker in ("://", "?", "#", "@")
    ):
        return value
    return None


class Evidence:
    def __init__(self):
        self.started = time.monotonic()
        self.requests = self.failed = self.drops = 0
        self.vus = None
        self.durations = Durations()
        self.endpoints = {}
        self.checks = {}
        self.samples = []
        self.interval = 5
        self.omitted_labels = False

    def add(self, point):
        if point.get("type") != "Point":
            return
        metric, data = point.get("metric"), point.get("data") or {}
        value = data.get("value")
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 2**53:
            return
        tags = data.get("tags") or {}
        if metric == "http_reqs":
            self.requests += int(value)
        elif metric == "http_req_failed":
            self.failed += int(value)
        elif metric == "http_req_duration":
            self.durations.add(value)
        elif metric == "vus":
            self.vus = int(value)
        elif metric == "dropped_iterations":
            self.drops += int(value)
        elif metric == "checks":
            check = label(tags.get("check"))
            if check and (check in self.checks or len(self.checks) < 128):
                counts = self.checks.setdefault(check, {"passed": 0, "failed": 0})
                counts["passed" if value else "failed"] += 1
            else:
                self.omitted_labels = True
        if metric not in {"http_req_duration", "http_req_failed", "checks"}:
            return
        endpoint = label(tags.get("perfagent_endpoint") if metric == "checks" else tags.get("name"))
        if not endpoint or endpoint not in self.endpoints and len(self.endpoints) >= 64:
            self.omitted_labels = True
            return
        item = self.endpoints.setdefault(endpoint, {"durations": Durations(), "failed": 0, "checks_failed": None})
        if metric == "http_req_duration":
            item["durations"].add(value)
        elif metric == "http_req_failed":
            item["failed"] += int(value)
        else:
            item["checks_failed"] = (item["checks_failed"] or 0) + int(not value)

    def sample(self):
        elapsed = max(.001, time.monotonic() - self.started)
        return {"t": round(elapsed, 3), "rps": round(self.requests / elapsed, 4),
                "p95": self.durations.p95(), "err": round(min(1, self.failed / self.requests) * 100, 4) if self.requests else None,
                "active_vus": self.vus, "dropped_iterations": self.drops}

    def record(self, sample):
        if len(self.samples) >= 120:
            self.samples = self.samples[::2]
            self.interval *= 2
        self.samples.append(sample)

    def finish(self):
        self.record(self.sample())
        endpoints = []
        for name, item in self.endpoints.items():
            d = item["durations"]
            if d.count:
                endpoints.append({"name": name, "requests": d.count, "failed": item["failed"],
                                  "checks_failed": item["checks_failed"], "p95_ms": d.p95(),
                                  "avg_ms": round(d.total / d.count, 4), "retained": len(d.values)})
        return {"version": 1, "samples": self.samples, "per_endpoint": endpoints, "omitted_labels": self.omitted_labels,
                "sampled_percentiles": self.durations.count > len(self.durations.values),
                "checks": [{"name": name, **counts, "total": sum(counts.values())} for name, counts in self.checks.items()]}


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def telemetry_sender(url, token, pipeline_url, test, environment, pending):
    opener = request.build_opener(NoRedirect())
    while True:
        sample = pending.get()
        payload = json.dumps({"pipeline_url": pipeline_url, "test": test, "environment": environment, "sample": sample}).encode()
        try:
            with opener.open(request.Request(url, data=payload, headers={"Authorization": "Bearer " + token,
                             "Content-Type": "application/json"}), timeout=2):
                pass
        except OSError:
            # A telemetry outage must never change k6 execution or its exit status.
            pass


def main():
    test, environment = sys.argv[1:3]
    output = Path("results") / (test + "-summary.json")
    env = os.environ.copy()
    url = env.pop("PERFAGENT_TELEMETRY_URL", "")
    token = env.pop("PERFAGENT_TELEMETRY_TOKEN", "")
    pipeline = env.get("CI_RUN_URL", "")
    pending = queue.Queue(maxsize=1)
    if url and token and pipeline and urlsplit(url).scheme == "https":
        threading.Thread(target=telemetry_sender, args=(url, token, pipeline, test, environment, pending), daemon=True).start()
    evidence = Evidence()
    # k6 writes JSON points to stdout. stderr remains attached to the pipeline log.
    process = subprocess.Popen(["k6", "run", "--quiet", "--out", "json", "--summary-trend-stats",
                                "avg,min,med,max,p(90),p(95),p(99)", "--summary-export", str(output),
                                f"tests/{test}/loadtest.js"], env=env, stdout=subprocess.PIPE)
    with process.stdout as stream:
        next_sample = evidence.started + 1
        for line in stream:
            try:
                evidence.add(json.loads(line))
            except (ValueError, AttributeError, TypeError):
                continue
            now = time.monotonic()
            if now >= next_sample:
                sample = evidence.sample()
                evidence.record(sample)
                try:
                    pending.put_nowait(sample)
                except queue.Full:
                    pass
                next_sample = now + evidence.interval
        status = process.wait()
    if output.is_file():
        summary = json.loads(output.read_bytes())
        summary["perfagent_evidence"] = evidence.finish()
        temp = output.with_suffix(".tmp")
        temp.write_text(json.dumps(summary, allow_nan=False))
        temp.replace(output)
    return status


if __name__ == "__main__":
    sys.exit(main())
