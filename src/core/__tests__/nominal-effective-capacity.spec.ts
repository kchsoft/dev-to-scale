import { describe, expect, it } from 'vitest';
import { nominalNodeCapacity } from '../infrastructure-capacity';
import { InfrastructureState } from '../infrastructure';
import {
  createNodeLoadSnapshot,
  createNodeResourceLoad,
} from '../node-load';
import { V1_NODE_IDS } from '../v1-topology';

describe('nominal/effective capacity contract', () => {
  it('keeps player-facing nominal load separate from effective hard-limit usage', () => {
    const cpu = createNodeResourceLoad('CPU', 105, 100, 118);

    expect(cpu).toMatchObject({
      resourceKind: 'CPU',
      demand: 105,
      nominalCapacity: 100,
      effectiveCapacity: 118,
    });
    expect(cpu.nominalRatio).toBeCloseTo(1.05);
    expect(cpu.effectiveRatio).toBeCloseTo(105 / 118);
  });

  it('tracks hottest nominal and effective resources independently instead of averaging them', () => {
    const node = createNodeLoadSnapshot('app', 'SERVER_GROUP', [
      createNodeResourceLoad('CPU', 105, 100, 118),
      createNodeResourceLoad('IO', 95, 100, 96),
    ]);

    expect(node.nominalLoadRatio).toBeCloseTo(1.05);
    expect(node.effectiveLoadRatio).toBeCloseTo(95 / 96);
  });

  it('exposes a technology-neutral nominal capacity alongside the existing effective capacity', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const appId = V1_NODE_IDS.app('SPRING_BOOT');

    expect(nominalNodeCapacity(infrastructure, appId)).toMatchObject({ cpu: 100, io: 100 });
    expect(infrastructure.nodeCapacity(appId)).toMatchObject({ cpu: 118, io: 96 });
  });

  it('includes structural scale in nominal capacity before framework modifiers', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const appId = V1_NODE_IDS.app('SPRING_BOOT');

    infrastructure.deployTechnology('ALB');
    infrastructure.scaleOutNode(appId);

    expect(nominalNodeCapacity(infrastructure, appId)).toMatchObject({ cpu: 200, io: 200 });
    expect(infrastructure.nodeCapacity(appId)).toMatchObject({ cpu: 236, io: 192 });
  });
});
