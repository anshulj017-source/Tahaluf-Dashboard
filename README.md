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

The repository includes a comprehensive 94-check test suite (`tests/dashboard.test.mjs`) that verifies:
- Mathematical parsing & zero-division safety (CTR, CPM, CPC, CPA).
- Event name and portfolio normalizations (P1 vs P3, SMLC 26, BIO 26, CPHI 26, etc.).
- Dynamic countdown week calculations (`W20 '26` down to `W0 '26`).
- Connectivity and row volume for all 12 sheet endpoints.
- In-memory caching resilience and latency (<200ms).

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
