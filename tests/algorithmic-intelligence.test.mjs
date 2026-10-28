import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateStrategicCommentary,
  computeChannelQuadrants,
  simulateBudgetReallocation,
  computeLaunchForecast,
  computeCreativeFatigue,
  computeEventsBreakdown,
  computePortfolioBreakdown,
  computeDailyNextSteps
} from '../lib/algorithmicIntelligence.mjs';

test('Algorithmic Intelligence: Strategic Commentary Generation', () => {
  const empty = generateStrategicCommentary([], []);
  assert.deepEqual(empty, []);

  const sampleChannels = [
    { channel: 'Meta', cost: 12000, impressions: 800000, clicks: 12000, purchases: 400 }, // CPA: 30, CTR: 1.5%
    { channel: 'Google Search', cost: 6000, impressions: 100000, clicks: 8000, purchases: 500 }, // CPA: 12, CTR: 8.0%
    { channel: 'LinkedIn', cost: 4000, impressions: 50000, clicks: 500, purchases: 40 } // CPA: 100, CTR: 1.0%
  ];

  const totals = { impressions: 950000, clicks: 20500, cost: 22000, ctr: 2.16 };
  const insights = generateStrategicCommentary([], sampleChannels, totals, '$', 1);

  assert(insights.length >= 2, 'Generates multiple actionable insights');
  
  // Verify Pacing Summary
  const pacing = insights.find(i => i.type === 'pacing');
  assert(pacing, 'Includes volume anchor pacing summary');
  assert(pacing.headline.includes('Meta'), 'Identifies Meta as anchor');

  // Verify Reallocation Opportunity
  const opportunity = insights.find(i => i.type === 'opportunity');
  assert(opportunity, 'Identifies capital reallocation opportunity');
  assert(opportunity.headline.includes('Google Search'), 'Recommends shift towards lowest CPA channel');

  // Verify Elevated CPA Alert
  const alert = insights.find(i => i.type === 'alert');
  assert(alert, 'Flags elevated CPA for LinkedIn');
  assert(alert.headline.includes('LinkedIn'), 'Identifies LinkedIn as cost sink anomaly');
});

test('Algorithmic Intelligence: Channel Efficiency Quadrant Matrix', () => {
  const empty = computeChannelQuadrants([]);
  assert.deepEqual(empty.quadrants.star, []);

  const sampleChannels = [
    { channel: 'Meta', cost: 20000, conversions: 800 },         // High Spend, Low CPA ($25) -> Star
    { channel: 'TikTok', cost: 18000, conversions: 200 },       // High Spend, High CPA ($90) -> Cost Sink
    { channel: 'Google Search', cost: 5000, conversions: 500 }, // Low Spend, Low CPA ($10) -> Niche Driver
    { channel: 'Twitter / X', cost: 4000, conversions: 30 }     // Low Spend, High CPA ($133) -> Observation
  ];

  const { quadrants, benchmarks } = computeChannelQuadrants(sampleChannels);

  assert(benchmarks.channelCount === 4);
  assert(benchmarks.medianSpend > 0);
  assert(benchmarks.medianCPA > 0);

  assert(quadrants.star.some(c => c.name === 'Meta'), 'Meta placed in Star Performer');
  assert(quadrants.cost_sink.some(c => c.name === 'TikTok'), 'TikTok placed in Cost Sink');
  assert(quadrants.niche.some(c => c.name === 'Google Search'), 'Google Search placed in Niche Driver');
  assert(quadrants.observation.some(c => c.name === 'Twitter / X'), 'X placed in Under Observation');
});

test('Algorithmic Intelligence: Diminishing Return Budget Simulator', () => {
  const sampleChannels = [
    { channel: 'Meta', cost: 10000, purchases: 400 },
    { channel: 'Google', cost: 5000, purchases: 300 }
  ];

  // Shift: -20% from Meta, +40% to Google
  const shifts = { Meta: -20, Google: 40 };
  const simulation = simulateBudgetReallocation(sampleChannels, shifts);

  assert.equal(simulation.channels.length, 2);
  const metaSim = simulation.channels.find(c => c.channel === 'Meta');
  const googleSim = simulation.channels.find(c => c.channel === 'Google');

  assert.equal(metaSim.simCost, 8000);
  assert.equal(googleSim.simCost, 7000);

  // Diminishing returns: Google spend increased by 40%, conversions increase but not by 40% (elasticity < 1.0)
  assert(googleSim.simConv > 300, 'Conversions increased with higher spend');
  assert(googleSim.simConv < 420, 'Diminishing marginal returns prevent linear multiplication');

  assert.equal(simulation.totals.simulatedCost, 15000);
  assert(simulation.totals.simulatedConversions > 0);
});

test('Algorithmic Intelligence: Event Launch Forecaster', () => {
  const deliveredCost = 50000;
  const targetBudget = 100000;
  
  // Future launch date (45 days ahead)
  const futureDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
  // Past start date (30 days ago)
  const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const forecast = computeLaunchForecast(deliveredCost, targetBudget, futureDate, pastDate);

  assert(forecast.remainingDays > 0);
  assert(forecast.currentDailyBurn > 0);
  assert(forecast.requiredDailyBurn > 0);
  assert(forecast.projectedFinishCost > deliveredCost);
  assert(['on_track', 'under_pacing', 'over_pacing'].includes(forecast.status));
});

test('Algorithmic Intelligence: Creative Fatigue Radar', () => {
  const empty = computeCreativeFatigue([]);
  assert.deepEqual(empty, []);

  const creatives = [
    { id: 'ad-1', title: 'Video Hero Intro', impressions: 65000, clicks: 200, cost: 1500 }, // CTR: ~0.3% -> Fatigued
    { id: 'ad-2', title: 'Speaker Announcement', impressions: 30000, clicks: 240, cost: 800 }, // CTR: ~0.8% -> Warning
    { id: 'ad-3', title: 'Early Bird Discount', impressions: 8000, clicks: 240, cost: 400, conversions: 25 } // CTR: 3.0% -> Top Performer
  ];

  const evaluated = computeCreativeFatigue(creatives);

  assert.equal(evaluated.length, 3);
  assert.equal(evaluated[0].fatigueState, 'fatigued', 'Highest fatigue score ad is ranked first');
  assert.equal(evaluated[0].id, 'ad-1');
  assert(evaluated.some(ad => ad.fatigueState === 'top_performer'));
});

test('Algorithmic Intelligence: Events & Portfolio Breakdown Synthesis', () => {
  const sampleAdData = [
    { eventNameDB: 'KoG 26', portfolio: 'P1', channel: 'Meta', cost: 10000, impressions: 500000, clicks: 10000, purchases: 300 },
    { eventNameDB: 'KoG 26', portfolio: 'P1', channel: 'Google', cost: 5000, impressions: 100000, clicks: 8000, purchases: 400 },
    { eventNameDB: 'Black Hat', portfolio: 'P1', channel: 'LinkedIn', cost: 8000, impressions: 150000, clicks: 2000, purchases: 100 },
    { eventNameDB: 'SMLC 26', portfolio: 'P3', channel: 'Meta', cost: 6000, impressions: 200000, clicks: 3000, purchases: 150 },
    { eventNameDB: 'BIO 26', portfolio: 'P3', channel: 'Google', cost: 4000, impressions: 120000, clicks: 2400, purchases: 120 }
  ];

  // 1. Events Breakdown
  const events = computeEventsBreakdown(sampleAdData, 1, '$');
  assert.equal(events.length, 4, 'Aggregates 4 distinct events');
  assert.equal(events[0].name, 'KoG 26', 'Top spend event ranked first');
  assert.equal(events[0].spend, 15000);
  assert.equal(events[0].topChannel, 'Meta');
  assert(events[0].cpa > 0);
  assert(events[0].ctr > 0);
  assert(events[0].recommendation.length > 0);
  assert(['P1', 'P3'].includes(events[0].portfolio));

  // 2. Portfolio Breakdown
  const portfolios = computePortfolioBreakdown(sampleAdData, 1, '$');
  assert.equal(portfolios.length, 2, 'Groups into P1 and P3');
  const p1 = portfolios.find(p => p.key === 'P1');
  const p3 = portfolios.find(p => p.key === 'P3');

  assert.equal(p1.spend, 23000);
  assert.equal(p1.eventCount, 2);
  assert(p1.eventList.includes('KoG 26') && p1.eventList.includes('Black Hat'));
  assert.equal(p3.spend, 10000);
  assert.equal(p3.eventCount, 2);
  assert(p3.eventList.includes('SMLC 26') && p3.eventList.includes('BIO 26'));
  assert(p1.spendShare > p3.spendShare);
});

test('Algorithmic Intelligence: Daily Next Steps by Event, Channel, and Event Type', () => {
  const sampleAdData = [
    { eventNameDB: 'KoG 26', portfolio: 'P1', channel: 'Meta', eventTypeDB: 'Visprom', cost: 5000, impressions: 400000, clicks: 8000, purchases: 250 },
    { eventNameDB: 'Black Hat', portfolio: 'P1', channel: 'LinkedIn', eventTypeDB: 'Exprom', cost: 12000, impressions: 80000, clicks: 600, purchases: 15 },
    { eventNameDB: 'SMLC 26', portfolio: 'P3', channel: 'TikTok', eventTypeDB: 'Visprom', cost: 3000, impressions: 300000, clicks: 6000, purchases: 0 }
  ];

  const steps = computeDailyNextSteps(sampleAdData, 1, '$');
  assert.equal(steps.length, 3, 'Generates 3 next step actions');

  // Verify urgent / audit action on zero-conversion spend
  const zeroConv = steps.find(s => s.event === 'SMLC 26');
  assert(zeroConv);
  assert.equal(zeroConv.priority, 'Urgent Action');
  assert(zeroConv.dailyAction.includes('tracking pixel') || zeroConv.dailyAction.includes('underperforming'));

  // Verify scale opportunity on high-efficiency KoG Visprom
  const kogStep = steps.find(s => s.event === 'KoG 26');
  assert(kogStep);
  assert.equal(kogStep.priority, 'Scale Opportunity');
  assert(kogStep.dailyAction.includes('budget') || kogStep.dailyAction.includes('Scale'));
  assert(kogStep.eventType === 'Visprom');

  // Verify Exprom exhibitor guidance on Black Hat LinkedIn
  const bhStep = steps.find(s => s.event === 'Black Hat');
  assert(bhStep);
  assert.equal(bhStep.eventType, 'Exprom');
  assert(bhStep.dailyAction.includes('LinkedIn') || bhStep.dailyAction.includes('company size'));
});


