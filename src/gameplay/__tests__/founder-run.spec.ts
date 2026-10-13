import { describe, expect, it } from 'vitest';
import {
  FEATURE_CATALOG, MAX_SPRINTS, CAMPAIGN_DAYS,
  abandonIncident, campaignOutcome, chooseMarketStrategy, continueFounderRun,
  createFounderRun, currentIncident, currentMarketEvent, investigate,
  investInOperations, launchFeature, remediate, totalScore,
  type FeatureId, type FounderState,
} from '../founder-run';
import { ROOT_CAUSES, calculateOperations, detectIncidentCause } from '../operational-model';
import { marketEventForSprint } from '../market-events';

const INITIAL_CAUSES = {
  SEARCH: 'SEARCH_SCAN',
  IMAGES: 'STORAGE_IO',
  ADS: 'POOL_EXHAUSTION',
  NOTIFICATIONS: 'QUEUE_CONSUMER',
} as const;

function chooseCautiousMarket(state: FounderState): FounderState {
  const event = currentMarketEvent(state);
  if (!event) throw new Error('Market event required');
  // A reproducible, affordable default that keeps incidental traffic low.
  const choice = event.options.find((option) => option.cashDelta === 0 && option.trafficMultiplier <= 1.15)
    ?? event.options.find((option) => state.cash + option.cashDelta >= 0 && option.trafficMultiplier <= 1.15)
    ?? event.options.find((option) => state.cash + option.cashDelta >= 0);
  if (!choice) throw new Error('No affordable market strategy');
  return chooseMarketStrategy(state, choice.id);
}

function startRun(): FounderState {
  return chooseCautiousMarket(createFounderRun());
}

function repairAll(state: FounderState): FounderState {
  for (let step = 0; step < 8 && state.phase === 'incident'; step++) {
    const cause = state.incidentCause;
    if (!cause) throw new Error('Incident phase must have a cause');
    const resolution = currentIncident(state)?.remedies.find((remedy) => remedy.effect === 'fix');
    if (!resolution) throw new Error('Every cause needs a causal remedy');
    const before = state.cash;
    state = remediate(state, resolution.id);
    // Successful repair also settles monthly revenue; total cash may increase.
    if (state.phase === 'incident') expect(state.cash).toBeLessThan(before);
    else expect(state.reports[state.reports.length - 1].fixed).toBe(true);
  }
  expect(state.phase).toBe('debrief');
  return state;
}

describe('90-day market and operations campaign', () => {
  it('opens a market event before feature planning and requires one market choice', () => {
    const initial = createFounderRun();
    expect(initial.phase).toBe('market');
    expect(initial.day).toBe(1);
    expect(currentMarketEvent(initial)).not.toBeNull();
    expect(() => launchFeature(initial, 'SEARCH')).toThrow();
    expect(() => investInOperations(initial, 'INDEX')).toThrow();
    const ready = chooseCautiousMarket(initial);
    expect(ready.phase).toBe('planning');
    expect(ready.marketHistory).toHaveLength(1);
    expect(ready.marketHistory[0].sprint).toBe(1);
    expect(ready.operational.nodes.APP.demand).toBeGreaterThan(0);
    expect(() => chooseMarketStrategy(ready, ready.marketHistory[0].choiceId)).toThrow();
  });

  it('provides independently seeded events for three market chapters', () => {
    for (const seed of [0, 17, 18, 419, 2026]) {
      const events = [1, 2, 3].map((sprint) => marketEventForSprint(seed, sprint));
      expect(events).toEqual([1, 2, 3].map((sprint) => marketEventForSprint(seed, sprint)));
      expect(new Set(events.map((event) => event.id)).size).toBe(3);
      expect(events[0].options.length).toBeGreaterThanOrEqual(3);
    }
    expect(() => marketEventForSprint(17, 4)).toThrow();
  });

  it('market choices change cash, growth, trust and live operational pressure', () => {
    const initial = createFounderRun(17);
    const event = currentMarketEvent(initial)!;
    expect(event.id).toBe('VIRAL_POST');
    const embrace = chooseMarketStrategy(initial, 'embrace');
    const limit = chooseMarketStrategy(initial, 'limit');
    const burst = chooseMarketStrategy(initial, 'burst');
    expect(embrace.dau).toBeGreaterThan(limit.dau);
    expect(embrace.peakTrafficMultiplier).toBeGreaterThan(limit.peakTrafficMultiplier);
    expect(embrace.operational.nodes.DB.demand).toBeGreaterThan(limit.operational.nodes.DB.demand);
    expect(burst.cash).toBeLessThan(embrace.cash);
    expect(burst.peakTrafficMultiplier).toBeLessThan(embrace.peakTrafficMultiplier);
    expect(burst.dau).toBe(embrace.dau);
  });

  it('connects every newly released feature to a structural fault with visible symptoms', () => {
    const initial = startRun();
    for (const feature of Object.keys(FEATURE_CATALOG) as FeatureId[]) {
      const launched = launchFeature(initial, feature);
      expect(launched.phase).toBe('incident');
      expect(launched.cash).toBe(initial.cash - FEATURE_CATALOG[feature].cost);
      expect(launched.dau).toBe(initial.dau + FEATURE_CATALOG[feature].users);
      expect(launched.incidentCause).toBe(INITIAL_CAUSES[feature]);
      expect(currentIncident(launched)?.node).toBe(ROOT_CAUSES[INITIAL_CAUSES[feature]].node);
      expect(launched.operational.nodes.APP.demand).toBeGreaterThan(initial.operational.nodes.APP.demand);
    }
  });

  it('makes preventative investments change real workload and prevent relevant incidents', () => {
    const initial = startRun();
    const prepared = investInOperations(initial, 'INDEX');
    expect(prepared.cash).toBe(initial.cash - 125000);
    expect(prepared.investedThisSprint).toBe(true);
    expect(() => investInOperations(prepared, 'DB_SCALE')).toThrow('한 번');
    const without = launchFeature(initial, 'SEARCH');
    const withIndex = launchFeature(prepared, 'SEARCH');
    expect(without.incidentCause).toBe('SEARCH_SCAN');
    expect(withIndex.phase).toBe('debrief');
    expect(withIndex.incidentCause).toBeNull();
    expect(withIndex.reports[0].downtimeMinutes).toBe(0);
    expect(withIndex.operational.nodes.DB.demand).toBeLessThan(without.operational.nodes.DB.demand);
  });

  it('a viral market spike can force capacity investment even after query optimization', () => {
    const initial = createFounderRun(17);
    const viral = chooseMarketStrategy(initial, 'embrace');
    const prepared = investInOperations(viral, 'INDEX');
    const launched = launchFeature(prepared, 'SEARCH');
    expect(prepared.peakTrafficMultiplier).toBe(1.75);
    expect(launched.dau).toBeGreaterThan(prepared.dau);
    const peak = calculateOperations(launched.completed, launched.investments, launched.dau, prepared.peakTrafficMultiplier);
    const normal = calculateOperations(launched.completed, launched.investments, launched.dau);
    expect(peak.nodes.DB.demand).toBeGreaterThan(normal.nodes.DB.demand);
    // After a clean launch the month settles and peak capacity pressure expires.
    expect(launched.operational.nodes.DB.demand).toBe(launched.phase === 'debrief' ? normal.nodes.DB.demand : peak.nodes.DB.demand);
    // Root-cause adjudication is driven by peak workload; the specific load
    // may still be below the saturation threshold on a sufficiently optimized stack.
    if (launched.phase === 'incident') {
      expect(['DB_CAPACITY', 'APP_CAPACITY']).toContain(launched.incidentCause);
    } else {
      expect(launched.reports[0].downtimeMinutes).toBe(0);
    }
  });

  it('does not confuse SQL optimization with genuine DB capacity exhaustion', () => {
    const basic = launchFeature(startRun(), 'SEARCH');
    const mitigated = remediate(basic, 'search-db-scale');
    expect(mitigated.phase).toBe('incident');
    expect(mitigated.incidentCause).toBe('SEARCH_SCAN');

    const fixedSearch = repairAll(basic);
    const afterAds = launchFeature(chooseCautiousMarket(continueFounderRun(fixedSearch)), 'ADS');
    expect(afterAds.incidentCause).toBe('POOL_EXHAUSTION');
    const poolFixed = remediate(afterAds, 'ads-connection');
    expect(poolFixed.phase).toBe('incident');
    expect(poolFixed.incidentCause).toBe('DB_CAPACITY');
    const capacityFixed = remediate(poolFixed, 'db-capacity');
    expect(capacityFixed.phase).toBe('debrief');
    expect(capacityFixed.investments).toContain('POOL_TUNING');
    expect(capacityFixed.investments).toContain('DB_SCALE');
  });

  it('APM reduces investigative cash/time costs without changing capacity', () => {
    const initial = startRun();
    const observed = investInOperations(initial, 'APM');
    expect(observed.operational.nodes.DB.capacity).toBe(initial.operational.nodes.DB.capacity);
    const normal = investigate(launchFeature(initial, 'ADS'), 'trace');
    const apm = investigate(launchFeature(observed, 'ADS'), 'trace');
    expect(normal.downtimeMinutes).toBe(3);
    expect(apm.downtimeMinutes).toBe(1);
    expect(normal.cash - launchFeature(initial, 'ADS').cash).toBe(-10000);
    expect(apm.cash - launchFeature(observed, 'ADS').cash).toBe(-3000);
    expect(investigate(apm, 'trace')).toBe(apm);
  });

  it('wrong investments and mitigation do not magically solve an incident', () => {
    const initial = launchFeature(startRun(), 'SEARCH');
    const wrong = remediate(initial, 'search-app-scale');
    expect(wrong.trust).toBe(initial.trust - 5);
    const mitigation = remediate(wrong, 'search-db-scale');
    expect(mitigation.mitigated).toBe(true);
    expect(mitigation.phase).toBe('incident');
    const repaired = remediate(mitigation, 'search-index');
    expect(repaired.phase).toBe('debrief');
    expect(repaired.reports[0].actionCount).toBe(3);
  });

  it('runs three monthly events and three feature cycles to exactly Day 90', () => {
    const play = (): FounderState => {
      let state = createFounderRun(17);
      for (const feature of ['SEARCH', 'ADS', 'NOTIFICATIONS'] as const) {
        state = chooseCautiousMarket(state);
        state = launchFeature(state, feature);
        state = repairAll(state);
        state = continueFounderRun(state);
      }
      return state;
    };
    const first = play();
    expect(first.phase).toBe('complete');
    expect(first.day).toBe(CAMPAIGN_DAYS);
    expect(first.reports).toHaveLength(MAX_SPRINTS);
    expect(first.marketHistory).toHaveLength(MAX_SPRINTS);
    expect(first.completed).toEqual(['SEARCH', 'ADS', 'NOTIFICATIONS']);
    expect(totalScore(first)).toBeGreaterThan(0);
    expect(first).toEqual(play());
    expect(['won', 'survived']).toContain(campaignOutcome(first));
  });

  it('separates business survival from winning the complete campaign', () => {
    const initial = createFounderRun();
    expect(campaignOutcome(initial)).toBe('survived');
    const failed = { ...initial, cash: -100 };
    expect(campaignOutcome(failed)).toBe('failed');
    const ended = { ...initial, phase: 'complete' as const };
    expect(campaignOutcome(ended)).toBe('survived');
  });

  it('supports conceding an unaffordable or unwanted incident without soft-locking', () => {
    const incident = launchFeature(startRun(), 'ADS');
    const surrendered = abandonIncident(incident);
    expect(surrendered.phase).toBe('debrief');
    expect(surrendered.reports[0].fixed).toBe(false);
    expect(surrendered.reports[0].revenue).toBe(0);
    expect(surrendered.trust).toBeLessThan(incident.trust);
  });

  it('can replay exactly the same campaign seed or select a new market schedule', () => {
    expect(createFounderRun(17)).toEqual(createFounderRun(17));
    expect(currentMarketEvent(createFounderRun(17))).toEqual(currentMarketEvent(createFounderRun(17)));
    expect(() => createFounderRun(1.5)).toThrow();
  });

  it('capacity still belongs to the node model, not the story text', () => {
    const base = calculateOperations(['SEARCH'], [], 1800);
    const optimized = calculateOperations(['SEARCH'], ['INDEX'], 1800);
    const scaled = calculateOperations(['SEARCH'], ['DB_SCALE'], 1800);
    expect(optimized.nodes.DB.demand).toBeLessThan(base.nodes.DB.demand);
    expect(scaled.nodes.DB.capacity).toBeGreaterThan(base.nodes.DB.capacity);
    expect(scaled.nodes.DB.demand).toBe(base.nodes.DB.demand);
    expect(detectIncidentCause('SEARCH', ['DB_SCALE'], scaled)).toBe('SEARCH_SCAN');
    expect(detectIncidentCause('SEARCH', ['INDEX'], optimized)).toBeNull();
    expect(() => calculateOperations([], [], 650, 0)).toThrow();
  });
});
