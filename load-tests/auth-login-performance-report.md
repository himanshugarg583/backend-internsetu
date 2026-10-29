# Authentication API performance report

## Scope and safety

- Endpoint: `POST /api/v1/auth/login`
- Environment: authorized staging only
- Duration: 60 seconds, gradual arrival-rate ramp
- Target: approximately 20,000 total requests
- Credentials: one synthetic staging account supplied through environment variables
- No IP rotation, header spoofing, credential guessing, or rate-limit bypass
- The run aborts on failure rate >5%, HTTP 429 >1%, HTTP 5xx >1%, or a response over 2 seconds

This repository does not contain a measured staging run. This document is the
report template and the pre-run risk assessment; populate the measured fields
from `auth-login-summary.json` after an approved run.

## Results

| Metric | Result | Acceptance target |
|---|---:|---:|
| Requests started | _pending_ | <= 20,000 |
| Requests completed | _pending_ | report |
| HTTP success rate | _pending_ | >= 95% |
| HTTP 429 rate | _pending_ | < 1% |
| HTTP 5xx rate | _pending_ | < 1% |
| Failure rate | _pending_ | < 5% |
| p50 latency | _pending_ | report |
| p95 latency | _pending_ | < 2,000 ms |
| p99 latency | _pending_ | report |
| Safety abort | _pending_ | No |

## Known bottleneck before testing

The current backend applies `authLimiter` to `/api/v1/auth/login` with a
production limit of **30 requests per 15 minutes per client**. A 20,000-request
test therefore cannot represent successful login capacity under the current
policy: it is expected to produce HTTP 429 responses and abort at the configured
1% threshold. This is a protection signal, not a reason to bypass the limiter.

## Bottleneck diagnosis

After the run, correlate k6 timestamps with API logs and database metrics:

1. If 429s dominate, capacity is constrained by the configured authentication
   policy. Confirm the intended staging quota and test with an approved,
   documented policy change or a lower-volume scenario.
2. If p95/p99 latency rises while 5xx remains low, inspect Argon2 CPU and
   memory utilization, event-loop lag, and database connection-pool wait time.
3. If 5xx errors rise, group them by response code and server log correlation
   ID; check database saturation, dependency failures, and process restarts.
4. If latency is stable but k6 has high `http_req_failed`, verify TLS, DNS,
   load-generator capacity, and network error details before attributing the
   issue to the API.

## Remediation recommendations

- Keep the login limiter enabled; define a staging-specific quota only through
  an approved configuration change, with monitoring and rollback.
- Size the load generator and API instances so the generator is not the
  bottleneck; monitor CPU, memory, event-loop lag, database pool utilization,
  and request queueing.
- Measure Argon2 verification cost under representative concurrency and scale
  authentication workers horizontally if CPU saturation is confirmed.
- Add dashboards and alerts for p95/p99 login latency, 429/5xx rates, and
  database pool wait time.
- Repeat the test at a policy-compliant request rate after remediation, then
  run a separate, explicitly approved capacity test if the rate-limit policy
  itself must be evaluated.
