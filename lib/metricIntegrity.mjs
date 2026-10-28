import { csvParse } from 'd3';

/**
 * 24-Hour Channel Metric Integrity & Discrepancy Detection
 *
 * Monitors top 4 metrics (Cost, Impressions, Clicks, Conversions) for each channel
 * across all events for the most recent 24-hour ingestion period.
 * 
 * In digital marketing attribution, metrics for the latest 24-hour period should
 * monotonically increase or remain steady between sheet refreshes. A drop indicates
 * dropped rows, data truncation, or source sync failure.
 */

export const METRIC_TOLERANCE = {
  cost: { percent: 1.0, minDrop: 1.0 },        // > 1% drop and > $1.00
  impressions: { percent: 1.0, minDrop: 5 },   // > 1% drop and > 5 impressions
  clicks: { percent: 1.0, minDrop: 2 },        // > 1% drop and > 2 clicks
  conversions: { percent: 1.0, minDrop: 1 }    // > 1% drop and > 1 conversion
};

export const CORE_METRICS = ['cost', 'impressions', 'clicks', 'conversions'];

export function parseNumericMetric(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Number.isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[$,]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function parseRowDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  const date = new Date(str);
  return !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

/**
 * Extracts channel-level metrics for the latest 24h period (latest calendar date)
 * from raw CSV rows.
 *
 * @param {string|Array} rowsOrCsvText Raw CSV text or parsed array of row objects
 * @param {string} defaultEventName Fallback event name
 * @param {Object} options Configuration options
 * @param {boolean} [options.excludePartialCurrentDay=false] When true and previous dates exist, uses latest complete date instead of today
 * @param {string} [options.currentDay] Override today UTC date (YYYY-MM-DD)
 */
export function extractChannelMetrics24h(rowsOrCsvText, defaultEventName = '', options = {}) {
  const rows = typeof rowsOrCsvText === 'string'
    ? csvParse(rowsOrCsvText)
    : (Array.isArray(rowsOrCsvText) ? rowsOrCsvText : []);

  if (!rows || rows.length === 0) {
    return { latestDate: null, channelMetrics: [] };
  }

  const columns = rows.columns || Object.keys(rows[0] || {});
  const findCol = (regex) => columns.find(c => regex.test(c.trim()));

  const eventCol = findCol(/^event name db$/i) || findCol(/^event name$/i) || findCol(/\bevent\b/i);
  const channelCol = findCol(/^channel$/i) || findCol(/\bchannel\b/i) || findCol(/^source$/i);
  const dateCol = findCol(/^date$/i) || findCol(/\bdate\b/i);

  const costCol = findCol(/^cost$/i) || findCol(/^spend$/i) || findCol(/media spend/i);
  const impCol = findCol(/^impressions$/i) || findCol(/\bimpressions\b/i) || findCol(/\bimpression\b/i);
  const clickCol = findCol(/^clicks$/i) || findCol(/\bclicks\b/i) || findCol(/\bclick\b/i);
  const convCol = findCol(/^conversions$/i) || findCol(/^conversion$/i) || findCol(/^purchases$/i) || findCol(/^leads$/i);

  // Find all valid dates and identify the latest date (last 24 hours)
  const validDates = [];
  rows.forEach(r => {
    const d = parseRowDate(dateCol ? r[dateCol] : (r['Date'] || r['date']));
    if (d) validDates.push(d);
  });

  if (validDates.length === 0) {
    return { latestDate: null, channelMetrics: [] };
  }

  validDates.sort();
  const todayUtc = options.currentDay || new Date().toISOString().slice(0, 10);
  let latestDate = validDates[validDates.length - 1];

  // If excluding partial in-progress day, pick the latest complete day if earlier dates exist
  if (options.excludePartialCurrentDay && latestDate === todayUtc) {
    const completeDates = validDates.filter(d => d < todayUtc);
    if (completeDates.length > 0) {
      latestDate = completeDates[completeDates.length - 1];
    }
  }

  // Aggregate by Event + Channel for the latest date
  const groups = new Map();

  rows.forEach(row => {
    const rowDate = parseRowDate(dateCol ? row[dateCol] : (row['Date'] || row['date']));
    if (rowDate !== latestDate) return;

    let eventName = (eventCol ? row[eventCol] : (row['Event Name DB'] || defaultEventName || '')).trim();
    if (eventName === 'SMLC') eventName = 'SMLC 26';
    if (!eventName && defaultEventName) eventName = defaultEventName;
    if (!eventName) eventName = 'Unknown';

    let channel = (channelCol ? row[channelCol] : (row['Channel'] || 'Unknown')).trim() || 'Unknown';

    const groupKey = `${eventName}:::${channel}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        eventName,
        channel,
        date: latestDate,
        cost: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        rowCount: 0
      });
    }

    const item = groups.get(groupKey);
    item.cost += parseNumericMetric(costCol ? row[costCol] : (row['Cost'] || row['Spend'] || 0));
    item.impressions += parseNumericMetric(impCol ? row[impCol] : (row['Impressions'] || 0));
    item.clicks += parseNumericMetric(clickCol ? row[clickCol] : (row['Clicks'] || 0));
    item.conversions += parseNumericMetric(convCol ? row[convCol] : (row['Conversions'] || row['Purchases'] || 0));
    item.rowCount += 1;
  });

  const channelMetrics = Array.from(groups.values()).map(item => ({
    ...item,
    cost: Math.round(item.cost * 100) / 100,
    impressions: Math.round(item.impressions),
    clicks: Math.round(item.clicks),
    conversions: Math.round(item.conversions)
  }));

  return {
    latestDate,
    channelMetrics
  };
}

/**
 * Compares current 24h channel metrics against previous baseline snapshots.
 * Flags any metric that regressed (dropped) between fetches.
 *
 * @param {Array} currentMetrics Current metrics array
 * @param {Object} previousBaselines Existing baseline map
 * @param {Object} [options={}] Filtering options
 * @param {boolean} [options.filterPartialCurrentDay=false] Skip flagging drops for today's in-progress partial date
 * @param {string} [options.currentDay] Override today UTC string (YYYY-MM-DD)
 */
export function checkMetricDiscrepancies(currentMetrics = [], previousBaselines = {}, options = {}) {
  const discrepancies = [];
  const updatedBaselines = { ...(previousBaselines || {}) };
  const todayUtc = options.currentDay || new Date().toISOString().slice(0, 10);
  const filterPartialCurrentDay = Boolean(options.filterPartialCurrentDay);

  currentMetrics.forEach(item => {
    const isToday = item.date === todayUtc;
    if (filterPartialCurrentDay && isToday) {
      return;
    }

    const baselineKey = `${item.eventName}:::${item.channel}:::${item.date}`;
    const previous = previousBaselines?.[baselineKey];

    if (previous) {
      CORE_METRICS.forEach(metric => {
        const prevVal = parseNumericMetric(previous[metric]);
        const currVal = parseNumericMetric(item[metric]);

        if (currVal < prevVal) {
          const dropAmount = prevVal - currVal;
          const dropPercent = prevVal > 0 ? (dropAmount / prevVal) * 100 : 0;
          const tol = METRIC_TOLERANCE[metric] || { percent: 1.0, minDrop: 1 };

          if (dropPercent >= tol.percent && dropAmount >= tol.minDrop) {
            discrepancies.push({
              id: `${item.eventName}:${item.channel}:${metric}:${item.date}`,
              eventName: item.eventName,
              channel: item.channel,
              metric,
              date: item.date,
              previousValue: prevVal,
              currentValue: currVal,
              dropAmount: Math.round(dropAmount * 100) / 100,
              dropPercent: Math.round(dropPercent * 10) / 10,
              isPartialDay: isToday,
              detectedAt: new Date().toISOString()
            });
          }
        }
      });
    }

    // Keep highest observed baseline for this date/channel to detect future regressions
    updatedBaselines[baselineKey] = {
      eventName: item.eventName,
      channel: item.channel,
      date: item.date,
      cost: Math.max(previous?.cost || 0, item.cost),
      impressions: Math.max(previous?.impressions || 0, item.impressions),
      clicks: Math.max(previous?.clicks || 0, item.clicks),
      conversions: Math.max(previous?.conversions || 0, item.conversions),
      lastObservedAt: new Date().toISOString()
    };
  });

  return {
    discrepancies,
    updatedBaselines
  };
}
