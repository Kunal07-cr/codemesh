import type { RequestHandler } from "express";

type RequestSample = {
  method: string;
  route: string;
  status: number;
  durationMs: number;
  at: number;
};

export class MetricsRegistry {
  private readonly startedAt = Date.now();
  private readonly samples: RequestSample[] = [];
  private activeRequests = 0;
  private jobsStarted = 0;
  private jobsSucceeded = 0;
  private jobsFailed = 0;

  middleware(): RequestHandler {
    return (req, res, next) => {
      const started = performance.now();
      this.activeRequests += 1;
      res.once("finish", () => {
        this.activeRequests = Math.max(0, this.activeRequests - 1);
        const route = req.route?.path
          ? `${req.baseUrl}${String(req.route.path)}`
          : normalizePath(req.path);
        this.samples.push({
          method: req.method,
          route,
          status: res.statusCode,
          durationMs: performance.now() - started,
          at: Date.now()
        });
        if (this.samples.length > 2_000) this.samples.splice(0, this.samples.length - 2_000);
      });
      next();
    };
  }

  recordJob(result: "started" | "succeeded" | "failed") {
    if (result === "started") this.jobsStarted += 1;
    if (result === "succeeded") this.jobsSucceeded += 1;
    if (result === "failed") this.jobsFailed += 1;
  }

  snapshot(windowMinutes = 15) {
    const cutoff = Date.now() - windowMinutes * 60_000;
    const recent = this.samples.filter((sample) => sample.at >= cutoff);
    const durations = recent.map((sample) => sample.durationMs).sort((a, b) => a - b);
    const failures = recent.filter((sample) => sample.status >= 500).length;
    const successful = recent.filter((sample) => sample.status < 500).length;
    const total = recent.length;
    return {
      windowMinutes,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      activeRequests: this.activeRequests,
      requests: total,
      availability: total === 0 ? 1 : successful / total,
      errorRate: total === 0 ? 0 : failures / total,
      latencyMs: {
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        p99: percentile(durations, 0.99)
      },
      jobs: {
        started: this.jobsStarted,
        succeeded: this.jobsSucceeded,
        failed: this.jobsFailed
      }
    };
  }

  prometheus() {
    const snapshot = this.snapshot();
    const statusCounts = new Map<string, number>();
    for (const sample of this.samples) {
      const family = `${Math.floor(sample.status / 100)}xx`;
      const key = JSON.stringify([sample.method, sample.route, family]);
      statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
    }
    const lines = [
      "# HELP codemesh_uptime_seconds Process uptime in seconds.",
      "# TYPE codemesh_uptime_seconds gauge",
      `codemesh_uptime_seconds ${snapshot.uptimeSeconds}`,
      "# HELP codemesh_active_requests Requests currently being served.",
      "# TYPE codemesh_active_requests gauge",
      `codemesh_active_requests ${snapshot.activeRequests}`,
      "# HELP codemesh_http_request_duration_milliseconds Recent HTTP request latency.",
      "# TYPE codemesh_http_request_duration_milliseconds gauge",
      `codemesh_http_request_duration_milliseconds{quantile=\"0.50\"} ${snapshot.latencyMs.p50}`,
      `codemesh_http_request_duration_milliseconds{quantile=\"0.95\"} ${snapshot.latencyMs.p95}`,
      `codemesh_http_request_duration_milliseconds{quantile=\"0.99\"} ${snapshot.latencyMs.p99}`,
      "# HELP codemesh_jobs_total Background operation outcomes.",
      "# TYPE codemesh_jobs_total counter",
      `codemesh_jobs_total{status=\"started\"} ${snapshot.jobs.started}`,
      `codemesh_jobs_total{status=\"succeeded\"} ${snapshot.jobs.succeeded}`,
      `codemesh_jobs_total{status=\"failed\"} ${snapshot.jobs.failed}`
    ];
    for (const [key, value] of statusCounts) {
      const [method, route, status] = JSON.parse(key) as [string, string, string];
      lines.push(`codemesh_http_requests_total{method=\"${escapeLabel(method)}\",route=\"${escapeLabel(route)}\",status=\"${status}\"} ${value}`);
    }
    return `${lines.join("\n")}\n`;
  }
}

function percentile(values: number[], quantile: number) {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * quantile) - 1));
  return Math.round(values[index]! * 100) / 100;
}

function normalizePath(value: string) {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
    .replace(/\/projects\/[^/]+/g, "/projects/:projectId");
}

function escapeLabel(value = "") {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
