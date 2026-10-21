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

The repository includes an automated test suite (`tests/dashboard.test.mjs`) that verifies:
- Mathematical parsing & zero-division safety (CTR, CPM, CPC, CPA).
- Event name and portfolio normalizations (P1 vs P3, SMLC 26, BIO 26, CPHI 26, etc.).
- Dynamic countdown week calculations (`W20 '26` down to `W0 '26`).
- Connectivity and row volume for all 12 sheet endpoints.
- Sheet connectivity, last-known-good cache behavior, and cache latency (<200ms).

On Vercel, successfully fetched sheet snapshots are stored in Firestore in size-limited chunks. A new snapshot becomes active only after all chunks have been stored; the current and previous snapshots are retained, and failed refreshes continue serving the last successful snapshot. The existing Firebase Admin service account therefore needs Firestore read/write access. The Admin panel's **Health Monitor** tab groups source checks under one event, verifies event-tagged actual rows, reports available date ranges, suggests fixes, and supports manual sheet refreshes.

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

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
