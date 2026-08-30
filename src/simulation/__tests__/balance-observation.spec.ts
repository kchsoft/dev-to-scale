import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../core/game-engine';
import type { RandomSource } from '../../core/growth';
import { skillRef } from '../../core/learning';
import { observeForStrategy } from '../balance-observation';

class ConstantRandom implements RandomSource {
  next(): number { return 0.99; }
}

class GrowthRandom implements RandomSource {
  private index = 0;
  private readonly values = [0.99, 0.99, 0] as const;

  next(): number {
    const value = this.values[this.index % this.values.length];
    this.index += 1;
    return value;
  }
}

function launchedGame(): GameEngine {
  const game = new GameEngine({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 41,
    random: new ConstantRandom(),
    incidentRandom: new ConstantRandom(),
  });
  for (let day = 0; day < 30 && !game.launched; day += 1) game.advanceDay();
  if (!game.launched) throw new Error('Expected launched game');
  return game;
}

function gameWithPendingRequiredQueue(): GameEngine {
  const game = new GameEngine({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 2,
    random: new GrowthRandom(),
    incidentRandom: new ConstantRandom(),
    startingCash: 100_000_000,
  });
  const queueRequiredFeatures = new Set(['NOTIFICATION', 'AI_RECOMMENDATION', 'FOLLOW_FEED']);
  for (let day = 0; day < 600; day += 1) {
    game.advanceDay();
    const current = game.snapshot.currentFeature;
    if (current && queueRequiredFeatures.has(current.id)) return game;
  }
  throw new Error('Expected a queue-required feature to be under development');
}

function gameWithMissingRequiredQueue(): GameEngine {
  const game = new GameEngine({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 2,
    random: new GrowthRandom(),
    incidentRandom: new ConstantRandom(),
    startingCash: 100_000_000,
  });
  const queueRequiredFeatures = new Set(['NOTIFICATION', 'AI_RECOMMENDATION', 'FOLLOW_FEED']);
  for (let day = 0; day < 600; day += 1) {
    game.advanceDay();
    if (game.snapshot.completedFeatures.some((id) => queueRequiredFeatures.has(id))) return game;
  }
  throw new Error('Expected a queue-required feature to complete');
}

function unlockApm(game: GameEngine): void {
  game.developer.get(skillRef.fundamental('OS_RUNTIME')).setLevel(3);
  game.developer.get(skillRef.fundamental('NETWORK')).setLevel(2);
  game.developer.get(skillRef.fundamental('SOFTWARE_DESIGN')).setLevel(2);
}

describe('balance observation boundaries', () => {
  it('keeps BASIC to copied aggregate operational data', () => {
    const observation = observeForStrategy(launchedGame(), 'BASIC');

    expect(observation.level).toBe('BASIC');
    expect(observation.nodes.length).toBeGreaterThan(0);
    expect('resourceLoads' in observation).toBe(false);
    expect('diagnosis' in observation).toBe(false);
    expect('previewPort' in observation).toBe(false);
    expect('engine' in observation).toBe(false);
    expect('rawLoad' in observation).toBe(false);
    expect('infrastructure' in observation).toBe(false);
    expect('developer' in observation).toBe(false);
  });

  it('exposes pending feature requirements before release without exposing projected load to BASIC', () => {
    const game = gameWithPendingRequiredQueue();
    const currentFeatureId = game.snapshot.currentFeature?.id;
    if (!currentFeatureId) throw new Error('Expected pending feature');

    const observation = observeForStrategy(game, 'BASIC');

    expect(observation.pendingFeature).toMatchObject({
      id: currentFeatureId,
      requiredResourceRoles: ['EVENT_BUS'],
    });
    expect(observation.pendingFeature?.estimatedRemainingDays).toBeGreaterThan(0);
    expect(observation.upcomingRequiredDependencyGaps).toEqual([
      {
        role: 'EVENT_BUS',
        workloadIds: [currentFeatureId],
        candidateTechnologyIds: ['SQS', 'RABBITMQ', 'KAFKA'],
      },
    ]);
    expect('releasePreview' in observation).toBe(false);
  });

  it('copies player-visible technology availability without leaking the developer profile', () => {
    const game = launchedGame();
    let observation = observeForStrategy(game, 'BASIC');
    const lockedRedis = observation.technologyOptions.find(({ id }) => id === 'REDIS');
    expect(lockedRedis).toMatchObject({ id: 'REDIS', deployed: false, available: false });

    game.developer.get(skillRef.fundamental('DATABASE')).setLevel(2);
    game.developer.get(skillRef.fundamental('NETWORK')).setLevel(2);
    observation = observeForStrategy(game, 'BASIC');
    const availableRedis = observation.technologyOptions.find(({ id }) => id === 'REDIS');
    expect(availableRedis).toMatchObject({
      id: 'REDIS', deployed: false, available: true, buildCost: 300_000, monthlyCost: 100_000,
    });
    expect('developer' in observation).toBe(false);
  });

  it('exposes a missing required EVENT_BUS dependency and clears it after SQS is deployed', () => {
    const game = gameWithMissingRequiredQueue();

    const missing = observeForStrategy(game, 'BASIC');
    expect(missing.requiredDependencyGaps).toEqual([
      {
        role: 'EVENT_BUS',
        workloadIds: expect.arrayContaining(['AI_RECOMMENDATION']),
        candidateTechnologyIds: ['SQS', 'RABBITMQ', 'KAFKA'],
      },
    ]);

    game.infrastructure.deployTechnology('SQS');
    game.advanceDay();

    expect(observeForStrategy(game, 'BASIC').requiredDependencyGaps).toEqual([]);
  });

  it('does not grant METRICS before the real skill unlock', () => {
    const observation = observeForStrategy(launchedGame(), 'METRICS');

    expect(observation.level).toBe('BASIC');
    expect('resourceLoads' in observation).toBe(false);
  });

  it('exposes resource signatures at METRICS but not APM diagnosis', () => {
    const game = launchedGame();
    game.developer.get(skillRef.fundamental('OS_RUNTIME')).setLevel(2);

    const observation = observeForStrategy(game, 'METRICS');

    expect(observation.level).toBe('METRICS');
    expect('resourceLoads' in observation).toBe(true);
    if (observation.level !== 'METRICS') throw new Error('Expected METRICS');
    expect(observation.resourceLoads.length).toBeGreaterThan(0);
    expect('diagnosis' in observation).toBe(false);
  });

  it('clamps a higher real unlock to the strategy ceiling', () => {
    const game = launchedGame();
    unlockApm(game);

    const basic = observeForStrategy(game, 'BASIC');
    const metrics = observeForStrategy(game, 'METRICS');

    expect(basic.level).toBe('BASIC');
    expect('resourceLoads' in basic).toBe(false);
    expect(metrics.level).toBe('METRICS');
    expect('diagnosis' in metrics).toBe(false);
  });

  it('exposes copied bottleneck diagnosis only after real APM unlock', () => {
    const game = launchedGame();
    unlockApm(game);

    const observation = observeForStrategy(game, 'APM');

    expect(observation.level).toBe('APM');
    if (observation.level !== 'APM') throw new Error('Expected APM');
    expect(observation.resourceLoads.length).toBeGreaterThan(0);
    expect(observation.diagnosis).toBeDefined();
    expect('previewPort' in observation).toBe(false);
  });

  it('gives ORACLE copied exact signals and a narrow preview port without leaking live state', () => {
    const observation = observeForStrategy(launchedGame(), 'ORACLE');

    expect(observation.level).toBe('ORACLE');
    if (observation.level !== 'ORACLE') throw new Error('Expected ORACLE');
    expect(observation.exactPressures.length).toBeGreaterThan(0);
    expect(observation.workloadTags).toContain('CORE');
    expect(typeof observation.previewPort.previewTechnology).toBe('function');
    expect(typeof observation.previewPort.previewResize).toBe('function');
    expect(typeof observation.previewPort.previewScaleOut).toBe('function');
    expect(typeof observation.previewPort.projectedMonthlyCost).toBe('function');
    expect('engine' in observation).toBe(false);
    expect('rawLoad' in observation).toBe(false);
    expect('infrastructure' in observation).toBe(false);
    expect('developer' in observation).toBe(false);
  });
});