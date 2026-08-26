import { describe, expect, it } from 'vitest';
import { FeatureDefinition } from '../feature';
import { InfrastructureState, LoadCalculator } from '../infrastructure';
import { ServiceHealthAnalyzer } from '../service-health';

describe('service health analyzer', () => {
  it('reports the hottest resource as the bottleneck', () => {
    const feature = new FeatureDefinition({
      id: 'IO_HEAVY', name: 'IO Heavy', baseWork: 1, complexity: 'NORMAL',
      load: { app: 2, db: 1, async: 0, storage: 0 },
      resourceLoad: {
        app: { cpu: 0.3, io: 4.0 },
        db: { cpu: 0.2, io: 0.8 },
      },
      requestRoute: [{ node: 'APP' }, { node: 'DB' }],
    });
    const load = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL'));

    const health = ServiceHealthAnalyzer.analyze(load);

    expect(health.bottleneck).toBe('APP_IO');
    expect(health.bottleneckRatio).toBeCloseTo(load.appIoRatio);
  });

  it('raises p95 latency sharply as capacity pressure approaches and exceeds 100%', () => {
    const feature = new FeatureDefinition({
      id: 'CPU_HEAVY', name: 'CPU Heavy', baseWork: 1, complexity: 'NORMAL',
      load: { app: 2, db: 0, async: 0, storage: 0 },
      resourceLoad: { app: { cpu: 3.0, io: 0.3 } },
      requestRoute: [{ node: 'APP' }],
    });
    const infra = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const low = ServiceHealthAnalyzer.analyze(LoadCalculator.calculate(10_000, [feature], infra));
    const high = ServiceHealthAnalyzer.analyze(LoadCalculator.calculate(1_000_000, [feature], infra));

    expect(high.p95LatencyMs).toBeGreaterThan(low.p95LatencyMs);
    expect(high.bottleneck).toBe('APP_CPU');
  });

  it('marks a fully failed required request path as critical', () => {
    const feature = new FeatureDefinition({
      id: 'QUEUE_REQUIRED', name: 'Queue Required', baseWork: 1, complexity: 'NORMAL',
      load: { app: 1, db: 1, async: 3, storage: 0 },
      requestRoute: [{ node: 'APP' }, { node: 'DB' }, { node: 'QUEUE', requirement: 'REQUIRED' }],
    });
    const load = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('NESTJS', 'POSTGRESQL'));

    const health = ServiceHealthAnalyzer.analyze(load);

    expect(load.failureRate).toBe(1);
    expect(health.status).toBe('CRITICAL');
    expect(health.p95LatencyMs).toBeGreaterThanOrEqual(1_500);
  });
});
