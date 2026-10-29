# Authentication load test

This test is intentionally scoped to an authorized staging environment. It uses
one synthetic, pre-created credential and does not rotate IPs, spoof headers, or
otherwise bypass rate limiting.

## Prerequisites

- Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/).
- Obtain written approval for the staging test window.
- Create a synthetic staging user and verify that login succeeds at low volume.
- Use a staging hostname; the script rejects non-HTTPS and non-staging URLs.

## Run

PowerShell:

```powershell
$env:K6_BASE_URL='https://staging-api.example.com'
$env:K6_TEST_EMAIL='loadtest-user@example.test'
$env:K6_TEST_PASSWORD='use-a-staging-only-secret'
k6 run --summary-export=auth-login-summary.json .\load-tests\auth-login.js
```

The default ramp targets approximately 20,000 requests over 60 seconds. It
automatically aborts when any of these safety limits is crossed:

- failure rate above 5%
- HTTP 429 rate above 1%
- HTTP 5xx rate above 1%
- any individual response above 2 seconds
- more than 20,000 started requests

Override limits only with an explicit staging test approval:
`K6_ABORT_FAILURE_RATE`, `K6_ABORT_429_RATE`, `K6_ABORT_5XX_RATE`,
`K6_ABORT_P95_MS`, and `K6_MAX_REQUESTS`.

The default backend configuration currently limits login to 30 requests per
15-minute window per client. Do not change the test to evade that policy. If
the test aborts on 429s, record that as a rate-limit capacity result and use
the remediation recommendations in `auth-login-performance-report.md`.
