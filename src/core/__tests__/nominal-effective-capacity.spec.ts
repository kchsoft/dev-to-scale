import { describe, expect, it } from 'vitest';
import * as core from '..';
import { InfrastructureState } from '../infrastructure';
import {
  createNodeLoadSnapshot,
  createNodeResourceLoad,
  type NodeResourceKind,
} from '../node-load';
import { V1_NODE_IDS } from '../v1-topology';

type DualResourceLoad = {
  readonly resourceKind: NodeResourceKind;
  readonly demand: number;
  readonly nominalCapacity: number;
  readonly effectiveCapacity: number;
  readonly nominalRatio: number;
  readonly effectiveRatio: number;
};

type DualResourceFactory = (
  resourceKind: NodeResourceKind,
  demand: number,
  nominalCapacity: number,
  effectiveCapacity?: number,
) => DualResourceLoad;

type NominalCapacity = {
  readonly cpu?: number;
  readonly io?: number;
  readonly throughput?: number;
  readonly storage?: number;
};

type NominalCapacityResolver = (
  infrastructure: InfrastructureState,
  nodeId: string,
) => NominalCapacity;

const createDualResourceLoad = createNodeResourceLoad as unknown as DualResourceFactory;
const nominalNodeCapacity = (core as unknown as {
  readonly nominalNodeCapacity?: NominalCapacityResolver;
}).nominalNodeCapacity;

describe('nominal/effective capacity contract', () => {
  it('keeps player-facing nominal load separate from effective hard-limit usage', () => {
    const cpu = createDualResourceLoad('CPU', 105, 100, 118);

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
      createDualResourceLoad('CPU', 105, 100, 118),
      createDualResourceLoad('IO', 95, 100, 96),
    ]) as unknown as {
      readonly nominalLoadRatio: number;
      readonly effectiveLoadRatio: number;
    };

    expect(node.nominalLoadRatio).toBeCloseTo(1.05);
    expect(node.effectiveLoadRatio).toBeCloseTo(95 / 96);
  });

  it('exposes a technology-neutral nominal capacity alongside the existing effective capacity', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const appId = V1_NODE_IDS.app('SPRING_BOOT');

    expect(typeof nominalNodeCapacity).toBe('function');
    expect(nominalNodeCapacity!(infrastructure, appId)).toMatchObject({ cpu: 100, io: 100 });
    expect(infrastructure.nodeCapacity(appId)).toMatchObject({ cpu: 118, io: 96 });
  });

  it('includes structural scale in nominal capacity before framework modifiers', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const appId = V1_NODE_IDS.app('SPRING_BOOT');

    infrastructure.deployTechnology('ALB');
    infrastructure.scaleOutNode(appId);

    expect(nominalNodeCapacity!(infrastructure, appId)).toMatchObject({ cpu: 200, io: 200 });
    expect(infrastructure.nodeCapacity(appId)).toMatchObject({ cpu: 236, io: 192 });
  });
});
