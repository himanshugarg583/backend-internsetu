import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate, Trend } from 'k6/metrics';

const baseUrl = (__ENV.K6_BASE_URL || '').replace(/\/+$/, '');
const email = __ENV.K6_TEST_EMAIL || '';
const password = __ENV.K6_TEST_PASSWORD || '';
const endpoint = `${baseUrl}/api/v1/auth/login`;
const maxRequests = Number(__ENV.K6_MAX_REQUESTS || 20000);
const abortFailureRate = Number(__ENV.K6_ABORT_FAILURE_RATE || 0.05);
const abort429Rate = Number(__ENV.K6_ABORT_429_RATE || 0.01);
const abort5xxRate = Number(__ENV.K6_ABORT_5XX_RATE || 0.01);
const abortLatencyMs = Number(__ENV.K6_ABORT_P95_MS || 2000);

if (!baseUrl || !/^https:\/\/staging([.-]|$)/i.test(baseUrl)) {
  throw new Error('K6_BASE_URL must be an explicit HTTPS staging URL (for example, https://staging-api.example.com)');
}
if (!email || !password) {
  throw new Error('Set K6_TEST_EMAIL and K6_TEST_PASSWORD to synthetic staging credentials');
}

export const options = {
  scenarios: {
    login_ramp: {
      executor: 'ramping-arrival-rate',
      startRate: 20,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 1000,
      stages: [
        { target: 100, duration: '10s' },
        { target: 300, duration: '15s' },
        { target: 600, duration: '20s' },
        { target: 167, duration: '15s' },
      ],
      gracefulStop: '5s',
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${abortLatencyMs}`],
    http_req_failed: [`rate<${abortFailureRate}`],
    login_failure_rate: [`rate<${abortFailureRate}`],
    login_429_rate: [`rate<${abort429Rate}`],
    login_5xx_rate: [`rate<${abort5xxRate}`],
    requests_started: [`count<=${maxRequests}`],
  },
  discardResponseBodies: false,
};

const loginLatency = new Trend('login_latency', true);
const loginFailureRate = new Rate('login_failure_rate');
const login429Rate = new Rate('login_429_rate');
const login5xxRate = new Rate('login_5xx_rate');
const requestsStarted = new Counter('requests_started');
let startedRequests = 0;
let completedRequests = 0;
let failureCount = 0;
let count429 = 0;
let count5xx = 0;
let stopped = false;

function abortIfUnsafe(status, duration) {
  if (stopped) return;

  const failureRate = failureCount / Math.max(completedRequests, 1);
  const rate429 = count429 / Math.max(completedRequests, 1);
  const rate5xx = count5xx / Math.max(completedRequests, 1);

  if (
    startedRequests >= maxRequests ||
    failureRate > abortFailureRate ||
    rate429 > abort429Rate ||
    rate5xx > abort5xxRate ||
    duration > abortLatencyMs
  ) {
    stopped = true;
    exec.test.abort(
      `Safety threshold exceeded: status=${status}, duration_ms=${duration}, ` +
        `failure_rate=${failureRate.toFixed(4)}, ` +
        `429_rate=${rate429.toFixed(4)}, 5xx_rate=${rate5xx.toFixed(4)}`,
    );
  }
}

export default function () {
  if (startedRequests >= maxRequests) return;

  startedRequests += 1;
  requestsStarted.add(1);
  const response = http.post(
    endpoint,
    JSON.stringify({ email, password }),
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      tags: { api: 'auth-login', environment: 'staging' },
    },
  );

  const isSuccess = check(response, {
    'login returns HTTP 200': (res) => res.status === 200,
    'login response is JSON': (res) => String(res.headers['Content-Type'] || '').includes('application/json'),
  });
  const is429 = response.status === 429;
  const is5xx = response.status >= 500 && response.status <= 599;

  completedRequests += 1;
  failureCount += Number(!isSuccess);
  count429 += Number(is429);
  count5xx += Number(is5xx);
  loginLatency.add(response.timings.duration);
  loginFailureRate.add(!isSuccess);
  login429Rate.add(is429);
  login5xxRate.add(is5xx);
  abortIfUnsafe(response.status, response.timings.duration);
}
