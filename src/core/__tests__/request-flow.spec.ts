import { describe, expect, it } from 'vitest';
import { FeatureDefinition } from '../feature';
import { RequestFlowSimulator } from '../request-flow';

const asyncFeature = new FeatureDefinition({
  id: 'ASYNC_FEATURE',
  name: 'Async Feature',
  baseWork: 1,
  complexity: 'NORMAL',
  load: { app: 1, db: 1, async: 2, storage: 0 },
  requestRoute: [
    { node: 'APP' },
    { node: 'DB' },
    { node: 'QUEUE', requirement: 'REQUIRED' },
  ],
});

describe('request flow', () => {
  it('passes a healthy request through every required node', () => {
    const result = RequestFlowSimulator.simulate(asyncFeature, {
      available: { APP: true, DB: true, QUEUE: true },
    });

    expect(result.successRatio).toBe(1);
    expect(result.failureNode).toBeNull();
    expect(result.arrivalRatio('APP')).toBe(1);
    expect(result.arrivalRatio('DB')).toBe(1);
    expect(result.arrivalRatio('QUEUE')).toBe(1);
  });

  it('fails at a missing required queue while keeping upstream traffic', () => {
    const result = RequestFlowSimulator.simulate(asyncFeature, {
      available: { APP: true, DB: true, QUEUE: false },
    });

    expect(result.successRatio).toBe(0);
    expect(result.failureNode).toBe('QUEUE');
    expect(result.arrivalRatio('APP')).toBe(1);
    expect(result.arrivalRatio('DB')).toBe(1);
    expect(result.arrivalRatio('QUEUE')).toBe(0);
  });

  it('stops downstream traffic when an application incident blocks requests', () => {
    const result = RequestFlowSimulator.simulate(asyncFeature, {
      available: { APP: true, DB: true, QUEUE: true },
      health: { APP: 0 },
    });

    expect(result.arrivalRatio('APP')).toBe(1);
    expect(result.arrivalRatio('DB')).toBe(0);
    expect(result.arrivalRatio('QUEUE')).toBe(0);
    expect(result.successRatio).toBe(0);
    expect(result.failureNode).toBe('APP');
  });

  it('restores downstream traffic after the failed node becomes healthy', () => {
    const failed = RequestFlowSimulator.simulate(asyncFeature, {
      available: { APP: true, DB: true, QUEUE: true },
      health: { APP: 0 },
    });
    const recovered = RequestFlowSimulator.simulate(asyncFeature, {
      available: { APP: true, DB: true, QUEUE: true },
      health: { APP: 1 },
    });

    expect(failed.arrivalRatio('DB')).toBe(0);
    expect(recovered.arrivalRatio('DB')).toBe(1);
    expect(recovered.successRatio).toBe(1);
  });

  it('skips a missing optional node without failing the request', () => {
    const optional = new FeatureDefinition({
      id: 'OPTIONAL_QUEUE',
      name: 'Optional Queue',
      baseWork: 1,
      complexity: 'NORMAL',
      load: { app: 1, db: 1, async: 1, storage: 0 },
      requestRoute: [
        { node: 'APP' },
        { node: 'QUEUE', requirement: 'OPTIONAL' },
        { node: 'DB' },
      ],
    });

    const result = RequestFlowSimulator.simulate(optional, {
      available: { APP: true, DB: true, QUEUE: false },
    });

    expect(result.successRatio).toBe(1);
    expect(result.arrivalRatio('DB')).toBe(1);
    expect(result.arrivalRatio('QUEUE')).toBe(0);
  });
});
