import { describe, expect, it } from 'vitest';
import { calculateOperations } from '../operational-model';
import { HYPOTHESES, incidentEvidence } from '../incident-deduction';
import {
  advanceDailyCampaign, CAMPAIGN_LENGTH, chooseDailyMarket,
  concedeDailyIncident, createDailyCampaign, dailyCampaignOutcome, dailyMarketEvent,
  dailyScore, developmentDays, investigateDailyIncident, nextDailyMonth,
  prepareDailyOperations, repairDailyIncident, quoteDailyRepair,
  submitIncidentHypothesis, runUntilDecision, skipDailyFeature,
  startDailyDevelopment, type DailyCampaignState, type DailyCause, type RepairChoice,
} from '../daily-campaign';

const FIX: Record<DailyCause, RepairChoice> = {
  SEARCH_SCAN: 'INDEX',
  STORAGE_IO: 'OBJECT_STORAGE',
  QUEUE_CONSUMER: 'QUEUE_WORKERS',
  POOL_EXHAUSTION: 'POOL_TUNING',
  DB_CAPACITY: 'DB_SCALE',
  APP_CAPACITY: 'APP_SCALE',
  DEBT_REGRESSION: 'REFACTOR',
};

function chooseAffordable(s: DailyCampaignState): DailyCampaignState {
  const event = dailyMarketEvent(s);
  if (!event) throw Error('Expected market event');
  const safe = event.options.find((c) => c.trafficMultiplier <= 1.2 && s.cash + c.cashDelta >= 0);
  const choice = safe ?? event.options.find((c) => s.cash + c.cashDelta >= 0);
  if (!choice) throw Error('No affordable choice');
  return chooseDailyMarket(s, choice.id);
}

function recover(s: DailyCampaignState): DailyCampaignState {
  for (let i = 0; s.phase === 'incident' && i < 12; i++) {
    const cause = s.incident?.cause;
    if (!cause) throw Error('missing active cause');
    s = repairDailyIncident(s, FIX[cause]);
  }
  if (s.phase === 'incident') throw Error('Unable to recover');
  return s;
}

function play90(seed = 17, rush = false): DailyCampaignState {
  let s = createDailyCampaign(seed);
  const plan = ['SEARCH', 'ADS', 'NOTIFICATIONS'] as const;
  let iterations = 0;
  while (s.phase !== 'complete' && iterations++ < 240) {
    switch (s.phase) {
      case 'market': s = chooseAffordable(s); break;
      case 'planning': s = startDailyDevelopment(s, plan[s.month - 1], rush ? 'FAST_TRACK' : 'NORMAL'); break;
      case 'development':
      case 'operating': s = runUntilDecision(s, 30); break;
      case 'incident': s = recover(s); break;
      case 'report': s = nextDailyMonth(s); break;
      default: throw Error('Unknown phase');
    }
  }
  expect(iterations).toBeLessThan(240);
  return s;
}

describe('daily 90-day campaign', () => {
  it('requires a market decision before a one-per-month development commitment', () => {
    const s = createDailyCampaign();
    expect(s.phase).toBe('market');
    expect(s.day).toBe(1);
    expect(s.history).toHaveLength(0);
    expect(() => startDailyDevelopment(s, 'SEARCH', 'NORMAL')).toThrow();
    const planned = chooseAffordable(s);
    expect(planned.phase).toBe('planning');
    const invested = prepareDailyOperations(planned, 'INDEX');
    expect(invested.investments).toEqual(['INDEX']);
    expect(() => prepareDailyOperations(invested, 'APM')).toThrow('1회');
    const developing = startDailyDevelopment(invested, 'SEARCH', 'NORMAL');
    expect(developing.job?.total).toBe(8);
    expect(developing.cash).toBe(invested.cash - 180000);
    expect(() => startDailyDevelopment(developing, 'ADS', 'NORMAL')).toThrow();
  });

  it('Fast Track saves development days at the cost of technical debt and higher APP pressure', () => {
    const state = chooseAffordable(createDailyCampaign());
    const normal = startDailyDevelopment(state, 'SEARCH', 'NORMAL');
    const rushed = startDailyDevelopment(state, 'SEARCH', 'FAST_TRACK');
    expect(rushed.job!.total).toBeLessThan(normal.job!.total);
    expect(normal.debt).toBe(4);
    expect(rushed.debt).toBe(27);
    expect(rushed.ops.nodes.APP.demand).toBeGreaterThan(normal.ops.nodes.APP.demand);
    expect(developmentDays('SEARCH', 72, 'NORMAL')).toBeGreaterThan(developmentDays('SEARCH', 0, 'NORMAL'));
  });

  it('advances exactly one dated record per tick, including development before launch', () => {
    let s = startDailyDevelopment(chooseAffordable(createDailyCampaign()), 'SEARCH', 'NORMAL');
    const initialUsers = s.dau;
    s = advanceDailyCampaign(s);
    expect(s.day).toBe(2);
    expect(s.history.map((d) => d.day)).toEqual([1]);
    expect(s.features).toHaveLength(0);
    expect(s.dau).toBeGreaterThan(initialUsers);
    const elapsed = runUntilDecision(s, 30);
    expect(elapsed.history).toHaveLength(8);
    expect(elapsed.features).toContain('SEARCH');
    expect(elapsed.day).toBe(8); // incident interrupts the completed day
    expect(elapsed.phase).toBe('incident');
    const after = recover(elapsed);
    expect(after.day).toBe(9);
    expect(after.history).toHaveLength(8); // no duplicate D8 settlement
  });

  it('repair actions affect money and capacity, and diagnosis has measurable cost', () => {
    let s = startDailyDevelopment(chooseAffordable(createDailyCampaign()), 'SEARCH', 'NORMAL');
    s = runUntilDecision(s, 30);
    expect(s.phase).toBe('incident');
    const withoutAPM = investigateDailyIncident(s, 'logs');
    expect(withoutAPM.cash).toBe(s.cash - 10000);
    expect(withoutAPM.monthOutageMinutes).toBe(3);
    expect(investigateDailyIncident(withoutAPM, 'logs')).toBe(withoutAPM);
    const mitigated = repairDailyIncident(withoutAPM, 'THROTTLE');
    expect(mitigated.phase).toBe('incident');
    expect(mitigated.incident?.mitigated).toBe(true);
    const fixed = recover(mitigated);
    expect(fixed.features).toContain('SEARCH');
    expect(fixed.investments).toContain('INDEX');
    expect(fixed.phase).toBe('operating');
  });

  it('safely handles recovery from an incident opened on the last day of a month', () => {
    let s = chooseAffordable(createDailyCampaign());
    s = skipDailyFeature(s);
    for (let n = 0; n < 30; n++) s = advanceDailyCampaign(s);
    expect(s.phase).toBe('report');
    expect(s.day).toBe(30);
    expect(s.history).toHaveLength(30);
    s = nextDailyMonth(s);
    expect(s.day).toBe(31);
    expect(s.phase).toBe('market');
  });

  it('does not allow the same day to be financially settled twice after a surrendered incident', () => {
    let s = startDailyDevelopment(chooseAffordable(createDailyCampaign()), 'ADS', 'FAST_TRACK');
    s = runUntilDecision(s, 30);
    expect(s.phase).toBe('incident');
    const count = s.history.length;
    const finishedDay = s.day;
    s = concedeDailyIncident(s);
    expect(s.day).toBe(finishedDay + 1);
    expect(s.history).toHaveLength(count);
    const next = advanceDailyCampaign(s);
    expect(next.history.length).toBe(count + 1);
    expect(next.history.at(-1)?.day).toBe(finishedDay + 1);
  });

  it('marks all daily rows, resets monthly accounts, and finishes on Day 90', () => {
    const s = play90();
    expect(s.phase).toBe('complete');
    expect(s.day).toBe(CAMPAIGN_LENGTH);
    expect(s.history).toHaveLength(CAMPAIGN_LENGTH);
    expect(s.history.map((entry) => entry.day)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
    expect(s.reports).toHaveLength(3);
    expect(s.marketHistory).toHaveLength(3);
    expect(s.features).toEqual(['SEARCH', 'ADS', 'NOTIFICATIONS']);
    expect(s.reports.reduce((sum, report) => sum + report.healthyDays, 0)).toBe(s.healthyDays);
    expect(s.reports.reduce((sum, report) => sum + report.revenue, 0))
      .toBe(s.history.reduce((sum, entry) => sum + entry.revenue, 0));
    expect(s.reports.reduce((sum, report) => sum + report.cost, 0))
      .toBeGreaterThan(s.history.reduce((sum, entry) => sum + entry.expense, 0));
    expect(['won', 'survived']).toContain(dailyCampaignOutcome(s));
    expect(dailyScore(s)).toBeGreaterThan(0);
  });

  it('repeats the same 90-day campaign byte-for-byte for the same seed and actions', () => {
    expect(play90(17)).toEqual(play90(17));
    const a = play90(17);
    const b = play90(18);
    expect(a.history).toHaveLength(90);
    expect(b.history).toHaveLength(90);
    expect(a.marketHistory.map((e) => e.eventId)).not.toEqual(b.marketHistory.map((e) => e.eventId));
  });

  it('repeated rushed releases accumulate enough debt to demand a regression fix', () => {
    const rushed = play90(17, true);
    expect(rushed.history).toHaveLength(90);
    expect(rushed.history.some((d) => d.debt >= 55)).toBe(true);
    expect(rushed.journal.some((entry) => entry.includes('DEBT_REGRESSION'))).toBe(true);
    expect(rushed.debt).toBeLessThan(81);
  });

  it('charges outage minutes as user churn and trust loss, not only cash', () => {
    let s = startDailyDevelopment(chooseAffordable(createDailyCampaign()), 'SEARCH', 'NORMAL');
    s = runUntilDecision(s, 30);
    expect(s.phase).toBe('incident');
    const inspected = investigateDailyIncident(s, 'logs');
    expect(inspected.dau).toBeLessThan(s.dau);
    expect(inspected.trust).toBeLessThan(s.trust);
    expect(inspected.ops.nodes.DB.demand).toBeLessThanOrEqual(s.ops.nodes.DB.demand);
    const resolved = recover(inspected);
    expect(resolved.dau).toBeLessThan(inspected.dau);
    expect(resolved.trust).toBeLessThan(inspected.trust);
    expect(resolved.monthOutageMinutes).toBeGreaterThan(0);
  });

  it('supports buying successive APP and DB tiers when one scale-up is insufficient', () => {
    const base = chooseAffordable(createDailyCampaign());
    const first = prepareDailyOperations(base, 'DB_SCALE');
    expect(first.ops.nodes.DB.capacity).toBeGreaterThan(base.ops.nodes.DB.capacity);
    // A new month may buy another tier. A one-time investment cannot be repeated.
    const oneTier = calculateOperations(['SEARCH', 'ADS'], ['INDEX', 'POOL_TUNING', 'DB_SCALE'], 4000);
    const twoTiers = calculateOperations(['SEARCH', 'ADS'], ['INDEX', 'POOL_TUNING', 'DB_SCALE', 'DB_SCALE'], 4000);
    expect(twoTiers.nodes.DB.capacity).toBe(oneTier.nodes.DB.capacity + 100);
    expect(twoTiers.nodes.DB.ratio).toBeLessThan(oneTier.nodes.DB.ratio);
  });

  it('requires two independent probes before verifying a root-cause hypothesis', () => {
    let s = startDailyDevelopment(chooseAffordable(createDailyCampaign()), 'SEARCH', 'NORMAL');
    s = runUntilDecision(s, 30);
    expect(s.phase).toBe('incident');
    expect(s.incident?.cause).toBe('SEARCH_SCAN');
    expect(() => submitIncidentHypothesis(s, 'SEARCH_SCAN')).toThrow('증거');
    s = investigateDailyIncident(s, 'metrics');
    expect(() => submitIncidentHypothesis(s, 'SEARCH_SCAN')).toThrow('증거');
    s = investigateDailyIncident(s, 'logs');
    const verified = submitIncidentHypothesis(s, 'SEARCH_SCAN');
    expect(verified.incident?.verifiedHypothesis).toBe('SEARCH_SCAN');
    expect(verified.verifiedDiagnoses).toBe(1);
    expect(verified.monthVerifiedDiagnoses).toBe(1);
    expect(verified.cash).toBe(s.cash);
    expect(submitIncidentHypothesis(verified, 'SEARCH_SCAN')).toThrow('이미');
    const standardQuote = quoteDailyRepair(s, 'INDEX');
    const verifiedQuote = quoteDailyRepair(verified, 'INDEX');
    expect(verifiedQuote.cost).toBeLessThan(standardQuote.cost);
    expect(verifiedQuote.minutes).toBe(standardQuote.minutes - 3);
    const fixed = repairDailyIncident(verified, 'INDEX');
    expect(fixed.cash).toBe(verified.cash - verifiedQuote.cost);
    expect(fixed.monthCost).toBe(verified.monthCost + verifiedQuote.cost);
    expect(fixed.phase).toBe('operating');
  });

  it('wrong hypotheses consume cash, time and trust without giving repair discounts', () => {
    let s = startDailyDevelopment(chooseAffordable(createDailyCampaign()), 'SEARCH', 'NORMAL');
    s = runUntilDecision(s, 30);
    s = investigateDailyIncident(investigateDailyIncident(s, 'metrics'), 'trace');
    const noDiscount = quoteDailyRepair(s, 'INDEX');
    const wrong = submitIncidentHypothesis(s, 'DB_CAPACITY');
    expect(wrong.incident?.verifiedHypothesis).toBeNull();
    expect(wrong.incident?.hypotheses).toEqual([{ id: 'DB_CAPACITY', matched: false, evidenceCount: 2 }]);
    expect(wrong.incorrectDiagnoses).toBe(1);
    expect(wrong.monthIncorrectDiagnoses).toBe(1);
    expect(wrong.cash).toBe(s.cash - 20000);
    expect(wrong.monthOutageMinutes).toBe(s.monthOutageMinutes + 7);
    expect(wrong.trust).toBeLessThan(s.trust);
    expect(quoteDailyRepair(wrong, 'INDEX')).toEqual(noDiscount);
    expect(submitIncidentHypothesis(wrong, 'DB_CAPACITY')).toBe(wrong);
    const anotherWrong = submitIncidentHypothesis(wrong, 'APP_CAPACITY');
    expect(() => submitIncidentHypothesis(anotherWrong, 'SEARCH_SCAN')).toThrow('기회');
    expect(repairDailyIncident(anotherWrong, 'INDEX').phase).toBe('operating');
  });

  it('the exact same DB utilization is compatible with multiple causes until logs/traces', () => {
    const snapshot = calculateOperations(['SEARCH', 'ADS'], ['INDEX', 'POOL_TUNING'], 2100, 1.3, 15);
    const query = incidentEvidence('SEARCH_SCAN', 'metrics', snapshot, 15);
    const capacity = incidentEvidence('DB_CAPACITY', 'metrics', snapshot, 15);
    expect(query).toBe(capacity);
    expect(incidentEvidence('SEARCH_SCAN', 'trace', snapshot, 15))
      .not.toBe(incidentEvidence('DB_CAPACITY', 'trace', snapshot, 15));
    expect(incidentEvidence('POOL_EXHAUSTION', 'logs', snapshot, 15))
      .not.toBe(incidentEvidence('SEARCH_SCAN', 'logs', snapshot, 15));
    expect(HYPOTHESES).toHaveLength(7);
    expect(new Set(HYPOTHESES.map((option) => option.id)).size).toBe(7);
  });

  it('monthly reporting and final scoring include evidence-based deductions', () => {
    let s = startDailyDevelopment(chooseAffordable(createDailyCampaign()), 'SEARCH', 'NORMAL');
    s = runUntilDecision(s, 30);
    s = investigateDailyIncident(investigateDailyIncident(s, 'logs'), 'trace');
    const correct = submitIncidentHypothesis(s, 'SEARCH_SCAN');
    const fixed = repairDailyIncident(correct, 'INDEX');
    let end = fixed;
    for (let i = 0; i < 30 && end.phase !== 'report'; i++) {
      end = runUntilDecision(end, 30);
      if (end.phase === 'incident') end = recover(end);
    }
    expect(end.phase).toBe('report');
    expect(end.reports[0].verifiedDiagnoses).toBe(1);
    expect(end.reports[0].incorrectDiagnoses).toBe(0);
    const baseline = { ...end, verifiedDiagnoses: 0 };
    expect(dailyScore(end)).toBeGreaterThan(dailyScore(baseline));
    const next = nextDailyMonth(end);
    expect(next.verifiedDiagnoses).toBe(1);
    expect(next.monthVerifiedDiagnoses).toBe(0);
  });

  it('has robust invalid-action guards and resolves loans only through player actions', () => {
    const s = createDailyCampaign();
    expect(() => advanceDailyCampaign(s)).toThrow();
    expect(() => nextDailyMonth(s)).toThrow();
    expect(() => repairDailyIncident(s, 'INDEX')).toThrow();
    expect(() => investigateDailyIncident(s, 'metrics')).toThrow();
    expect(() => runUntilDecision(s, 0)).toThrow();
    expect(() => createDailyCampaign(3.14)).toThrow();
    const prepared = chooseAffordable(s);
    expect(() => chooseDailyMarket(prepared, 'embrace')).toThrow();
    expect(() => startDailyDevelopment(prepared, 'SEARCH', 'FAST_TRACK')).not.toThrow();
  });
});
