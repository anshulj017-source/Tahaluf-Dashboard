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

  const customMetrics = options.customMetrics || [];
  const customCols = {};
  customMetrics.forEach(m => {
    try {
      const rx = new RegExp(m.columnRegex || `^${m.id}$`, 'i');
      customCols[m.id] = findCol(rx);
    } catch {
      customCols[m.id] = findCol(new RegExp(`^${m.id}$`, 'i'));
    }
  });

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
      const initial = {
        eventName,
        channel,
        date: latestDate,
        cost: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        rowCount: 0
      };
      customMetrics.forEach(m => { initial[m.id] = 0; });
      groups.set(groupKey, initial);
    }

    const item = groups.get(groupKey);
    item.cost += parseNumericMetric(costCol ? row[costCol] : (row['Cost'] || row['Spend'] || 0));
    item.impressions += parseNumericMetric(impCol ? row[impCol] : (row['Impressions'] || 0));
    item.clicks += parseNumericMetric(clickCol ? row[clickCol] : (row['Clicks'] || 0));
    item.conversions += parseNumericMetric(convCol ? row[convCol] : (row['Conversions'] || row['Purchases'] || 0));
    customMetrics.forEach(m => {
      const cCol = customCols[m.id];
      if (cCol) item[m.id] = (item[m.id] || 0) + parseNumericMetric(row[cCol]);
    });
    item.rowCount += 1;
  });

  const channelMetrics = Array.from(groups.values()).map(item => {
    const formatted = {
      ...item,
      cost: Math.round(item.cost * 100) / 100,
      impressions: Math.round(item.impressions),
      clicks: Math.round(item.clicks),
      conversions: Math.round(item.conversions)
    };
    customMetrics.forEach(m => {
      if (typeof formatted[m.id] === 'number') {
        formatted[m.id] = Math.round(formatted[m.id] * 100) / 100;
      }
    });
    return formatted;
  });

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

  const enabledMetrics = options.enabledMetrics || CORE_METRICS;
  const customMetrics = options.customMetrics || [];
  const metricsToCheck = enabledMetrics;

  currentMetrics.forEach(item => {
    const isToday = item.date === todayUtc;
    if (filterPartialCurrentDay && isToday) {
      return;
    }

    const baselineKey = `${item.eventName}:::${item.channel}:::${item.date}`;
    const previous = previousBaselines?.[baselineKey];

    if (previous) {
      metricsToCheck.forEach(metric => {
        const prevVal = parseNumericMetric(previous[metric]);
        const currVal = parseNumericMetric(item[metric]);

        if (currVal < prevVal) {
          const dropAmount = prevVal - currVal;
          const dropPercent = prevVal > 0 ? (dropAmount / prevVal) * 100 : 0;
          const tolConfig = options.metricTolerances?.[metric] || METRIC_TOLERANCE[metric];
          const tolPercent = typeof tolConfig?.percent === 'number' ? tolConfig.percent : (typeof tolConfig === 'number' ? tolConfig : 1.0);
          const tolMinDrop = typeof tolConfig?.minDrop === 'number' ? tolConfig.minDrop : 1;

          if (dropPercent >= tolPercent && dropAmount >= tolMinDrop) {
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
    const nextBaseline = {
      eventName: item.eventName,
      channel: item.channel,
      date: item.date,
      cost: Math.max(previous?.cost || 0, item.cost || 0),
      impressions: Math.max(previous?.impressions || 0, item.impressions || 0),
      clicks: Math.max(previous?.clicks || 0, item.clicks || 0),
      conversions: Math.max(previous?.conversions || 0, item.conversions || 0),
      lastObservedAt: new Date().toISOString()
    };
    customMetrics.forEach(m => {
      nextBaseline[m.id] = Math.max(previous?.[m.id] || 0, item[m.id] || 0);
    });
    updatedBaselines[baselineKey] = nextBaseline;
  });

  return {
    discrepancies,
    updatedBaselines
  };
}

export const DEFAULT_PACING_CONFIG = {
  costSurgePercent: 150.0, // Alert if cost surges by >= 150%
  minCostSurgeAmount: 200.0, // And by at least $200
  cpcSurgePercent: 100.0 // Alert if CPC doubles (>= 100% increase)
};

export function checkPacingSurges(currentMetrics = [], previousBaselines = {}, options = {}) {
  const surges = [];
  const cfg = { ...DEFAULT_PACING_CONFIG, ...(options.pacingConfig || {}) };

  currentMetrics.forEach(item => {
    const baselineKey = `${item.eventName}:::${item.channel}:::${item.date}`;
    const previous = previousBaselines?.[baselineKey];
    if (!previous) return;

    const prevCost = parseNumericMetric(previous.cost);
    const currCost = parseNumericMetric(item.cost);

    if (prevCost > 0 && currCost > prevCost) {
      const surgeAmount = currCost - prevCost;
      const surgePercent = (surgeAmount / prevCost) * 100;

      if (surgePercent >= cfg.costSurgePercent && surgeAmount >= cfg.minCostSurgeAmount) {
        surges.push({
          id: `${item.eventName}:${item.channel}:surge-cost:${item.date}`,
          eventName: item.eventName,
          channel: item.channel,
          metric: 'cost',
          type: 'spend-surge',
          date: item.date,
          previousValue: prevCost,
          currentValue: currCost,
          surgeAmount: Math.round(surgeAmount * 100) / 100,
          surgePercent: Math.round(surgePercent * 10) / 10,
          severity: surgePercent >= 300 ? 'critical' : 'warning',
          detectedAt: new Date().toISOString()
        });
      }
    }

    // Check CPC surge if clicks exist
    const prevClicks = parseNumericMetric(previous.clicks);
    const currClicks = parseNumericMetric(item.clicks);
    if (prevClicks >= 10 && currClicks >= 10 && prevCost > 0 && currCost > 0) {
      const prevCpc = prevCost / prevClicks;
      const currCpc = currCost / currClicks;
      if (currCpc > prevCpc) {
        const cpcSurgePercent = ((currCpc - prevCpc) / prevCpc) * 100;
        if (cpcSurgePercent >= cfg.cpcSurgePercent && (currCpc - prevCpc) >= 1.5) {
          surges.push({
            id: `${item.eventName}:${item.channel}:surge-cpc:${item.date}`,
            eventName: item.eventName,
            channel: item.channel,
            metric: 'cpc',
            type: 'cpc-spike',
            date: item.date,
            previousValue: Math.round(prevCpc * 100) / 100,
            currentValue: Math.round(currCpc * 100) / 100,
            surgeAmount: Math.round((currCpc - prevCpc) * 100) / 100,
            surgePercent: Math.round(cpcSurgePercent * 10) / 10,
            severity: 'warning',
            detectedAt: new Date().toISOString()
          });
        }
      }
    }
  });

  return surges;
}

/**
 * --------------------------------------------------------------------------
 * Activity Pause & Spend Cliff Radar
 * --------------------------------------------------------------------------
 * Monitors day-over-day delivery velocity, row presence, and media pacing.
 * Flags severe spend dropouts (>=40%), delivery freezes (100% pause), and
 * channel collapses compared to trailing flighting baselines.
 */

export const DEFAULT_ACTIVITY_CONFIG = {
  spendCliffPercent: 25.0, // Alert if daily spend drops >= 25% vs trailing average
  dodCliffPercent: 30.0, // Alert if day-over-day spend drops >= 30%
  channelDropPercent: 40.0, // Alert if individual channel spend drops >= 40%
  minBaselineDailySpend: 25.0, // Include lower-volume events with meaningful daily spend
  rowDropPercent: 35.0, // Alert if active rows drop >= 35%
  minBaselineRows: 5, // Minimum rows to consider an event actively flighting
  trailingDays: 5, // Trailing window for baseline comparison
  maxTargetDaysAgo: 4 // Only flag active campaigns with reporting dates within last 4 days
};

export function detectActivityAnomalies(rowsOrCsvText, defaultEventName = '', options = {}) {
  const rows = typeof rowsOrCsvText === 'string'
    ? csvParse(rowsOrCsvText)
    : (Array.isArray(rowsOrCsvText) ? rowsOrCsvText : []);

  if (!rows || rows.length === 0) {
    return { activityAnomalies: [] };
  }

  const columns = rows.columns || Object.keys(rows[0] || {});
  const findCol = (regex) => columns.find(c => regex.test(c.trim()));

  const eventCol = findCol(/^event name db$/i) || findCol(/^event name$/i) || findCol(/\bevent\b/i);
  const channelCol = findCol(/^channel$/i) || findCol(/\bchannel\b/i) || findCol(/^source$/i);
  const dateCol = findCol(/^date$/i) || findCol(/\bdate\b/i);
  const costCol = findCol(/^cost$/i) || findCol(/^spend$/i) || findCol(/media spend/i);
  const impCol = findCol(/^impressions$/i) || findCol(/\bimpressions\b/i);
  const clickCol = findCol(/^clicks$/i) || findCol(/\bclicks\b/i);

  const cfg = { ...DEFAULT_ACTIVITY_CONFIG, ...(options.activityConfig || {}) };
  const now = options.currentTime ? new Date(options.currentTime) : new Date();
  const todayUtc = options.currentDay || now.toISOString().slice(0, 10);
  const excludePartial = options.excludePartialCurrentDay !== false;
  const currentDayProgress = typeof options.currentDayProgress === 'number'
    ? Math.max(0, Math.min(1, options.currentDayProgress))
    : options.currentTime
      ? Math.max(0, Math.min(1, (now.getUTCHours() * 60 + now.getUTCMinutes()) / (24 * 60)))
      : options.currentDay
        ? 1
        : Math.max(0, Math.min(1, (now.getUTCHours() * 60 + now.getUTCMinutes()) / (24 * 60)));
  const elapsedUtcMinutes = Math.floor(currentDayProgress * 24 * 60);
  const elapsedUtcLabel = `${String(Math.floor(elapsedUtcMinutes / 60)).padStart(2, '0')}:${String(elapsedUtcMinutes % 60).padStart(2, '0')}`;

  // Group by (Event -> Date) and collect all valid dates in dataset
  const eventDateMap = new Map();
  const allValidDates = [];

  rows.forEach(row => {
    const d = parseRowDate(dateCol ? row[dateCol] : (row['Date'] || row['date']));
    if (!d) return;
    allValidDates.push(d);

    let eventName = (eventCol ? row[eventCol] : (row['Event Name DB'] || defaultEventName || '')).trim();
    if (eventName === 'SMLC') eventName = 'SMLC 26';
    if (!eventName && defaultEventName) eventName = defaultEventName;
    if (!eventName) eventName = 'Unknown';

    const channel = (channelCol ? row[channelCol] : (row['Channel'] || 'Unknown')).trim() || 'Unknown';
    const cost = parseNumericMetric(costCol ? row[costCol] : (row['Cost'] || row['Spend'] || 0));
    const impressions = parseNumericMetric(impCol ? row[impCol] : (row['Impressions'] || 0));
    const clicks = parseNumericMetric(clickCol ? row[clickCol] : (row['Clicks'] || 0));

    if (!eventDateMap.has(eventName)) {
      eventDateMap.set(eventName, new Map());
    }

    const dateMap = eventDateMap.get(eventName);
    if (!dateMap.has(d)) {
      dateMap.set(d, {
        date: d,
        spend: 0,
        rows: 0,
        impressions: 0,
        clicks: 0,
        channels: new Map()
      });
    }

    const entry = dateMap.get(d);
    entry.spend += cost;
    entry.rows += 1;
    entry.impressions += impressions;
    entry.clicks += clicks;
    entry.channels.set(channel, (entry.channels.get(channel) || 0) + cost);
  });

  const uniqueSheetDates = Array.from(new Set(allValidDates)).sort();
  if (uniqueSheetDates.length === 0) {
    return { activityAnomalies: [] };
  }

  // Evaluate at least through yesterday so a stopped source is not masked by its last reported date.
  let datasetTargetDate = uniqueSheetDates.at(-1);
  if (excludePartial && datasetTargetDate === todayUtc) {
    datasetTargetDate = uniqueSheetDates.at(-2);
  }
  const expectedTargetDate = excludePartial
    ? new Date(Date.parse(`${todayUtc}T00:00:00.000Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;
  const globalTargetDate = expectedTargetDate && (!datasetTargetDate || expectedTargetDate > datasetTargetDate)
    ? expectedTargetDate
    : datasetTargetDate;

  const activityAnomalies = [];

  eventDateMap.forEach((dateMap, eventName) => {
    const eventDates = Array.from(dateMap.keys()).sort();
    if (eventDates.length === 0) return;

    // Use today's partial rows only after enough of the day has elapsed to assess delivery pace.
    const hasAssessablePartialDay = excludePartial &&
      currentDayProgress >= 4 / 24 &&
      dateMap.has(todayUtc);
    let targetDate = hasAssessablePartialDay ? todayUtc : globalTargetDate;
    if (!targetDate) {
      let idx = eventDates.length - 1;
      if (excludePartial && eventDates[idx] === todayUtc && eventDates.length >= 2) {
        idx = eventDates.length - 2;
      }
      targetDate = eventDates[idx];
    }
    if (!targetDate) return;

    // Trailing comparison window: up to trailingDays strictly prior to targetDate
    const priorDates = eventDates.filter(d => d < targetDate).slice(-cfg.trailingDays);
    if (priorDates.length === 0) return;

    let baselineSpendSum = 0;
    let baselineRowsSum = 0;
    const priorChannelSpend = new Map();

    priorDates.forEach(d => {
      const entry = dateMap.get(d);
      if (entry) {
        baselineSpendSum += entry.spend;
        baselineRowsSum += entry.rows;
        entry.channels.forEach((sp, ch) => {
          priorChannelSpend.set(ch, (priorChannelSpend.get(ch) || 0) + sp / priorDates.length);
        });
      }
    });

    const baselineDailySpend = baselineSpendSum / priorDates.length;
    const baselineDailyRows = baselineRowsSum / priorDates.length;

    // Only analyze events that had meaningful recent flighting
    if (baselineDailySpend < cfg.minBaselineDailySpend && baselineDailyRows < cfg.minBaselineRows) {
      return;
    }

    // Only monitor campaigns with recent activity within recency horizon (default 4 days)
    const targetMs = new Date(targetDate).getTime();
    const todayMs = new Date(todayUtc).getTime();
    const daysAgo = Math.round((todayMs - targetMs) / (1000 * 60 * 60 * 24));
    if (!isNaN(daysAgo) && daysAgo > (cfg.maxTargetDaysAgo || 4)) {
      return;
    }

    const targetEntry = dateMap.get(targetDate);
    // If the event stopped reporting (no entry for targetDate), treat as activity halt
    if (!targetEntry) {
      // Determine the most recent date the event reported
      const latestEventDate = eventDates[eventDates.length - 1];
      const daysSinceLatest = Math.round((new Date(todayUtc).getTime() - new Date(latestEventDate).getTime()) / (1000 * 60 * 60 * 24));
      // Only generate halt if within recency horizon and baseline thresholds are met (checked earlier)
      if (daysSinceLatest <= (cfg.maxTargetDaysAgo || 4)) {
        activityAnomalies.push({
          id: `${eventName}:activity-halt:${targetDate}`,
          eventName,
          type: 'activity-halt',
          severity: 'critical',
          date: targetDate,
          baselineSpend: Math.round(baselineDailySpend * 100) / 100,
          currentSpend: 0,
          baselineRows: Math.round(baselineDailyRows),
          currentRows: 0,
          dropPercent: 100.0,
          priorDatesCount: priorDates.length,
          message: `Activity Halted: No data reported for ${eventName} on ${targetDate}. Expected activity but none found (last reported ${latestEventDate}).`,
          detectedAt: new Date().toISOString()
        });
      }
      // Skip further processing for this event
      return;
    }
    const currentSpend = targetEntry.spend;
    const currentRows = targetEntry.rows;
    const isPartialDay = excludePartial && targetDate === todayUtc && currentDayProgress < 1;
    const paceFactor = isPartialDay ? currentDayProgress : 1;
    const expectedSpend = baselineDailySpend * paceFactor;
    const expectedRows = baselineDailyRows * paceFactor;

    // 1. Total Activity Halt (all delivery stopped: $0 spend or 0 rows on targetDate)
    if (currentSpend === 0 || currentRows === 0) {
      activityAnomalies.push({
        id: `${eventName}:activity-halt:${targetDate}`,
        eventName,
        type: 'activity-halt',
        severity: 'critical',
        date: targetDate,
        baselineSpend: Math.round(baselineDailySpend * 100) / 100,
        currentSpend: 0,
        baselineRows: Math.round(baselineDailyRows),
        currentRows: 0,
        dropPercent: 100.0,
        priorDatesCount: priorDates.length,
        message: `Activity Halted: All campaign delivery stopped for ${eventName} on ${targetDate}. Spend dropped to $0.00 across 0 rows (trailing baseline: $${Math.round(baselineDailySpend).toLocaleString()}/day across ${Math.round(baselineDailyRows)} rows).`,
        detectedAt: new Date().toISOString()
      });
      return;
    }

    // 2. Severe Spend Cliff (daily spend dropped significantly vs trailing baseline or prior day)
    const spendDropAmount = expectedSpend - currentSpend;
    const spendDropPercent = expectedSpend > 0 ? (spendDropAmount / expectedSpend) * 100 : 0;
    const rowDropAmount = expectedRows - currentRows;
    const rowDropPercent = expectedRows > 0 ? (rowDropAmount / expectedRows) * 100 : 0;

    // Day-over-day drop comparison (targetDate vs immediately prior complete day)
    const priorDayDate = priorDates[priorDates.length - 1];
    const priorDayEntry = dateMap.get(priorDayDate);
    const priorDaySpend = priorDayEntry ? priorDayEntry.spend * paceFactor : 0;
    const dodDropAmount = priorDaySpend - currentSpend;
    const dodDropPercent = priorDaySpend > 0 ? (dodDropAmount / priorDaySpend) * 100 : 0;

    // Evaluate collapsed/severely reduced individual channels (>= 40% drop)
    const droppedChannels = [];
    const channelDropThresh = (cfg.channelDropPercent || 40.0) / 100;
    priorChannelSpend.forEach((avgChSpend, ch) => {
      const expectedChSpend = avgChSpend * paceFactor;
      const currChSpend = targetEntry.channels.get(ch) || 0;
      if (expectedChSpend >= 5 && (currChSpend === 0 || (expectedChSpend - currChSpend) / expectedChSpend >= channelDropThresh)) {
        const chDropPct = Math.round(((expectedChSpend - currChSpend) / expectedChSpend) * 100);
        droppedChannels.push({
          channel: ch,
          baselineSpend: Math.round(expectedChSpend * 100) / 100,
          currentSpend: Math.round(currChSpend * 100) / 100,
          dropPercent: chDropPct
        });
      }
    });

    const minimumDropAmount = isPartialDay ? 5 : 50;
    const isTrailingCliff = spendDropPercent >= cfg.spendCliffPercent && spendDropAmount >= minimumDropAmount;
    const isDodCliff = dodDropPercent >= (cfg.dodCliffPercent || 30.0) && dodDropAmount >= (isPartialDay ? 5 : 75);
    const isChannelCliff = droppedChannels.length > 0 && spendDropPercent >= 20.0 && spendDropAmount >= minimumDropAmount;

    if (isTrailingCliff || isDodCliff || isChannelCliff) {
      const reportedDropPercent = Math.max(spendDropPercent, dodDropPercent);
      activityAnomalies.push({
        id: `${eventName}:spend-cliff:${targetDate}`,
        eventName,
        type: 'spend-cliff',
        severity: reportedDropPercent >= 65 ? 'critical' : 'warning',
        date: targetDate,
        baselineSpend: Math.round(baselineDailySpend * 100) / 100,
        currentSpend: Math.round(currentSpend * 100) / 100,
        spendDropAmount: Math.round(Math.max(spendDropAmount, dodDropAmount) * 100) / 100,
        dropPercent: Math.round(spendDropPercent * 10) / 10,
        dodDropPercent: Math.round(dodDropPercent * 10) / 10,
        baselineRows: Math.round(baselineDailyRows),
        currentRows,
        rowDropPercent: Math.round(rowDropPercent * 10) / 10,
        droppedChannels,
        partialDay: isPartialDay,
        message: isPartialDay
          ? `Spend Cliff Detected: ${eventName} spend is ${spendDropPercent.toFixed(1)}% below expected pace on ${targetDate} (expected $${expectedSpend.toFixed(2)} by ${elapsedUtcLabel} UTC; reported $${currentSpend.toFixed(2)}). Daily baseline: $${Math.round(baselineDailySpend).toLocaleString()}.`
          : `Spend Cliff Detected: ${eventName} daily spend dropped by ${spendDropPercent.toFixed(1)}% ($${Math.round(baselineDailySpend).toLocaleString()} → $${currentSpend.toFixed(2)}${dodDropPercent > spendDropPercent ? `, -${dodDropPercent.toFixed(1)}% DoD` : ''}) on ${targetDate}. Active delivery rows: ${currentRows}.${droppedChannels.length ? ` Paused/reduced channels: ${droppedChannels.map(c => `${c.channel} (-${c.dropPercent}%)`).join(', ')}.` : ''}`,
        detectedAt: new Date().toISOString()
      });
    }
  });

  return { activityAnomalies };
}
