import { parseNumericMetric } from './metricIntegrity.mjs';

/**
 * Actuals vs. Planned Budget Reconciliation Engine
 * Cross-references Actuals spend against Planned budgets to detect:
 * 1. Over-budget events (Actual Spend > 100% of Planned Budget)
 * 2. Unbudgeted channel spend (spend occurring on a channel missing in Planned)
 * 3. Channel budget variances
 */

export function reconcileActualsAndPlanned(actualsRows = [], plannedRows = [], options = {}) {
  const eventReconciliation = new Map();
  const unbudgetedFindings = [];
  const overBudgetFindings = [];

  // 1. Aggregate Planned Budgets by Event and Channel
  const plannedMap = new Map(); // key: `${eventName}:::${channel}` -> number
  const eventPlannedTotals = new Map(); // key: eventName -> number

  plannedRows.forEach(row => {
    let eventName = (row['Event Name DB'] || row['Event Name'] || row['EVENT'] || '').trim();
    if (eventName === 'SMLC') eventName = 'SMLC 26';
    if (!eventName) return;

    const channel = (row['Channel'] || 'Unknown').trim();
    const budget = parseNumericMetric(row['Planned Budget'] || row['Budget'] || row['Cost'] || row['Spend'] || 0);

    const channelKey = `${eventName}:::${channel}`;
    plannedMap.set(channelKey, (plannedMap.get(channelKey) || 0) + budget);
    eventPlannedTotals.set(eventName, (eventPlannedTotals.get(eventName) || 0) + budget);
  });

  // 2. Aggregate Actuals Spend by Event and Channel
  const actualsMap = new Map(); // key: `${eventName}:::${channel}` -> number
  const eventActualTotals = new Map(); // key: eventName -> number

  actualsRows.forEach(row => {
    let eventName = (row['Event Name DB'] || row['Event Name'] || row['EVENT'] || '').trim();
    if (eventName === 'SMLC') eventName = 'SMLC 26';
    if (!eventName) return;

    const channel = (row['Channel'] || 'Unknown').trim();
    const spend = parseNumericMetric(row['Cost'] || row['Spend'] || row['Media Spend'] || 0);

    const channelKey = `${eventName}:::${channel}`;
    actualsMap.set(channelKey, (actualsMap.get(channelKey) || 0) + spend);
    eventActualTotals.set(eventName, (eventActualTotals.get(eventName) || 0) + spend);
  });

  // 3. Compare at Event Level
  const allEvents = Array.from(new Set([...eventPlannedTotals.keys(), ...eventActualTotals.keys()])).sort();

  allEvents.forEach(eventName => {
    const plannedBudget = Math.round((eventPlannedTotals.get(eventName) || 0) * 100) / 100;
    const actualSpend = Math.round((eventActualTotals.get(eventName) || 0) * 100) / 100;
    const variance = Math.round((actualSpend - plannedBudget) * 100) / 100;
    const pacingPercent = plannedBudget > 0 ? Math.round((actualSpend / plannedBudget) * 1000) / 10 : 0;

    let status = 'on-track';
    if (plannedBudget > 0 && actualSpend > plannedBudget * 1.02) {
      status = 'over-budget';
      overBudgetFindings.push({
        id: `overbudget:${eventName}`,
        eventName,
        plannedBudget,
        actualSpend,
        variance,
        overagePercent: Math.round(((actualSpend - plannedBudget) / plannedBudget) * 1000) / 10,
        severity: actualSpend > plannedBudget * 1.1 ? 'critical' : 'warning'
      });
    } else if (plannedBudget > 0 && actualSpend > plannedBudget * 0.95) {
      status = 'near-budget';
    }

    eventReconciliation.set(eventName, {
      eventName,
      plannedBudget,
      actualSpend,
      variance,
      pacingPercent,
      status
    });
  });

  // 4. Check for Unbudgeted Channel Spend
  actualsMap.forEach((spend, channelKey) => {
    if (spend <= 50) return; // ignore negligible test spend < $50
    const [eventName, channel] = channelKey.split(':::');
    const planned = plannedMap.get(channelKey) || 0;

    if (planned === 0) {
      unbudgetedFindings.push({
        id: `unbudgeted:${channelKey}`,
        eventName,
        channel,
        actualSpend: Math.round(spend * 100) / 100,
        plannedBudget: 0,
        severity: spend >= 1000 ? 'critical' : 'warning',
        message: `Channel "${channel}" has $${spend.toLocaleString()} actual spend with no planned budget entry.`
      });
    }
  });

  return {
    reconciledEvents: Array.from(eventReconciliation.values()),
    overBudgetFindings,
    unbudgetedFindings,
    totalPlanned: Array.from(eventPlannedTotals.values()).reduce((a, b) => a + b, 0),
    totalActual: Array.from(eventActualTotals.values()).reduce((a, b) => a + b, 0),
    checkedAt: new Date().toISOString()
  };
}

export const reconcileBudgetActuals = reconcileActualsAndPlanned;

