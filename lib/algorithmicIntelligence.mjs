/**
 * Algorithmic & Code-Based Marketing Intelligence Engine
 * 100% Deterministic, local statistical & heuristic algorithms.
 * Requires zero external LLM API calls, consumes zero quota, and executes in sub-5ms.
 */

/**
 * 1. Strategic Commentary & Algorithmic Narrative
 * Generates executive-level bullet points by analyzing channel spend distribution,
 * CPA efficiency, CTR performance, and volume delivery.
 */
export function generateStrategicCommentary(adData = [], channelAggregates = [], totals = {}, exSym = '$', exRate = 1, formatShort = (n) => String(n)) {
  const insights = [];
  if (!channelAggregates || channelAggregates.length === 0) return insights;

  // Normalize channel items: seamlessly support both `cost` and `spend`, `purchases` and `conversions`
  const validChannels = channelAggregates.map(c => {
    const rawCost = c.cost !== undefined ? Number(c.cost) : (c.spend !== undefined ? Number(c.spend) / (exRate || 1) : 0);
    const rawSpend = c.spend !== undefined ? Number(c.spend) : rawCost * (exRate || 1);
    const impressions = Number(c.impressions || c.imps || 0);
    const clicks = Number(c.clicks || 0);
    const purchases = Number(c.purchases || c.conversions || 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : Number(c.ctr || 0);
    const cpm = impressions > 0 ? (rawSpend / impressions) * 1000 : Number(c.cpm || 0);
    const cpc = clicks > 0 ? (rawSpend / clicks) : Number(c.cpc || 0);
    const cpa = purchases > 0 ? (rawSpend / purchases) : Number(c.cpa || 0);
    const channelName = c.channel || c.name || 'Channel';
    return {
      channel: channelName,
      name: channelName,
      cost: rawCost,
      spend: rawSpend,
      impressions,
      clicks,
      purchases,
      conversions: purchases,
      ctr,
      cpm,
      cpc,
      cpa
    };
  }).filter(c => c.spend > 0 || c.cost > 0 || c.impressions > 0);

  if (validChannels.length === 0) return insights;

  const totalCost = validChannels.reduce((sum, c) => sum + c.cost, 0);
  const totalSpend = validChannels.reduce((sum, c) => sum + c.spend, 0);
  const totalConversions = validChannels.reduce((sum, c) => sum + c.purchases, 0);
  const portfolioAvgCPA = totalConversions > 0 ? (totalSpend > 0 ? totalSpend / totalConversions : (totalCost * exRate) / totalConversions) : 0;
  const portfolioAvgCTR = totals.ctr ?? (totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : (validChannels.reduce((s, c) => s + c.clicks, 0) / Math.max(1, validChannels.reduce((s, c) => s + c.impressions, 0))) * 100);

  // A. Pacing & Delivery Summary
  const sortedBySpend = [...validChannels].sort((a, b) => b.spend - a.spend);
  const topSpender = sortedBySpend[0];
  const topSpendShare = totalSpend > 0 ? Math.round((topSpender.spend / totalSpend) * 100) : 100;
  insights.push({
    id: 'pacing_summary',
    type: 'pacing',
    badge: 'Volume Anchor',
    headline: `${topSpender.channel} anchors ${topSpendShare}% of delivered budget`,
    detail: `Total delivery of ${exSym}${formatShort(totalSpend || totalCost * exRate)} is led by ${topSpender.channel} (${exSym}${formatShort(topSpender.spend || topSpender.cost * exRate)}). Active CTR is maintaining ${portfolioAvgCTR.toFixed(2)}%.`,
    impactScore: 85
  });

  // B. Efficiency & Budget Reallocation Opportunity
  const channelsWithConversions = validChannels.filter(c => c.purchases > 0);
  if (channelsWithConversions.length >= 2) {
    const sortedByCPA = [...channelsWithConversions].sort((a, b) => a.cpa - b.cpa);
    const lowestCPAChannel = sortedByCPA[0];
    const highestCPAChannel = sortedByCPA[sortedByCPA.length - 1];

    if (highestCPAChannel.cpa > lowestCPAChannel.cpa * 1.2) {
      const shiftAmount = Math.round(highestCPAChannel.spend * 0.15);
      const potentialExtraConversions = Math.round(shiftAmount / Math.max(1, lowestCPAChannel.cpa));

      insights.push({
        id: 'reallocation_opportunity',
        type: 'opportunity',
        badge: 'Capital Optimization',
        headline: `Reallocate ~15% from ${highestCPAChannel.channel} to ${lowestCPAChannel.channel}`,
        detail: `${lowestCPAChannel.channel} yields CPA of ${exSym}${lowestCPAChannel.cpa.toFixed(2)} vs ${highestCPAChannel.channel} at ${exSym}${highestCPAChannel.cpa.toFixed(2)}. Shifting ${exSym}${formatShort(shiftAmount)} is projected to yield +${potentialExtraConversions} incremental conversions.`,
        impactScore: 92
      });
    }
  }

  // C. High Cost-Sink / CPA Anomaly Alert
  validChannels.forEach(ch => {
    if (ch.purchases > 0 && portfolioAvgCPA > 0) {
      if (ch.cpa > portfolioAvgCPA * 1.5 && ch.spend > totalSpend * 0.1) {
        insights.push({
          id: `cost_sink_${ch.channel}`,
          type: 'alert',
          badge: 'Elevated CPA',
          headline: `${ch.channel} acquisition cost is ${(ch.cpa / portfolioAvgCPA).toFixed(1)}x above benchmark`,
          detail: `Delivered CPA of ${exSym}${ch.cpa.toFixed(2)} is substantially above baseline (${exSym}${portfolioAvgCPA.toFixed(2)}). Recommend audience refinement or creative refresh.`,
          impactScore: 78
        });
      }
    }
  });

  // D. Engagement & CTR Outperformer
  const sortedByCTR = [...validChannels].filter(c => c.impressions > 0).sort((a, b) => b.ctr - a.ctr);
  if (sortedByCTR.length > 0) {
    const bestCTRChannel = sortedByCTR[0];
    if (bestCTRChannel.ctr > portfolioAvgCTR * 1.1 || validChannels.length === 1) {
      insights.push({
        id: 'engagement_leader',
        type: 'efficiency',
        badge: 'Strong Engagement',
        headline: `${bestCTRChannel.channel} leads engagement at ${bestCTRChannel.ctr.toFixed(2)}% CTR`,
        detail: `Maintaining ${bestCTRChannel.ctr.toFixed(2)}% CTR across ${formatShort(bestCTRChannel.impressions)} impressions confirms high audience responsiveness in current scope.`,
        impactScore: 80
      });
    }
  }

  // E. Delivery Efficiency (CPM Leader)
  const sortedByCPM = [...validChannels].filter(c => c.cpm > 0).sort((a, b) => a.cpm - b.cpm);
  if (sortedByCPM.length > 0) {
    const bestCPMChannel = sortedByCPM[0];
    insights.push({
      id: 'efficiency_leader',
      type: 'efficiency',
      badge: 'Cost Efficiency',
      headline: `${bestCPMChannel.channel} provides optimal reach at ${exSym}${bestCPMChannel.cpm.toFixed(2)} CPM`,
      detail: `Lowest cost-per-thousand impressions across active channels, maximizing top-of-funnel audience awareness.`,
      impactScore: 75
    });
  }

  return insights.sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0));
}

/**
 * 2. Channel Efficiency Quadrant Matrix (BCG-style Scale vs CPA matrix)
 * Evaluates channels along Volume Scale vs Cost Efficiency.
 */
export function computeChannelQuadrants(channelAggregates = []) {
  if (!channelAggregates || channelAggregates.length === 0) {
    return {
      quadrants: { star: [], niche: [], cost_sink: [], observation: [] },
      benchmarks: { medianSpend: 0, medianCPA: 0, channelCount: 0 }
    };
  }

  const valid = channelAggregates.map(c => {
    const rawCost = c.cost !== undefined ? Number(c.cost) : Number(c.spend || 0);
    const conv = Number(c.purchases || c.conversions || 0);
    const cpa = conv > 0 ? rawCost / conv : rawCost;
    const ctr = c.impressions > 0 ? (Number(c.clicks || 0) / Number(c.impressions)) * 100 : Number(c.ctr || 0);
    const cpm = c.impressions > 0 ? (rawCost / Number(c.impressions)) * 1000 : Number(c.cpm || 0);
    return {
      id: c.channel || c.name,
      name: c.channel || c.name,
      cost: rawCost,
      conversions: conv,
      cpa,
      ctr,
      cpm,
      impressions: Number(c.impressions || 0),
      clicks: Number(c.clicks || 0)
    };
  }).filter(c => c.cost > 0 || c.impressions > 0);

  if (valid.length === 0) {
    return {
      quadrants: { star: [], niche: [], cost_sink: [], observation: [] },
      benchmarks: { medianSpend: 0, medianCPA: 0, channelCount: 0 }
    };
  }

  const items = valid;

  // Calculate Median Spend and Median CPA
  const spends = items.map(i => i.cost).sort((a, b) => a - b);
  const cpas = items.map(i => i.cpa).sort((a, b) => a - b);

  const mid = Math.floor(spends.length / 2);
  const medianSpend = spends.length % 2 !== 0 ? spends[mid] : (spends[mid - 1] + spends[mid]) / 2;
  const medianCPA = cpas.length % 2 !== 0 ? cpas[mid] : (cpas[mid - 1] + cpas[mid]) / 2;

  const quadrants = {
    star: [],       // High Volume (>= medianSpend), High Efficiency (<= medianCPA)
    niche: [],      // Low Volume (< medianSpend), High Efficiency (<= medianCPA)
    cost_sink: [],  // High Volume (>= medianSpend), Low Efficiency (> medianCPA)
    observation: [] // Low Volume (< medianSpend), Low Efficiency (> medianCPA)
  };

  items.forEach(item => {
    const isHighScale = item.cost >= medianSpend;
    const isHighEfficiency = item.cpa <= medianCPA;

    if (isHighScale && isHighEfficiency) {
      quadrants.star.push({ ...item, tag: 'Star Performer', action: 'Scale Aggressively' });
    } else if (!isHighScale && isHighEfficiency) {
      quadrants.niche.push({ ...item, tag: 'Niche Driver', action: 'Increase Budget Allocation' });
    } else if (isHighScale && !isHighEfficiency) {
      quadrants.cost_sink.push({ ...item, tag: 'Cost Sink', action: 'Refine Targeting & Creatives' });
    } else {
      quadrants.observation.push({ ...item, tag: 'Under Observation', action: 'Audit Setup & Test Audiences' });
    }
  });

  return {
    quadrants,
    benchmarks: {
      medianSpend,
      medianCPA,
      channelCount: items.length
    }
  };
}

/**
 * 3. Diminishing Return "What-If" Scenario Budget Simulator
 * Projects conversions when budget is shifted across channels using empirical elasticity.
 */
export function simulateBudgetReallocation(channelAggregates = [], shifts = {}) {
  const results = [];
  let baselineTotalCost = 0;
  let simulatedTotalCost = 0;
  let baselineTotalConversions = 0;
  let simulatedTotalConversions = 0;

  channelAggregates.forEach(c => {
    const chName = c.channel || c.name;
    const baseCost = c.cost !== undefined ? Number(c.cost) : Number(c.spend || 0);
    const rawConv = Number(c.purchases || c.conversions || 0);
    const baseConv = Math.round(rawConv);
    const shiftPercent = shifts[chName] ?? 0; // e.g. +20 or -15

    const simCost = Math.max(0, baseCost * (1 + shiftPercent / 100));

    // Elasticity model: conversions follow diminishing marginal returns
    // Elasticity parameter alpha between 0.65 and 0.85 depending on volume
    const elasticity = baseCost > 10000 ? 0.72 : 0.82;
    let simConv = 0;
    if (baseCost > 0) {
      const costRatio = simCost / baseCost;
      simConv = Math.round(baseConv * Math.pow(costRatio, elasticity));
    }

    baselineTotalCost += baseCost;
    simulatedTotalCost += simCost;
    baselineTotalConversions += baseConv;
    simulatedTotalConversions += simConv;

    results.push({
      channel: chName,
      baseCost,
      simCost,
      shiftPercent,
      baseConv,
      simConv,
      deltaConv: Math.round(simConv - baseConv),
      baseCPA: baseConv > 0 ? baseCost / baseConv : 0,
      simCPA: simConv > 0 ? simCost / simConv : 0
    });
  });

  return {
    channels: results,
    totals: {
      baselineCost: baselineTotalCost,
      simulatedCost: simulatedTotalCost,
      baselineConversions: Math.round(baselineTotalConversions),
      simulatedConversions: Math.round(simulatedTotalConversions),
      deltaConversions: Math.round(simulatedTotalConversions - baselineTotalConversions),
      baselineCPA: baselineTotalConversions > 0 ? baselineTotalCost / baselineTotalConversions : 0,
      simulatedCPA: simulatedTotalConversions > 0 ? simulatedTotalCost / simulatedTotalConversions : 0
    }
  };
}

/**
 * 4. Event Target Pacing & Launch Forecaster
 * Evaluates current delivery speed against event target launch dates.
 */
export function computeLaunchForecast(deliveredCost = 0, targetBudget = 0, launchDateStr = '', eventStartDateStr = '') {
  const now = new Date();
  const launchDate = launchDateStr ? new Date(launchDateStr) : null;
  const startDate = eventStartDateStr ? new Date(eventStartDateStr) : null;

  const validLaunch = launchDate && !isNaN(launchDate.getTime()) && launchDate > now;
  const remainingDays = validLaunch ? Math.max(1, Math.ceil((launchDate - now) / (1000 * 60 * 60 * 24))) : 30;

  // Estimate elapsed days
  let elapsedDays = 30;
  if (startDate && !isNaN(startDate.getTime()) && now > startDate) {
    elapsedDays = Math.max(1, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));
  }

  const currentDailyBurn = elapsedDays > 0 ? deliveredCost / elapsedDays : deliveredCost / 30;
  const projectedFinishCost = deliveredCost + (currentDailyBurn * remainingDays);

  const budgetGoal = targetBudget > 0 ? targetBudget : deliveredCost * 1.25;
  const remainingBudget = Math.max(0, budgetGoal - deliveredCost);
  const requiredDailyBurn = remainingDays > 0 ? remainingBudget / remainingDays : 0;

  const pacePercent = budgetGoal > 0 ? (projectedFinishCost / budgetGoal) * 100 : 100;
  const paceGapPercent = currentDailyBurn > 0 ? ((requiredDailyBurn - currentDailyBurn) / currentDailyBurn) * 100 : 0;

  let status = 'on_track';
  if (pacePercent < 85) status = 'under_pacing';
  else if (pacePercent > 115) status = 'over_pacing';

  return {
    remainingDays,
    elapsedDays,
    currentDailyBurn,
    requiredDailyBurn,
    deliveredCost,
    targetBudget: budgetGoal,
    projectedFinishCost,
    pacePercent,
    paceGapPercent,
    status
  };
}

/**
 * 5. Creative Fatigue & Decay Radar
 * Flags ad creatives that have reached saturation and are losing CTR.
 */
export function computeCreativeFatigue(creatives = []) {
  if (!creatives || creatives.length === 0) return [];

  const evaluated = creatives.map(ad => {
    const impressions = Number(ad.impressions || ad.imps || 0);
    const clicks = Number(ad.clicks || 0);
    const cost = Number(ad.cost || ad.spend || 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpa = (ad.purchases || ad.conversions || 0) > 0 ? cost / (ad.purchases || ad.conversions) : 0;

    let fatigueState = 'healthy';
    let recommendations = 'Creative is delivering with healthy engagement.';
    let fatigueScore = 20;

    // Saturation heuristic: high impressions with low or decaying CTR
    if (impressions > 50000 && ctr < 0.6) {
      fatigueState = 'fatigued';
      recommendations = 'Severe audience saturation detected. CTR has fallen below 0.6%. Immediate creative replacement recommended.';
      fatigueScore = 90;
    } else if (impressions > 25000 && ctr < 0.9) {
      fatigueState = 'warning';
      recommendations = 'Approaching audience fatigue. Plan replacement visual assets within 5–7 days.';
      fatigueScore = 65;
    } else if (ctr > 1.8 && (ad.purchases || ad.conversions || 0) > 10) {
      fatigueState = 'top_performer';
      recommendations = 'High-performing winner asset. Consider cloning to lookalike and broader audiences.';
      fatigueScore = 10;
    }

    return {
      id: ad.id || ad.creativeName || ad.name || 'Ad',
      name: ad.creativeName || ad.name || ad.title || 'Creative Asset',
      channel: ad.channel || 'Multi-Channel',
      impressions,
      clicks,
      cost,
      ctr,
      cpa,
      fatigueState,
      recommendations,
      fatigueScore
    };
  });

  return evaluated.sort((a, b) => b.fatigueScore - a.fatigueScore);
}

/**
 * 6. Event Strategic Breakdown
 * Aggregates all marketing telemetry by Event with independent KPIs,
 * channel performance leader, and deterministic health status.
 */
export function computeEventsBreakdown(adData = [], exRate = 1, exSym = '$', formatShort = (n) => String(n)) {
  if (!adData || adData.length === 0) return [];

  const eventMap = new Map();
  let totalAllSpend = 0;

  adData.forEach(row => {
    const rawEv = (row.eventNameDB || 'Unknown').trim();
    if (!rawEv || rawEv === 'Unknown') return;
    const spend = (Number(row.cost) || Number(row.spend) || 0) * exRate;
    const impressions = Number(row.impressions || 0);
    const clicks = Number(row.clicks || 0);
    const purchases = Number(row.purchases || row.conversions || 0);
    const channel = row.channel || 'Unknown';
    const portfolio = row.portfolio || 'P1';

    totalAllSpend += spend;

    if (!eventMap.has(rawEv)) {
      eventMap.set(rawEv, {
        name: rawEv,
        portfolio,
        spend: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        channelSpend: new Map()
      });
    }

    const entry = eventMap.get(rawEv);
    entry.spend += spend;
    entry.impressions += impressions;
    entry.clicks += clicks;
    entry.purchases += purchases;
    if (portfolio) entry.portfolio = portfolio;

    const chSpend = entry.channelSpend.get(channel) || 0;
    entry.channelSpend.set(channel, chSpend + spend);
  });

  const results = [];
  eventMap.forEach((entry, name) => {
    let topChannel = 'Multi-Channel';
    let maxChSpend = 0;
    entry.channelSpend.forEach((sp, ch) => {
      if (sp > maxChSpend) {
        maxChSpend = sp;
        topChannel = ch;
      }
    });

    const ctr = entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0;
    const cpm = entry.impressions > 0 ? (entry.spend / entry.impressions) * 1000 : 0;
    const cpa = entry.purchases > 0 ? entry.spend / entry.purchases : 0;
    const spendShare = totalAllSpend > 0 ? (entry.spend / totalAllSpend) * 100 : 0;

    let status = 'Scaling Steady';
    let statusType = 'normal';
    let recommendation = `Lead channel is ${topChannel} delivering ${exSym}${formatShort(maxChSpend)}.`;

    if (entry.spend === 0 && entry.impressions === 0) {
      status = 'Pre-Launch';
      statusType = 'neutral';
      recommendation = 'Campaign scheduled; awaiting telemetry ingestion.';
    } else if (cpa > 0 && cpa < 30) {
      status = 'High Efficiency';
      statusType = 'success';
      recommendation = `Strong CPA of ${exSym}${cpa.toFixed(2)}. Prime candidate for increased budget pacing.`;
    } else if (ctr > 1.2) {
      status = 'Strong Engagement';
      statusType = 'highlight';
      recommendation = `Engagement CTR at ${ctr.toFixed(2)}% led by ${topChannel}. Maintain audience cadence.`;
    } else if (spendShare > 25) {
      status = 'Primary Volume Driver';
      statusType = 'primary';
      recommendation = `Anchors ${spendShare.toFixed(1)}% of total portfolio spend. Closely monitor CPM pace.`;
    } else {
      status = 'Audience Exploration';
      statusType = 'warning';
      recommendation = `Optimize audience targeting on ${topChannel} to boost engagement.`;
    }

    results.push({
      id: name,
      name,
      portfolio: entry.portfolio,
      spend: entry.spend,
      spendShare,
      impressions: entry.impressions,
      clicks: entry.clicks,
      purchases: Math.round(entry.purchases),
      ctr,
      cpm,
      cpa,
      topChannel,
      status,
      statusType,
      recommendation
    });
  });

  return results.sort((a, b) => b.spend - a.spend);
}

/**
 * 7. Portfolio Strategic Breakdown
 * Aggregates all telemetry across Portfolios (P1 Flagship vs P3 Specialized)
 * providing side-by-side volume, efficiency, and channel distribution.
 */
export function computePortfolioBreakdown(adData = [], exRate = 1, exSym = '$', formatShort = (n) => String(n)) {
  if (!adData || adData.length === 0) return [];

  const portfolioMap = new Map();
  let totalAllSpend = 0;

  adData.forEach(row => {
    const rawPort = (row.portfolio || 'P1').trim().toUpperCase();
    const portKey = rawPort.startsWith('P3') ? 'P3' : 'P1';
    const portLabel = portKey === 'P1' ? 'Portfolio 1 (Flagship)' : 'Portfolio 3 (Specialized)';
    const spend = (Number(row.cost) || Number(row.spend) || 0) * exRate;
    const impressions = Number(row.impressions || 0);
    const clicks = Number(row.clicks || 0);
    const purchases = Number(row.purchases || row.conversions || 0);
    const channel = row.channel || 'Unknown';
    const eventName = (row.eventNameDB || '').trim();

    totalAllSpend += spend;

    if (!portfolioMap.has(portKey)) {
      portfolioMap.set(portKey, {
        id: portKey,
        name: portLabel,
        key: portKey,
        spend: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        events: new Set(),
        channels: new Map()
      });
    }

    const p = portfolioMap.get(portKey);
    p.spend += spend;
    p.impressions += impressions;
    p.clicks += clicks;
    p.purchases += purchases;
    if (eventName && eventName !== 'Unknown') p.events.add(eventName);

    const chSp = p.channels.get(channel) || 0;
    p.channels.set(channel, chSp + spend);
  });

  const results = [];
  portfolioMap.forEach((p, key) => {
    let topChannel = 'Multi-Channel';
    let maxSpend = 0;
    p.channels.forEach((sp, ch) => {
      if (sp > maxSpend) {
        maxSpend = sp;
        topChannel = ch;
      }
    });

    const ctr = p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0;
    const cpm = p.impressions > 0 ? (p.spend / p.impressions) * 1000 : 0;
    const cpa = p.purchases > 0 ? p.spend / p.purchases : 0;
    const spendShare = totalAllSpend > 0 ? (p.spend / totalAllSpend) * 100 : 0;

    let recommendation = '';
    if (key === 'P1') {
      recommendation = `Primary volume driver anchoring ${spendShare.toFixed(1)}% of budget across ${p.events.size} flagship events. Primary channel is ${topChannel}.`;
    } else {
      recommendation = `High-efficiency specialist cluster with ${p.events.size} focused events. Blended CPA is ${cpa > 0 ? `${exSym}${cpa.toFixed(2)}` : 'optimized'}.`;
    }

    results.push({
      id: key,
      name: p.name,
      key,
      spend: p.spend,
      spendShare,
      impressions: p.impressions,
      clicks: p.clicks,
      purchases: Math.round(p.purchases),
      eventCount: p.events.size,
      eventList: Array.from(p.events),
      ctr,
      cpm,
      cpa,
      topChannel,
      recommendation
    });
  });

  return results.sort((a, b) => b.spend - a.spend);
}

/**
 * 8. Daily Next Steps by Event, Channel, and Event Type
 * Generates concrete, deterministic daily tactical actions based on 
 * telemetry velocity, benchmark efficiency, and event type objectives.
 */
export function computeDailyNextSteps(adData = [], exRate = 1, exSym = '$', formatShort = (n) => String(n)) {
  if (!adData || adData.length === 0) return [];

  // Group by (Event, Channel, Event Type)
  const groupMap = new Map();

  adData.forEach(row => {
    const eventName = (row.eventNameDB || 'Unknown').trim();
    if (!eventName || eventName === 'Unknown') return;

    const channel = (row.channel || 'Unknown').trim();
    let eventType = (row.eventTypeDB || '').trim();
    if (!eventType || eventType === 'Unknown') {
      eventType = eventName.toUpperCase().includes('BLACK HAT') ? 'Visprom' : 'Exhibition';
    }

    const key = `${eventName}:::${channel}:::${eventType}`;
    const spend = (Number(row.cost) || Number(row.spend) || 0) * exRate;
    const impressions = Number(row.impressions || 0);
    const clicks = Number(row.clicks || 0);
    const purchases = Number(row.purchases || row.conversions || 0);

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        id: key,
        event: eventName,
        channel,
        eventType,
        spend: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0
      });
    }

    const g = groupMap.get(key);
    g.spend += spend;
    g.impressions += impressions;
    g.clicks += clicks;
    g.purchases += purchases;
  });

  const steps = [];

  groupMap.forEach(item => {
    if (item.spend === 0 && item.impressions === 0) return;

    const ctr = item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0;
    const cpm = item.impressions > 0 ? (item.spend / item.impressions) * 1000 : 0;
    const cpa = item.purchases > 0 ? item.spend / item.purchases : 0;
    const convCount = Math.round(item.purchases);

    let priority = 'Normal';
    let priorityColor = 'text-blue-300 bg-blue-500/20 border-blue-500/30';
    let actionType = 'Scale & Maintain';
    let dailyAction = '';
    let rationale = '';

    const isExprom = item.eventType.toLowerCase().includes('exprom') || item.eventType.toLowerCase().includes('exhibit');
    const isVisprom = item.eventType.toLowerCase().includes('visprom') || item.eventType.toLowerCase().includes('visitor');

    if (item.spend > 1000 && item.purchases === 0) {
      priority = 'Urgent Action';
      priorityColor = 'text-rose-300 bg-rose-500/20 border-rose-500/40';
      actionType = 'Spend Audit';
      if (isExprom) {
        dailyAction = `Audit B2B lead capture form; tighten job title exclusions on ${item.channel} to prevent budget bleed on non-decision makers.`;
        rationale = `Zero exhibitor conversions tracked across ${exSym}${formatShort(item.spend)} delivered spend.`;
      } else {
        dailyAction = `Verify tracking pixel on thank-you page; pause bottom 20% underperforming creative variants on ${item.channel}.`;
        rationale = `Zero conversions recorded despite ${item.clicks.toLocaleString()} clicks on ${item.channel}.`;
      }
    } else if (cpa > 65) {
      priority = 'High Priority';
      priorityColor = 'text-amber-300 bg-amber-500/20 border-amber-500/40';
      actionType = 'Audience Refinement';
      if (item.channel.toLowerCase().includes('meta')) {
        dailyAction = `Shift budget towards lookalike audiences (1-2%) of registered attendees; refresh ad visual to reduce fatigue.`;
      } else if (item.channel.toLowerCase().includes('google')) {
        dailyAction = `Add negative keywords for non-commercial search intent; adjust device bids to favor high-converting desktop visitors.`;
      } else if (item.channel.toLowerCase().includes('linkedin')) {
        dailyAction = `Narrow company size targeting to 50+ employees; switch ad creative from single image to carousel highlighting keynote speakers.`;
      } else {
        dailyAction = `Cap daily frequency to 2.5 impressions per user; test short-form video creative featuring event venue preview.`;
      }
      rationale = `Current CPA of ${exSym}${cpa.toFixed(2)} is above efficient threshold.`;
    } else if (cpa > 0 && cpa <= 30 && ctr >= 1.0) {
      priority = 'Scale Opportunity';
      priorityColor = 'text-emerald-300 bg-emerald-500/20 border-emerald-500/30';
      actionType = 'Scale Budget';
      if (isVisprom) {
        dailyAction = `Increase daily budget cap by +15% on ${item.channel}; expand lookalike seed audience to sustain low ${exSym}${cpa.toFixed(2)} acquisition.`;
      } else if (isExprom) {
        dailyAction = `Increase direct outreach budget allocation; test dedicated booth enquiry landing page with 1-click booking.`;
      } else {
        dailyAction = `Scale campaign delivery; clone winning ad creative into adjacent regional markets.`;
      }
      rationale = `Optimal CPA (${exSym}${cpa.toFixed(2)}) and healthy CTR (${ctr.toFixed(2)}%) across ${convCount.toLocaleString()} conversions.`;
    } else if (ctr > 1.4) {
      priority = 'Engagement Winner';
      priorityColor = 'text-[#cedc28] bg-[#cedc28]/20 border-[#cedc28]/40';
      actionType = 'Retargeting Ramp';
      dailyAction = `Build 30-day engagement audience from ${item.channel} clicks (${item.clicks.toLocaleString()} clicks) and funnel into conversion retargeting sequence.`;
      rationale = `Exceptional engagement pace with ${ctr.toFixed(2)}% CTR and ${exSym}${cpm.toFixed(2)} CPM.`;
    } else {
      priority = 'Routine Pacing';
      priorityColor = 'text-slate-300 bg-white/10 border-white/20';
      actionType = 'Monitor Cadence';
      dailyAction = `Maintain standard daily pacing; review 48h conversion attribution on ${item.channel}.`;
      rationale = `Delivery is pacing within standard parameters with ${formatShort(item.impressions)} impressions.`;
    }

    steps.push({
      id: item.id,
      event: item.event,
      channel: item.channel,
      eventType: item.eventType,
      spend: item.spend,
      impressions: item.impressions,
      clicks: item.clicks,
      purchases: convCount,
      ctr,
      cpm,
      cpa,
      priority,
      priorityColor,
      actionType,
      dailyAction,
      rationale
    });
  });

  const priorityOrder = {
    'Urgent Action': 1,
    'High Priority': 2,
    'Scale Opportunity': 3,
    'Engagement Winner': 4,
    'Routine Pacing': 5
  };

  return steps.sort((a, b) => (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99) || b.spend - a.spend);
}

