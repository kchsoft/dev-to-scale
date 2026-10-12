import { describe, expect, it } from 'vitest';
import {
  FEATURE_CATALOG, INCIDENT_CASES, MAX_SPRINTS,
  abandonIncident, continueFounderRun, createFounderRun, currentIncident,
  investigate, launchFeature, remediate, totalScore,
  type FeatureId, type FounderState,
} from '../founder-run';

const correctAction: Record<FeatureId, string> = {
  SEARCH: 'search-index',
  IMAGES: 'images-object',
  ADS: 'ads-connection',
  NOTIFICATIONS: 'notify-workers',
};

describe('Founder Run campaign', () => {
  it('makes every feature produce a different causally linked incident', () => {
    const initial = createFounderRun();
    expect(initial.phase).toBe('planning');
    for (const feature of Object.keys(FEATURE_CATALOG) as FeatureId[]) {
      const next = launchFeature(initial, feature);
      expect(next.phase).toBe('incident');
      expect(next.cash).toBe(initial.cash - FEATURE_CATALOG[feature].cost);
      expect(next.dau).toBe(initial.dau + FEATURE_CATALOG[feature].users);
      expect(currentIncident(next)?.id).toBe(feature);
      expect(currentIncident(next)?.node).toBe(INCIDENT_CASES[feature].node);
    }
  });

  it('charges money and outage time for investigation and does not charge twice', () => {
    const launched = launchFeature(createFounderRun(), 'SEARCH');
    const investigated = investigate(launched, 'logs');
    expect(investigated.examined).toEqual(['logs']);
    expect(investigated.downtimeMinutes).toBe(3);
    expect(investigated.cash).toBe(launched.cash - 10000);
    expect(investigate(investigated, 'logs')).toBe(investigated);
  });

  it('incorrect actions cost cash and trust; mitigation is not a root fix', () => {
    const launched = launchFeature(createFounderRun(), 'SEARCH');
    const mistaken = remediate(launched, 'search-app-scale');
    expect(mistaken.phase).toBe('incident');
    expect(mistaken.trust).toBeLessThan(launched.trust);
    expect(mistaken.cash).toBeLessThan(launched.cash);
    const mitigated = remediate(mistaken, 'search-db-scale');
    expect(mitigated.phase).toBe('incident');
    expect(mitigated.mitigated).toBe(true);
    const fixed = remediate(mitigated, 'search-index');
    expect(fixed.phase).toBe('debrief');
    expect(fixed.reports[0].fixed).toBe(true);
    expect(fixed.reports[0].actionCount).toBe(3);
    expect(fixed.incidentsResolved).toBe(1);
  });

  it('allows a player who cannot or will not fix an incident to concede', () => {
    const launched = launchFeature(createFounderRun(), 'ADS');
    const conceded = abandonIncident(launched);
    expect(conceded.phase).toBe('debrief');
    expect(conceded.reports[0].fixed).toBe(false);
    expect(conceded.reports[0].revenue).toBe(0);
    expect(conceded.dau).toBeLessThan(launched.dau);
    expect(conceded.trust).toBeLessThan(launched.trust);
  });

  it('finishes three distinct sprints with deterministic scoring', () => {
    const play = (): FounderState => {
      let state = createFounderRun();
      for (const feature of ['SEARCH', 'ADS', 'NOTIFICATIONS'] as const) {
        state = launchFeature(state, feature);
        state = investigate(state, 'metrics');
        state = remediate(state, correctAction[feature]);
        expect(state.phase).toBe('debrief');
        state = continueFounderRun(state);
      }
      return state;
    };
    const first = play();
    const second = play();
    expect(first.phase).toBe('complete');
    expect(first.reports).toHaveLength(MAX_SPRINTS);
    expect(first.completed).toEqual(['SEARCH', 'ADS', 'NOTIFICATIONS']);
    expect(first.incidentsResolved).toBe(3);
    expect(first.day).toBe(15);
    expect(totalScore(first)).toBe(totalScore(second));
    expect(first).toEqual(second);
  });

  it('rejects invalid phase transitions and duplicate features', () => {
    const initial = createFounderRun();
    expect(() => continueFounderRun(initial)).toThrow();
    expect(() => investigate(initial, 'metrics')).toThrow();
    expect(() => remediate(initial, 'search-index')).toThrow();
    const launched = launchFeature(initial, 'SEARCH');
    expect(() => launchFeature(launched, 'ADS')).toThrow();
    const completeSprint = remediate(launched, 'search-index');
    expect(() => launchFeature(completeSprint, 'SEARCH')).toThrow();
    const next = continueFounderRun(completeSprint);
    expect(() => launchFeature(next, 'SEARCH')).toThrow('이미 출시');
  });
});
