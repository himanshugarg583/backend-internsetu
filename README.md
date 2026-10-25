# InternSetu Backend — Internship Module

Node.js · Express · TypeScript · PostgreSQL · Prisma. Strict MVC: `routes → middleware/validators → controllers (thin) → services (business logic) → models (Prisma queries)`.
Quizathon and Projectathon are intentionally **not** implemented.

## Setup

```bash
npm install
cp .env.example .env              # set DATABASE_URL and generate JWT secrets
docker compose up -d              # optional: Postgres on localhost:5433
npx prisma migrate deploy         # applies prisma/migrations (never resets data)
npm run seed                      # 12 sample domains, each with 1 joining task + 4 normal tasks
ADMIN_PASSWORD='<min 12 chars>' npm run admin:create -- --email admin@internsetu.in --name "Admin"
npm run dev                       # http://localhost:4000
```

PowerShell admin bootstrap: `$env:ADMIN_PASSWORD='...'; npm run admin:create -- --email admin@internsetu.in`

Other scripts: `npm run build`, `npm start`, `npm run typecheck`, `npm test` (uses database `internsetu_test`, override with `TEST_DATABASE_URL`).

## Docker

```bash
docker build -t internsetu-backend .
docker compose up -d --build      # postgres + backend on http://localhost:4000
```

The multi-stage `Dockerfile` (node 22 alpine) runs `prisma generate` + `tsc` in the build stage and, at start, `prisma migrate deploy` followed by `node dist/server.js`. The `backend` compose service reads `env_file: .env` and overrides `DATABASE_URL` to the compose `postgres` host; generated files persist in the `internsetu-storage` volume. `.dockerignore` excludes `node_modules`, `.env`, tests and generated storage.

## Database (10 tables)

`User`, `Otp`, `Domain`, `InternshipEnrollment`, `Task`, `TaskSubmission`, `OfferLetter`, `Payment`, `Certificate`, `PlatformSetting` (singleton row `id = 1`, admin-editable settings).
UUID PKs, FKs with restrict/cascade, enums, unique constraints, indexes, `DECIMAL(12,2)` money. The migration also creates the `intern_id_seq` sequence (collision-safe Intern IDs such as `ISX-2026-ENG-000001`) and a case-insensitive unique index on email.

## Storage

`STORAGE_ROOT` (default `./storage`) holds `offer-letters/`, `certificates/`, `receipts/`, `uploads/`, `templates/`. Directories are created on startup; only relative paths are stored in the DB; all paths are traversal-checked; files are only served through authenticated endpoints (no static serving). Generated files are git-ignored.

Templates are plain-text files in `storage/templates/` (`OFFER_LETTER_TEMPLATE`, `CERTIFICATE_TEMPLATE`) with placeholders `{{name}} {{domain}} {{duration}} {{start_date}} {{end_date}} {{unique_id}} {{intern_id}} {{issue_date}}`. If a template is missing the API returns `503 CONFIGURATION_ERROR`.

## Business rules

- Joining task unlocks after the offer letter is downloaded; other tasks unlock after the joining task is approved.
- Progress = approved active **non-joining** tasks / total active non-joining tasks.
- Certificate eligibility: progress ≥ `CERTIFICATE_MIN_PROGRESS` (50%) **and** today ≥ end date.
- Fee = `CERTIFICATE_BASE_FEE` + `GST_PERCENT`, computed server-side in paise.
- Certificates are issued from a signature-verified payment confirmation — the Razorpay webhook (`payment.captured` / `order.paid`) **or** the client checkout callback `POST /payments/verify` (HMAC-SHA256 of `order_id|payment_id` with `RAZORPAY_KEY_SECRET`) — or by an admin (`POST /admin/internships/:id/certificate`, requires a PAID payment and eligibility), idempotently (one certificate per payment, unique constraint). The DB row is created only after the PDF is stored. `payment.failed` marks FAILED; refunds mark REFUNDED and revoke the certificate.
- GitHub / LinkedIn links are validated by parsed `https` hostname.

## API (`/api/v1`)

Responses: `{ success: true, data }` or `{ success: false, error: { code, message, details? } }`. Auth: `Authorization: Bearer <accessToken>`; refresh token is returned in body and as an httpOnly cookie.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/otp/send`, `/auth/otp/verify`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/password/change` (authenticated, `{currentPassword,newPassword}`; revokes all sessions); `GET /auth/me` |
| Student | `PATCH /me`; `GET /domains`, `/domains/:slug`; `POST /internships/enroll` `{domainId,durationWeeks,startDate}`; `GET /internships/my`, `/internships/:id`, `/:id/tasks`, `/:id/progress`, `/:id/offer-letter` (PDF), `/:id/certificate/eligibility`; `POST /internships/:id/tasks/:taskId/submissions` `{githubUrl?,linkedinUrl?,notes?}`, `/internships/:id/certificate/payment-order`; `POST /payments/verify` `{razorpay_order_id,razorpay_payment_id,razorpay_signature}`; `GET /payments/my`, `/payments/:id`, `/payments/:id/receipt` (PDF, paid/refunded only), `/certificates/my`, `/certificates/:id/download` (PDF) |
| Public | `GET /certificates/verify/:uniqueId`; `POST /payments/webhook/razorpay` (header `X-Razorpay-Signature`) |
| Admin | `GET /admin/dashboard/stats`; users: `GET/POST /admin/users` (create student), `/admin/users/:id`, `PATCH /admin/users/:id/status`; domains: `GET/POST /admin/domains`, `GET/PATCH /admin/domains/:id`, `PATCH /admin/domains/:id/status`, `GET/POST /admin/domains/:id/tasks`; tasks: `GET /admin/tasks` (`domainId`, `type=joining|domain`, `isActive`), `PATCH /admin/tasks/:id`, `/admin/tasks/:id/status`; `GET /admin/internships`, `/admin/internships/:id`, `POST /admin/internships/:id/certificate`; submissions: `GET /admin/task-submissions`, `/:id`, `POST /:id/approve`, `/:id/reject` `{remarks}`; payments: `GET /admin/payments`, `/:id`, `POST /:id/refund` `{reason}`; certificates: `GET /admin/certificates`, `/:id`, `POST /:id/revoke` `{reason}`; reports: `GET /admin/reports/payments`, `/admin/reports/registrations`, `/admin/reports/overview`, `/admin/reports/domain-enrollments`, `/admin/reports/internship-status`, `/admin/reports/task-completion` (+`domainId`), `/admin/reports/certificates`, `/admin/reports/payment-status` `?from=YYYY-MM-DD&to=&groupBy=day|month`; `GET /admin/activity?limit=20` (=100); settings: `GET/PATCH /admin/settings` `{platformName,supportEmail,supportPhone,notifications:{emailOnRegistration,emailOnSubmissionReview,emailOnPayment,emailOnCertificate,adminDigest}}` (fees/GST returned read-only from env) |

List endpoints accept `page`, `limit` (≤100), `search` plus filters, and `sortBy`/`sortOrder=asc|desc` (whitelisted fields):
- `/admin/users`: `status`, `domainId`, `enrollmentStatus=ACTIVE|COMPLETED|CANCELLED|NONE`; sort `createdAt|name|email`
- `/admin/internships`: `domainId`, `status`, `from`/`to` (createdAt); sort `createdAt|startDate|endDate|internId|status`
- `/admin/task-submissions`: `status`, `domainId`, `from`/`to` (submittedAt); sort `submittedAt|reviewedAt|createdAt|status`
- `/admin/payments`: `status`, `from`/`to` (createdAt); sort `createdAt|paidAt|totalAmount|status`
- `/admin/certificates`: `status`, `domainId`; sort `createdAt|issueDate|verificationId`
- `/admin/tasks`: sort `createdAt|sequence|title`

## External credentials still required

- **SMTP** (`SMTP_HOST`, …): used for OTP emails and payment receipts; without it emails are not delivered (a warning is logged). Sender = `SMTP_FROM`, else `SMTP_BACKUP_FROM`, else `SMTP_USER`.
- **Razorpay** (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`): order creation returns `503` until key id/secret are set. `RAZORPAY_WEBHOOK_SECRET` is optional: when empty the webhook returns `503` and payments are confirmed via `POST /payments/verify`. Configure the webhook URL `https://<host>/api/v1/payments/webhook/razorpay` with events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`. Gateway calls were tested only with mocks/HMAC-signed payloads, not against live Razorpay.
