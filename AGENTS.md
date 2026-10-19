<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Quick Links
- **Live Dashboard**: https://tahaluf-dashboard.vercel.app
- **GitHub Repository**: https://github.com/anshulj017-source/Tahaluf-Dashboard
- **Local Development URL**: http://localhost:3000

## Mandatory Testing & Publishing Protocol
1. **Always Verify First**: Before making or finalizing any changes, ensure the automated test suite is run and passing:
   ```bash
   npm test
   ```
2. **Local Preview Only**: Develop and test locally at `http://localhost:3000`. NEVER push directly to `origin/main` or publish to live without explicit user review and approval.
3. **Pre-Publish Gate**: Before pushing any approved changes live, run:
   ```bash
   npm run prepublish-check
   ```
4. **Resilient Sheet Caching**: The sheet proxy in `app/api/sheets/route.js` maintains an in-memory 5-minute TTL cache with stale-while-revalidate fallback to ensure massive sheets (SMLC, BIO/CPHI) remain available with sub-50ms response times and zero data loss.
