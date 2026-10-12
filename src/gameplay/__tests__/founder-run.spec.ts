import { describe, expect, it } from 'vitest';
import {
  FEATURE_CATALOG, MAX_SPRINTS,
  abandonIncident, continueFounderRun, createFounderRun, currentIncident,
  investigate, investInOperations, launchFeature, remediate, totalScore,
  type FeatureId, type FounderState,
} from '../founder-run';
import { ROOT_CAUSES, calculateOperations, detectIncidentCause } from '../operational-model';

const INITIAL_CAUSES = {
  SEARCH: 'SEARCH_SCAN',
  IMAGES: 'STORAGE_IO',
  ADS: 'POOL_EXHAUSTION',
  NOTIFICATIONS: 'QUEUE_CONSUMER',
} as const;

function repairAll(state: FounderState): FounderState {
  for (let step = 0; step < 8 && state.phase === 'incident'; step++) {
    const cause = state.incidentCause;
    if (!cause) throw new Error('Incident phase must have a cause');
    const resolution = currentIncident(state)?.remedies.find((remedy) => remedy.effect === 'fix');
    if (!resolution) throw new Error('Every cause needs a causal remedy');
    const before = state.cash;
    state = remediate(state, resolution.id);
    // A final repair also settles the sprint, so successful revenue can exceed its cost.
    if (state.phase === 'incident') expect(state.cash).toBeLessThan(before);
    else expect(state.reports[state.reports.length - 1].fixed).toBe(true);
  }
  expect(state.phase).toBe('debrief');
  return state;
}

describe('Founder Run causal operations model', () => {
  it('connects every newly released feature to a corresponding structural fault', () => {
    const start = createFounderRun();
    for (const feature of Object.keys(FEATURE_CATALOG) as FeatureId[]) {
      const launched = launchFeature(start, feature);
      expect(launched.phase).toBe('incident');
      expect(launched.cash).toBe(start.cash - FEATURE_CATALOG[feature].cost);
      expect(launched.dau).toBe(start.dau + FEATURE_CATALOG[feature].users);
      expect(launched.incidentCause).toBe(INITIAL_CAUSES[feature]);
      expect(currentIncident(launched)?.node).toBe(ROOT_CAUSES[INITIAL_CAUSES[feature]].node);
      expect(launched.operational.nodes.APP.demand).toBeGreaterThan(start.operational.nodes.APP.demand);
    }
  });

  it('lets preventive investments avoid incidents by changing real workload inputs', () => {
    const initial = createFounderRun();
    const prepared = investInOperations(initial, 'INDEX');
    expect(prepared.cash).toBe(initial.cash - 125000);
    expect(prepared.investedThisSprint).toBe(true);
    expect(() => investInOperations(prepared, 'DB_SCALE')).toThrow('한 번');
    expect(() => investInOperations(prepared, 'INDEX')).toThrow('한 번');

    const noPreparation = launchFeature(initial, 'SEARCH');
    const ready = launchFeature(prepared, 'SEARCH');
    expect(noPreparation.phase).toBe('incident');
    expect(ready.phase).toBe('debrief');
    expect(ready.incidentCause).toBeNull();
    expect(ready.incidentsResolved).toBe(0);
    expect(ready.reports[0].downtimeMinutes).toBe(0);
    expect(ready.reports[0].incident).toContain('안정적인');
    expect(ready.operational.nodes.DB.demand).toBeLessThan(noPreparation.operational.nodes.DB.demand);
    expect(ready.reports[0].score).toBeGreaterThan(0);
  });

  it('does not confuse a query scan with a capacity bottleneck', () => {
    const basic = launchFeature(createFounderRun(), 'SEARCH');
    expect(basic.incidentCause).toBe('SEARCH_SCAN');
    const failedInvestment = remediate(basic, 'search-db-scale');
    expect(failedInvestment.phase).toBe('incident');
    expect(failedInvestment.incidentCause).toBe('SEARCH_SCAN');

    let afterSearch = remediate(basic, 'search-index');
    expect(afterSearch.phase).toBe('debrief');
    const afterAds = launchFeature(continueFounderRun(afterSearch), 'ADS');
    expect(afterAds.incidentCause).toBe('POOL_EXHAUSTION');

    const poolFixed = remediate(afterAds, 'ads-connection');
    expect(poolFixed.phase).toBe('incident');
    expect(poolFixed.incidentCause).toBe('DB_CAPACITY');
    expect(currentIncident(poolFixed)?.cause).toContain('처리 용량');
    expect(currentIncident(poolFixed)?.probes[1].finding).not.toContain('광고 집계');
    expect(poolFixed.operational.nodes.DB.ratio).toBeGreaterThan(0.96);

    const capacityFixed = remediate(poolFixed, 'db-capacity');
    expect(capacityFixed.phase).toBe('debrief');
    expect(capacityFixed.operational.nodes.DB.ratio).toBeLessThan(0.96);
    expect(capacityFixed.reports[1].actionCount).toBe(2);
    expect(capacityFixed.investments).toContain('POOL_TUNING');
    expect(capacityFixed.investments).toContain('DB_SCALE');
  });

  it('derives all exposed node metrics from the same operations snapshot', () => {
    const state = launchFeature(createFounderRun(), 'IMAGES');
    const incident = currentIncident(state);
    expect(incident).not.toBeNull();
    expect(incident!.metrics.find((metric) => metric.label === 'APP CPU')?.value)
      .toBe(state.operational.nodes.APP.utilization + '%');
    expect(incident!.metrics.find((metric) => metric.label === 'Storage I/O')?.value)
      .toBe(state.operational.nodes.STORAGE.utilization + '%');
    expect(incident!.metrics.some((metric) => metric.critical)).toBe(true);
  });

  it('makes observability reduce investigation cost and downtime without adding capacity', () => {
    const start = createFounderRun();
    const ready = investInOperations(start, 'APM');
    expect(ready.operational.nodes.DB.capacity).toBe(start.operational.nodes.DB.capacity);
    const normal = investigate(launchFeature(start, 'ADS'), 'trace');
    const withApm = investigate(launchFeature(ready, 'ADS'), 'trace');
    expect(normal.downtimeMinutes).toBe(3);
    expect(withApm.downtimeMinutes).toBe(1);
    expect(normal.cash - launchFeature(start, 'ADS').cash).toBe(-10000);
    expect(withApm.cash - launchFeature(ready, 'ADS').cash).toBe(-3000);
    expect(investigate(withApm, 'trace')).toBe(withApm);
  });

  it('applies incorrect choices and mitigations without pretending to solve the root cause', () => {
    const start = launchFeature(createFounderRun(), 'SEARCH');
    const mistaken = remediate(start, 'search-app-scale');
    expect(mistaken.trust).toBe(start.trust - 5);
    expect(mistaken.dau).toBeLessThan(start.dau);
    const mitigated = remediate(mistaken, 'search-db-scale');
    expect(mitigated.phase).toBe('incident');
    expect(mitigated.mitigated).toBe(true);
    const fixed = remediate(mitigated, 'search-index');
    expect(fixed.phase).toBe('debrief');
    expect(fixed.reports[0].actionCount).toBe(3);
    expect(fixed.incidentsResolved).toBe(1);
  });

  it('keeps deterministic startup replays and completes three sprints', () => {
    const run = (): FounderState => {
      let state = createFounderRun();
      for (const feature of ['SEARCH', 'ADS', 'NOTIFICATIONS'] as const) {
        state = launchFeature(state, feature);
        state = repairAll(state);
        state = continueFounderRun(state);
      }
      return state;
    };
    const first = run();
    expect(first.phase).toBe('complete');
    expect(first.reports).toHaveLength(MAX_SPRINTS);
    expect(first.completed).toEqual(['SEARCH', 'ADS', 'NOTIFICATIONS']);
    expect(first.day).toBe(15);
    expect(totalScore(first)).toBeGreaterThan(0);
    expect(first).toEqual(run());
  });

  it('allows a costly incident to be abandoned instead of soft-locking', () => {
    const state = launchFeature(createFounderRun(), 'ADS');
    const abandoned = abandonIncident(state);
    expect(abandoned.phase).toBe('debrief');
    expect(abandoned.reports[0].fixed).toBe(false);
    expect(abandoned.reports[0].revenue).toBe(0);
    expect(abandoned.dau).toBeLessThan(state.dau);
    expect(abandoned.trust).toBeLessThan(state.trust);
  });

  it('requires valid phase transitions and prevents duplicate feature releases', () => {
    const initial = createFounderRun();
    expect(() => continueFounderRun(initial)).toThrow();
    expect(() => investigate(initial, 'metrics')).toThrow();
    expect(() => remediate(initial, 'search-index')).toThrow();
    const launched = launchFeature(initial, 'SEARCH');
    expect(() => launchFeature(launched, 'ADS')).toThrow();
    const next = continueFounderRun(repairAll(launched));
    expect(() => launchFeature(next, 'SEARCH')).toThrow('이미 출시');
  });

  it('calibrates demand against actual purchased capacities', () => {
    const base = calculateOperations(['SEARCH'], [], 1800);
    const optimized = calculateOperations(['SEARCH'], ['INDEX'], 1800);
    const scaled = calculateOperations(['SEARCH'], ['DB_SCALE'], 1800);
    expect(optimized.nodes.DB.demand).toBeLessThan(base.nodes.DB.demand);
    expect(scaled.nodes.DB.capacity).toBeGreaterThan(base.nodes.DB.capacity);
    expect(scaled.nodes.DB.demand).toBe(base.nodes.DB.demand);
    expect(detectIncidentCause('SEARCH', ['DB_SCALE'], scaled)).toBe('SEARCH_SCAN');
    expect(detectIncidentCause('SEARCH', ['INDEX'], optimized)).toBeNull();
  });
});
