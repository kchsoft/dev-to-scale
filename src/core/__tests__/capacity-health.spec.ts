import { describe, expect, it } from 'vitest';
import {
  capacityHealthByNode,
  composeNodeHealth,
  nodeCapacityHealth,
  resourceCapacityHealth,
} from '../capacity-health';
import { createNodeLoadSnapshot, createNodeResourceLoad } from '../node-load';

describe('capacity health', () => {
  it('stays healthy at the effective hard limit and fails only the excess above it', () => {
    expect(resourceCapacityHealth(createNodeResourceLoad('CPU', 118, 100, 118))).toBe(1);
    expect(resourceCapacityHealth(createNodeResourceLoad('CPU', 130, 100, 118))).toBeCloseTo(118 / 130);
  });

  it('uses the most constrained effective resource for node capacity health', () => {
    const node = createNodeLoadSnapshot('app', 'SERVER_GROUP', [
      createNodeResourceLoad('CPU', 130, 100, 118),
      createNodeResourceLoad('IO', 70, 100, 96),
    ]);

    expect(nodeCapacityHealth(node)).toBeCloseTo(118 / 130);
  });

  it('treats positive demand with zero capacity as fully unavailable and empty nodes as healthy', () => {
    expect(resourceCapacityHealth(createNodeResourceLoad('THROUGHPUT', 1, 0, 0))).toBe(0);
    expect(nodeCapacityHealth(createNodeLoadSnapshot('external', 'EXTERNAL_SERVICE', []))).toBe(1);
  });

  it('maps exact node IDs and composes incident and capacity health multiplicatively', () => {
    const app = createNodeLoadSnapshot('app-a', 'SERVER_GROUP', [
      createNodeResourceLoad('CPU', 130, 100, 118),
    ]);
    const db = createNodeLoadSnapshot('db-a', 'DATABASE', [
      createNodeResourceLoad('IO', 40, 100, 100),
    ]);
    const capacity = capacityHealthByNode({ nodeLoads: [app, db] });

    expect(capacity['app-a']).toBeCloseTo(118 / 130);
    expect(capacity['db-a']).toBe(1);
    expect(capacity['app-b']).toBeUndefined();

    const composed = composeNodeHealth({ 'app-a': 0.8, 'db-a': 0.4 }, capacity);
    expect(composed['app-a']).toBeCloseTo(0.8 * 118 / 130);
    expect(composed['db-a']).toBeCloseTo(0.4);
  });
});
