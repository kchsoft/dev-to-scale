import { describe, expect, it } from 'vitest';
import { GameEngine } from '../game-engine';
import { RandomSource } from '../growth';
import { LoadSnapshot } from '../infrastructure';
import { createNodeLoadSnapshot, createNodeResourceLoad } from '../node-load';

class StablePositiveRandom implements RandomSource {
  private index = 0;
  private readonly values = [0.99, 0, 0];

  next(): number {
    const value = this.values[this.index % this.values.length];
    this.index += 1;
    return value;
  }
}

function engineWithLoad(load: LoadSnapshot): GameEngine {
  const engine = new GameEngine({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 700,
    random: new StablePositiveRandom(),
  });
  const state = engine as unknown as {
    _launched: boolean;
    _dau: number;
    _load: LoadSnapshot;
    advanceGrowth: () => void;
  };
  state._launched = true;
  state._dau = 1_000;
  state._load = load;
  return engine;
}

function operationalLoad(options: {
  alb?: number;
  redis?: number;
  external?: number;
}): LoadSnapshot {
  return {
    failureRate: 0,
    nodeLoads: Object.freeze([
      createNodeLoadSnapshot('v1:load-balancer:ALB', 'LOAD_BALANCER', [
        createNodeResourceLoad('THROUGHPUT', options.alb ?? 0.8, 1),
      ]),
      createNodeLoadSnapshot('v1:app:SPRING_BOOT', 'SERVER_GROUP', [
        createNodeResourceLoad('CPU', 0.5, 1),
        createNodeResourceLoad('IO', 0.4, 1),
      ]),
      createNodeLoadSnapshot('v1:cache:REDIS', 'CACHE', [
        createNodeResourceLoad('THROUGHPUT', options.redis ?? 0.8, 1),
      ]),
      createNodeLoadSnapshot('v1:database:POSTGRESQL', 'DATABASE', [
        createNodeResourceLoad('CPU', 0.5, 1),
        createNodeResourceLoad('IO', 0.6, 1),
      ]),
      createNodeLoadSnapshot('v1:storage:OBJECT_STORAGE', 'OBJECT_STORAGE', [
        createNodeResourceLoad('STORAGE', 0.3, 1),
      ]),
      createNodeLoadSnapshot('v1:external:AI', 'EXTERNAL_SERVICE', [
        createNodeResourceLoad('THROUGHPUT', options.external ?? 0.8, 1),
      ]),
    ]),
    requestTraces: Object.freeze([]),
  };
}

function loadWithDualPressure(nominalRatio: number, effectiveRatio: number): LoadSnapshot {
  const nominalCapacity = 1;
  const demand = nominalRatio;
  const effectiveCapacity = demand / effectiveRatio;
  return {
    failureRate: 0,
    nodeLoads: Object.freeze([
      createNodeLoadSnapshot('v1:app:SPRING_BOOT', 'SERVER_GROUP', [
        createNodeResourceLoad('CPU', demand, nominalCapacity, effectiveCapacity),
      ]),
    ]),
    requestTraces: Object.freeze([]),
  };
}

function advanceGrowth(engine: GameEngine): number {
  (engine as unknown as { advanceGrowth: () => void }).advanceGrowth();
  return engine.dau;
}

describe('game engine operational growth pressure', () => {
  it('applies the existing capacity growth penalty to overloaded ALB throughput', () => {
    const baseline = engineWithLoad(operationalLoad({ alb: 0.8 }));
    const overloaded = engineWithLoad(operationalLoad({ alb: 1.2 }));

    expect(advanceGrowth(baseline) - advanceGrowth(overloaded)).toBe(200);
  });

  it('applies the existing capacity growth penalty to overloaded Redis throughput', () => {
    const baseline = engineWithLoad(operationalLoad({ redis: 0.8 }));
    const overloaded = engineWithLoad(operationalLoad({ redis: 1.25 }));

    expect(advanceGrowth(baseline) - advanceGrowth(overloaded)).toBe(250);
  });

  it('uses effective technical pressure rather than nominal display load for growth', () => {
    const belowNominal = engineWithLoad(loadWithDualPressure(0.8, 0.8));
    const aboveNominalWithHeadroom = engineWithLoad(loadWithDualPressure(1.2, 0.8));

    expect(advanceGrowth(aboveNominalWithHeadroom)).toBe(advanceGrowth(belowNominal));
  });

  it('ignores external-service pressure for the growth capacity penalty', () => {
    const baseline = engineWithLoad(operationalLoad({ external: 0.8 }));
    const overloadedExternal = engineWithLoad(operationalLoad({ external: 9.99 }));

    expect(advanceGrowth(overloadedExternal)).toBe(advanceGrowth(baseline));
  });
});
