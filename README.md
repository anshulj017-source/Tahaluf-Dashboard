# Tahaluf Dashboard

## Quick Links
- **Live Dashboard**: [https://tahaluf-dashboard.vercel.app](https://tahaluf-dashboard.vercel.app)
- **GitHub Repository**: [anshulj017-source/Tahaluf-Dashboard](https://github.com/anshulj017-source/Tahaluf-Dashboard)
- **Local Dev**: [http://localhost:3000](http://localhost:3000)

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Automated Testing & Validation

Dashboard startup requests `/api/admin/events?configOnly=true` to retrieve event
definitions without waiting for admin health checks, sheet hydration, or version
history. The full admin endpoint retains those diagnostics for admin views.

The repository includes an automated test suite (`tests/dashboard.test.mjs`) that verifies:
- Mathematical parsing & zero-division safety (CTR, CPM, CPC, CPA).
- Event name and portfolio normalizations (P1 vs P3, SMLC 26, BIO 26, CPHI 26, etc.).
- Dynamic countdown week calculations (`W20 '26` down to `W0 '26`).
- Connectivity and row volume for all 12 sheet endpoints.
- Sheet connectivity, last-known-good cache behavior, and cache latency (<200ms).

On Vercel, successfully fetched sheet snapshots are stored in Firestore in size-limited chunks and sub-8 MiB write batches. A new snapshot becomes active only after all chunks have been stored; the current and previous snapshots are retained, and failed refreshes continue serving the last successful snapshot. The existing Firebase Admin service account therefore needs Firestore read/write access. The Admin panel's **Health Monitor** tab groups source checks under one event, verifies event-tagged actual rows, reports available date ranges, suggests fixes, and supports manual sheet refreshes.

Health notifications can be configured in **Admin → Health Monitor → Health Notifications**. Admins can enable in-dashboard alerts, enable email, choose immediate, daily, or both, and manage recipients. Immediate email is sent once per newly detected issue (with retry throttling); issues are detected as sheet data is requested. A scheduled full sheet check and daily digest run at 08:00 UTC (approximately noon Gulf Standard Time). Vercel Hobby schedules are once daily and may run up to about 59 minutes later; higher-frequency scheduled monitoring requires a plan that supports more frequent Cron Jobs.

Configure these server-side environment variables for SMTP email and the scheduled job:
- `SMTP_HOST`: SMTP server hostname (`smtp.gmail.com` for Gmail).
- `SMTP_PORT`: SMTP server port (`587` for STARTTLS).
- `SMTP_USER`: mailbox used to authenticate.
- `SMTP_PASS`: App Password for that mailbox (not the normal account password).
- `HEALTH_ALERT_FROM`: sender address matching the authenticated account.
- `CRON_SECRET`: random secret used to authorize `/api/cron/health-check`.

Set them in `.env.local` for local email testing and in the Vercel project environment for deployment. Quote `SMTP_PASS` in `.env.local`; do not commit or share the app password. Revoke and replace any app password that has been exposed. The notification settings are stored in Firestore on Vercel and in `config/healthNotifications.json` locally.

To run the test suite:
```bash
npm test
```

### API monitoring and feature controls

**Admin → API & Quotas Hub** includes usage analytics for internal analytics,
GA4, Vercel, Firestore, published Sheets feeds, SMTP, Firebase Auth and TikTok.
Counters describe the instrumented operations listed on each card, **not**
provider-wide quotas or invoices. GA4 is currently sheet-fed, not a direct Data
API integration. Vercel usage is only counted on Vercel, never from local
development. Actual provider spend remains explicitly unavailable until a
provider billing integration is connected; no sample usage figures are shown.

Admins can configure a monthly USD budget, included usage allowance, base cost,
and rate per 1,000 observed units for each service. These produce **estimates**,
not vendor invoices or enforcement limits. For providers with multiple billing
dimensions (especially Firestore reads/writes and Vercel compute/bandwidth), a
single blended rate is only an approximation. Forecasts use up to seven completed
UTC collection days, excluding the partial first day and current day. No history
is invented before collection begins. Daily counters retain 93 calendar dates;
the chart displays the last 14. Monitoring storage itself incurs Firestore
reads/writes on Vercel and is excluded from observed application operations.
Monitoring write errors are logged and surfaced as incomplete telemetry on the
current instance; instrumented business requests continue to function.
Usage recording registers persistence with Vercel's `waitUntil` request lifetime
and does not wait for telemetry database transactions before returning sheet
data, authentication results, or analytics responses. Local Node processes run
the same persistence promises without a Vercel lifetime extension.
Concurrent observations on a warm instance share a serialized batch rather than
opening competing transactions for every sample. Every sample retains its
observation date and metric; there is no timed buffer or intentional sampling.
Batch failures are logged and counted as incomplete telemetry. This reduces
contention and transaction overhead during bursts, but is not a project-wide
quota cap and does not reduce isolated observations to zero writes.

Health Monitor fetches and polls only while its admin section is active; periodic
requests also stop when the browser document is hidden. Reopening the section
reloads its health and notification settings. Notification transactions skip
writes when an issue is unchanged or there is nothing to resolve; alert retry,
opening, status changes, and resolution history remain enabled.
Analytics heartbeats run every two minutes while visible (previously every 25
seconds); tab changes and page-hide/exit dwell flushes remain enabled. Continuous
visible use generates 30 rather than 144 heartbeat requests per hour (~79% fewer).
Live dwell reporting can lag by two minutes, and abrupt browser termination can
lose the unsent interval. Per-event analytics persistence remains unchanged.
The Analytics admin panel automatically refreshes every 30 seconds while visible
(previously six seconds), reducing periodic requests from 600 to 120 per hour.
Manual refresh and filter changes still fetch immediately.

On Vercel, feature configuration and API budget reads are cached for 60 seconds
per warm server instance, with concurrent reads sharing one fetch. Successful
and failed saves invalidate the same-instance cache; other instances see changes
after their cache expires. Failed reads are not cached or replaced with stale
defaults. Returned settings are copied so callers cannot mutate the cache.
Live usage counters and authorization/role checks are never served from this
cache. Local file-backed settings remain uncached.
Provider-wide usage must still be monitored in Firebase; these changes alone do
not guarantee remaining below its free tier.

Routine Health Monitor requests use `?inspectOnly=true`: they inspect metadata,
reuse it for up to 60 seconds per warm instance, and do not load configuration
history, fetch missing CSVs, or write recovery snapshots. Explicit sheet refresh
and the existing recovery paths remain available.

Browsers supporting Web Locks elect one visible dashboard tab to report dwell
heartbeats. Other tabs still report actual interactions; ownership is retried
on visibility changes and heartbeat ticks. Browsers without Web Locks retain
per-tab tracking. This measures foreground dashboard dwell rather than summing
simultaneously visible windows.

API monitoring includes an optional persistent low-quota mode. It pauses
automatic Analytics, Health Monitor, and API Hub refreshes and periodic dwell
heartbeats; initial loads, manual refreshes, filter changes, tab/exit dwell
flushes, real interactions, and essential dashboard/authentication/settings
operations remain enabled. Policy propagation uses the visible client's
60-second settings refresh and the server's 60-second cache, so other tabs and
instances may take up to about two minutes to reflect a change. It is not a
Firestore hard spending limit.

Usage history is collected when instrumented traffic occurs, not by an
autonomous scheduled job. Review the daily trends over several complete days
and compare them with Firebase Console project-wide usage before concluding
that the project is below quota. UTC observation days do not match Firestore's
midnight-Pacific free-quota reset. Uninstrumented clients, failed telemetry,
and serverless termination can leave gaps; no zero-usage day proves zero
provider activity.

Usage observations within one instrumented request (including nested handlers
and awaited work) share a single persistence flush instead of generating a
transaction per observation. Successful usage-storage transactions count their
own document reads, retries, and write without recursively recording themselves.
Failed transactions and other uninstrumented operations remain coverage gaps.

The API Hub's **APIs used by Tahaluf** selector persists a shared monitoring
allowlist. Existing installations start with all services selected; admins can
select only the integrations they use, or none. Deselected services are excluded
from cards, health probes (including manual/all-service pings), and new persisted
usage samples. Previously recorded history and budget settings are retained.
This controls monitoring, not the underlying integrations, authentication,
analytics persistence, or sheet recovery. Other warm instances may take up to
60 seconds to observe a saved selection. Settings, authentication and shared
monitoring storage still use Firebase; hiding unused providers alone does not
eliminate those operations or guarantee a particular quota reduction.

Each API has independent **70%** and **90%** threshold selections, both enabled
by default. **Save alert selections** persists them for dashboard warnings and
quota emails. Only selected/monitored APIs are evaluated. Monthly markers use
configured allowances or estimated spend budgets; unknown/unconnected limits
are not invented. Firestore also uses its clearly labeled UTC-day read, write,
and delete references. Observed usage and forecasts can trigger a marker.

Quota emails reuse Health Monitor recipients and its global email-enabled
switch, but are immediate threshold notifications, independent of sheet-alert
delay/digest settings. Checks run after recorded usage is persisted and on
monitoring refreshes, with Vercel request-lifetime registration, not a scheduler.
No traffic means no check; partial telemetry is not authoritative provider
quota monitoring. Local development uses the same logic; automated tests mock
SMTP and do not send real quota emails.

Email claims are stored in `appConfig/quotaAlerts` on Vercel (ignored local
configuration otherwise). Delivery is deduplicated per API, metric, threshold,
and UTC daily/monthly period. Multiple reached markers may share one email.
No threshold breach means no notification-state reads or writes. Unchanged
claims skip writes; warm instances suppress repeated checks for five minutes.
SMTP/configuration failures are logged and surfaced in API monitoring, with
retry eligibility after five minutes on subsequent activity. SMTP acceptance
does not guarantee inbox delivery. A crash or persistence failure after sending
but before recording success can cause a later duplicate; this is not
exactly-once email delivery. Delivery state retains approximately 35 days,
and notification-state operations are not included in observed usage totals.

Analytics persistence applies events to the shared Firestore state inside a
transaction rather than overwriting it with an instance-local snapshot.
Concurrent work is drained immediately in batches of at most 100 events and
registered with Vercel's request lifetime; there is no delayed timer or durable
queue. Events for the same user in a batch share one user-document write.
Client retries reuse an event identifier; the shared summary retains the last
500 identifiers for deduplication (older retries may count again). Admin reads
hydrate persisted analytics; this adds reads in exchange for cross-instance
consistency. Failed event batches are retried once, logged, and surfaced as
incomplete persistence, not guaranteed delivery. Fresh persisted stores start
with measured zero counts; existing historical values are preserved and are
not retroactively certified as accurate.

**Admin → Feature Controls** organizes views, presentation tools, exports,
currency switching and the admin health banner. Each has **Everyone**, **Admin
only**, or **Disabled** visibility, with administrator/viewer draft previews.
TV auto-cycle also requires TV mode and only visits enabled views. Export
visibility covers CSV and chart-image buttons across dashboard views, but never
admin configuration backups. Existing non-finance permissions remain in effect.
At least one dashboard view must remain public. Admin Center and administrative
configuration access cannot be disabled, preventing accidental lockout.
Feature visibility is a UX control, not a replacement for API authorization.

Saved changes apply immediately to the editing dashboard. Other open dashboards
refresh settings every 60 seconds and on window focus. Concurrent feature saves
are rejected with a conflict; reload before retrying.
On Vercel, settings and usage persist in Firestore `appConfig` documents
`dashboardFeatures`, `apiUsage`, and `apiBudgets`. Locally they persist in
corresponding ignored JSON files under `config/`, surviving server restarts
without committing local configuration or telemetry. Failed settings saves are
reported rather than falling back to non-persistent memory.

`npm test` runs deterministic feature, forecast, budget and persistence tests
before the existing dashboard suite. Live sheet/API checks require the local
server at `http://localhost:3000`, working upstream sheets and the appropriate
local authentication setup.

To run both the test suite and a production build verification:
```bash
npm run prepublish-check
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The pre-push hook mirrors published source commits to the private backup
repository. Environment files are never copied or force-added to that backup.
Keep deployment secrets in Vercel environment settings or a secrets manager.
If an older backup included environment files, rotate the affected credentials;
removing them from the current snapshot does not remove Git history.

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
