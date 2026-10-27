/**
 * Formats responsive, brand-aligned HTML and plain-text emails for Tahaluf Dashboard health monitoring.
 */

const BRAND_DARK = '#031120';
const CARD_BG = '#071d33';
const ACCENT_LIME = '#cedc28';
const ACCENT_CYAN = '#14a6d9';
const BORDER_COLOR = '#193b5c';
const TEXT_MUTED = '#94a3b8';
const TEXT_LIGHT = '#f1f5f9';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function baseEmailWrapper({ title, badgeText, badgeColor, badgeBg, badgeBorder, contentHtml, dashboardUrl }) {
  const url = dashboardUrl || 'https://tahaluf-dashboard.vercel.app';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND_DARK}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${TEXT_LIGHT};">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${BRAND_DARK}; min-height: 100vh; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 620px; background-color: ${CARD_BG}; border: 1px solid ${BORDER_COLOR}; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 28px; background: linear-gradient(135deg, #051829 0%, #0a2540 100%); border-bottom: 1px solid ${BORDER_COLOR};">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left">
                    <span style="font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: ${ACCENT_LIME};">TAHALUF DASHBOARD</span>
                    <div style="font-size: 18px; font-weight: 700; color: #ffffff; margin-top: 4px;">Health &amp; Data Monitor</div>
                  </td>
                  <td align="right" valign="top">
                    <span style="display: inline-block; padding: 5px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: ${badgeColor}; background-color: ${badgeBg}; border: 1px solid ${badgeBorder}; border-radius: 9999px;">
                      ${escapeHtml(badgeText)}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 28px;">
              ${contentHtml}

              <!-- CTA Button -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 28px;">
                <tr>
                  <td align="center">
                    <a href="${url}" target="_blank" style="display: inline-block; padding: 12px 28px; background-color: ${ACCENT_LIME}; color: #021214; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 10px; letter-spacing: 0.5px; text-transform: uppercase; box-shadow: 0 4px 12px rgba(206, 220, 40, 0.3);">
                      Open Health Monitor
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 28px; background-color: #031322; border-top: 1px solid ${BORDER_COLOR}; text-align: center; font-size: 11px; color: ${TEXT_MUTED}; line-height: 1.6;">
              This is an automated notification from the Tahaluf Marketing Dashboard.<br>
              Server: <a href="${url}" style="color: ${ACCENT_CYAN}; text-decoration: none;">${escapeHtml(url.replace(/^https?:\/\//, ''))}</a> · Continuous Data Integrity System
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Builds HTML and plain text for an active health alert email.
 */
export function formatHealthAlertEmail(issue, dashboardUrl) {
  const isDiscrepancy = issue.status === 'metric-discrepancy' || Boolean(issue.discrepancies?.length);
  const subject = `⚠️ [ALERT] Data Health Issue: ${issue.eventName} (${issue.kind})${issue.category ? ` [${issue.category}]` : ''}`;

  const statusLabel = issue.category === 'dimensions' ? 'Dimension Standards Check' : isDiscrepancy
    ? '24h Metric Regression Discrepancy'
    : issue.status.toUpperCase();

  const discrepancies = issue.discrepancies || [];
  const dimensionFindings = issue.dimensionFindings || [];
  const dimensionHtml = dimensionFindings.length ? `
    <h3 style="color: ${ACCENT_LIME}; font-size: 13px;">Dimension Standards Findings</h3>
    <ul style="font-size: 12px; line-height: 1.6;">${dimensionFindings.map(finding => `<li>
      <strong>${escapeHtml(finding.label)}</strong>: ${escapeHtml(finding.type)} -
      ${escapeHtml(finding.count)} rows. Values: ${escapeHtml(finding.values.join(', ') || '(blank / missing)')}.
      CSV records: ${escapeHtml(finding.sampleRows.join(', '))}${finding.sheetWide ? ' (unmatched event in shared sheet)' : ''}.
    </li>`).join('')}</ul>` : '';

  let discrepancyTableHtml = '';
  if (discrepancies.length > 0) {
    const rows = discrepancies.map(d => {
      const prev = d.metric === 'cost' ? `$${Number(d.previousValue).toFixed(2)}` : Number(d.previousValue).toLocaleString();
      const curr = d.metric === 'cost' ? `$${Number(d.currentValue).toFixed(2)}` : Number(d.currentValue).toLocaleString();
      return `
        <tr style="border-bottom: 1px solid ${BORDER_COLOR};">
          <td style="padding: 10px 12px; font-weight: 600; color: #ffffff;">${escapeHtml(d.channel)}</td>
          <td style="padding: 10px 12px; font-family: monospace; text-transform: uppercase; color: ${ACCENT_CYAN};">${escapeHtml(d.metric)}</td>
          <td style="padding: 10px 12px; color: ${TEXT_MUTED}; text-decoration: line-through;">${escapeHtml(prev)}</td>
          <td style="padding: 10px 12px; font-weight: 700; color: #f87171;">${escapeHtml(curr)}</td>
          <td style="padding: 10px 12px; font-family: monospace; font-weight: 700; color: #ef4444;">-${escapeHtml(d.dropPercent)}%</td>
        </tr>
      `;
    }).join('');

    discrepancyTableHtml = `
      <div style="margin-top: 20px;">
        <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: ${ACCENT_LIME}; margin-bottom: 8px;">
          Detected Metric Regressions (Last 24h Period)
        </div>
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #041424; border: 1px solid ${BORDER_COLOR}; border-radius: 8px; font-size: 12px; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid ${BORDER_COLOR}; background-color: #061c32; text-align: left; color: ${TEXT_MUTED}; font-size: 11px; text-transform: uppercase;">
              <th style="padding: 8px 12px;">Channel</th>
              <th style="padding: 8px 12px;">Metric</th>
              <th style="padding: 8px 12px;">Previous</th>
              <th style="padding: 8px 12px;">Current</th>
              <th style="padding: 8px 12px;">Regression</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  const contentHtml = `
    <div style="font-size: 16px; font-weight: 700; color: #f87171; margin-bottom: 12px;">
      Attention Required: Data Feed Issue Detected
    </div>
    <p style="font-size: 13px; color: ${TEXT_MUTED}; margin: 0 0 20px 0; line-height: 1.5;">
      The automated health monitor has detected an issue with the data feed for <strong style="color: #ffffff;">${escapeHtml(issue.eventName)}</strong>. The feed has failed integrity checks or experienced an unexpected metric drop.
    </p>

    <!-- Details Card -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #041424; border: 1px solid ${BORDER_COLOR}; border-radius: 10px; font-size: 13px; margin-bottom: 16px;">
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; width: 140px; color: ${TEXT_MUTED}; font-weight: 600;">Event Name</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; color: #ffffff; font-weight: 700;">${escapeHtml(issue.eventName)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; color: ${TEXT_MUTED}; font-weight: 600;">Source Feed</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; color: #ffffff;">${escapeHtml(issue.kind)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; color: ${TEXT_MUTED}; font-weight: 600;">Issue Status</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; color: #f87171; font-weight: 700;">${escapeHtml(statusLabel)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; color: ${TEXT_MUTED}; font-weight: 600; vertical-align: top;">Description</td>
        <td style="padding: 12px 16px; color: #e2e8f0; line-height: 1.5;">${escapeHtml(issue.message)}</td>
      </tr>
    </table>

    ${discrepancyTableHtml}
    ${dimensionHtml}
  `;

  const html = baseEmailWrapper({
    title: subject,
    badgeText: 'Health Alert',
    badgeColor: '#f87171',
    badgeBg: 'rgba(239, 68, 68, 0.15)',
    badgeBorder: 'rgba(239, 68, 68, 0.4)',
    contentHtml,
    dashboardUrl
  });

  const plainText = [
    `TAHALUF DASHBOARD - HEALTH ALERT`,
    `================================`,
    `Event: ${issue.eventName}`,
    `Source: ${issue.kind}`,
    `Status: ${statusLabel}`,
    `Description: ${issue.message}`,
    '',
    discrepancies.length > 0 ? 'REGRESSION BREAKDOWN:' : '',
    ...discrepancies.map(d => ` - ${d.channel} [${d.metric}]: ${d.previousValue} -> ${d.currentValue} (-${d.dropPercent}%)`),
    ...dimensionFindings.map(finding => ` - ${finding.label}: ${finding.type}, ${finding.count} rows; values ${finding.values.join(', ') || '(blank / missing)'}; CSV records ${finding.sampleRows.join(', ')}`),
    '',
    `Review issue in Admin Health Monitor: ${dashboardUrl || 'https://tahaluf-dashboard.vercel.app'}`
  ].filter(Boolean).join('\n');

  return { subject, text: plainText, html };
}

/**
 * Builds HTML and plain text for an issue resolution email.
 */
export function formatHealthResolvedEmail(issue, resolvedAt, dashboardUrl) {
  const subject = `✅ [RESOLVED] Data Health Recovered: ${issue.eventName} (${issue.kind})${issue.category ? ` [${issue.category}]` : ''}`;
  const resolvedTimeStr = resolvedAt ? new Date(resolvedAt).toUTCString() : new Date().toUTCString();

  const contentHtml = `
    <div style="font-size: 16px; font-weight: 700; color: #4ade80; margin-bottom: 12px;">
      Issue Resolved: Data Feed Back to Healthy
    </div>
    <p style="font-size: 13px; color: ${TEXT_MUTED}; margin: 0 0 20px 0; line-height: 1.5;">
      The previously reported ${escapeHtml(issue.category || 'feed')} issue affecting <strong style="color: #ffffff;">${escapeHtml(issue.eventName)}</strong> is no longer active under the current checks. Other issue categories may still require attention; review Health Monitor for the full status.
    </p>

    <!-- Details Card -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #041424; border: 1px solid ${BORDER_COLOR}; border-radius: 10px; font-size: 13px; margin-bottom: 16px;">
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; width: 140px; color: ${TEXT_MUTED}; font-weight: 600;">Event Name</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; color: #ffffff; font-weight: 700;">${escapeHtml(issue.eventName)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; color: ${TEXT_MUTED}; font-weight: 600;">Source Feed</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; color: #ffffff;">${escapeHtml(issue.kind)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; color: ${TEXT_MUTED}; font-weight: 600;">Previous Status</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; color: #f87171;">${escapeHtml(issue.status)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; color: ${TEXT_MUTED}; font-weight: 600;">Resolved At</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BORDER_COLOR}; color: #4ade80; font-weight: 700;">${escapeHtml(resolvedTimeStr)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; color: ${TEXT_MUTED}; font-weight: 600; vertical-align: top;">Current Status</td>
        <td style="padding: 12px 16px; color: #4ade80; font-weight: 700;">✓ Reported issue cleared (not a guarantee that every check passed)</td>
      </tr>
    </table>
  `;

  const html = baseEmailWrapper({
    title: subject,
    badgeText: 'Resolved',
    badgeColor: '#4ade80',
    badgeBg: 'rgba(74, 222, 128, 0.15)',
    badgeBorder: 'rgba(74, 222, 128, 0.4)',
    contentHtml,
    dashboardUrl
  });

  const plainText = [
    `TAHALUF DASHBOARD - ISSUE RESOLVED`,
    `==================================`,
    `Event: ${issue.eventName}`,
    `Source: ${issue.kind}`,
    `Previous Issue: ${issue.status}`,
    `Resolved At: ${resolvedTimeStr}`,
    `Current Status: Reported issue cleared under the current checks; review other categories in Health Monitor.`,
    '',
    `Dashboard URL: ${dashboardUrl || 'https://tahaluf-dashboard.vercel.app'}`
  ].join('\n');

  return { subject, text: plainText, html };
}

/**
 * Builds HTML and plain text for the daily health digest.
 */
export function formatDailyDigestEmail(issues = [], dashboardUrl) {
  const subject = `📊 Tahaluf Dashboard Daily Health Digest (${issues.length} active issue${issues.length === 1 ? '' : 's'})`;

  const issueRows = issues.map(issue => `
    <tr style="border-bottom: 1px solid ${BORDER_COLOR};">
      <td style="padding: 12px; font-weight: 700; color: #ffffff;">${escapeHtml(issue.eventName)}</td>
      <td style="padding: 12px; color: ${TEXT_MUTED};">${escapeHtml(issue.kind)}</td>
      <td style="padding: 12px; font-weight: 700; color: #f87171;">${escapeHtml(issue.status)}</td>
      <td style="padding: 12px; color: #e2e8f0; font-size: 12px; line-height: 1.4;">${escapeHtml(issue.message)}</td>
    </tr>
  `).join('');

  const contentHtml = `
    <div style="font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 12px;">
      Daily Health Digest Summary
    </div>
    <p style="font-size: 13px; color: ${TEXT_MUTED}; margin: 0 0 20px 0; line-height: 1.5;">
      There are currently <strong style="color: #f87171;">${issues.length}</strong> active data health issues requiring attention. Review the affected sheets below:
    </p>

    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #041424; border: 1px solid ${BORDER_COLOR}; border-radius: 10px; font-size: 13px; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 1px solid ${BORDER_COLOR}; background-color: #061c32; text-align: left; color: ${TEXT_MUTED}; font-size: 11px; text-transform: uppercase;">
          <th style="padding: 10px 12px;">Event</th>
          <th style="padding: 10px 12px;">Feed</th>
          <th style="padding: 10px 12px;">Status</th>
          <th style="padding: 10px 12px;">Details</th>
        </tr>
      </thead>
      <tbody>
        ${issueRows}
      </tbody>
    </table>
  `;

  const html = baseEmailWrapper({
    title: subject,
    badgeText: 'Daily Digest',
    badgeColor: ACCENT_CYAN,
    badgeBg: 'rgba(20, 166, 217, 0.15)',
    badgeBorder: 'rgba(20, 166, 217, 0.4)',
    contentHtml,
    dashboardUrl
  });

  const plainText = [
    `TAHALUF DASHBOARD - DAILY HEALTH DIGEST`,
    `======================================`,
    `Active Issues: ${issues.length}`,
    '',
    ...issues.map(i => ` - ${i.eventName} (${i.kind}) [${i.status}]: ${i.message}`),
    '',
    `Review in Dashboard: ${dashboardUrl || 'https://tahaluf-dashboard.vercel.app'}`
  ].join('\n');

  return { subject, text: plainText, html };
}

/**
 * Builds HTML and plain text for the test email.
 */
export function formatTestEmail(dashboardUrl) {
  const subject = `🔔 Tahaluf Dashboard: Health Notification Test`;
  const contentHtml = `
    <div style="font-size: 16px; font-weight: 700; color: ${ACCENT_LIME}; margin-bottom: 12px;">
      Email Notification System Connected
    </div>
    <p style="font-size: 13px; color: ${TEXT_LIGHT}; margin: 0 0 16px 0; line-height: 1.5;">
      This is a test notification from the Tahaluf Marketing Dashboard.
    </p>
    <div style="background-color: #041424; border: 1px solid ${BORDER_COLOR}; border-radius: 10px; padding: 16px; font-size: 13px; color: ${TEXT_MUTED}; line-height: 1.6;">
      ✓ SMTP Transport verified successfully.<br>
      ✓ Alert templates and HTML layout rendered.<br>
      ✓ You will receive instant notifications when data feeds fail or metric discrepancies are detected.
    </div>
  `;

  const html = baseEmailWrapper({
    title: subject,
    badgeText: 'Test Verified',
    badgeColor: ACCENT_LIME,
    badgeBg: 'rgba(206, 220, 40, 0.15)',
    badgeBorder: 'rgba(206, 220, 40, 0.4)',
    contentHtml,
    dashboardUrl
  });

  const plainText = [
    'TAHALUF DASHBOARD - HEALTH NOTIFICATION TEST',
    '===========================================',
    'This is a test notification from the Tahaluf Marketing Dashboard.',
    'SMTP email notifications are active and verified.',
    `Dashboard URL: ${dashboardUrl || 'https://tahaluf-dashboard.vercel.app'}`
  ].join('\n');

  return { subject, text: plainText, html };
}
