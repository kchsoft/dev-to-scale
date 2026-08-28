import { describe, expect, it, vi } from 'vitest';
import { ServerSize } from '../../core';
import { GameController } from '../game-controller';
import type { TopologyNodeView } from '../game-view';

interface ExpectedScaling {
  readonly currentSize: 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE';
  readonly sizeOptions: readonly {
    readonly size: 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE';
    readonly capacity: { readonly cpu?: number; readonly io?: number; readonly throughput?: number; readonly storage?: number };
    readonly monthlyCost: number;
  }[];
  readonly scaleOut: null | {
    readonly kind: 'INSTANCE' | 'READ_REPLICA';
    readonly count: number;
    readonly maxCount: number;
    readonly monthlyCostDelta: number | null;
    readonly available: boolean;
    readonly reason: string | null;
  };
}

type ScalingNode = TopologyNodeView & {
  readonly monthlyCost: number;
  readonly scaling: ExpectedScaling | null;
};

interface GenericScalingController {
  resizeInfrastructureNode(nodeId: string, size: 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE'): void;
  scaleOutInfrastructureNode(nodeId: string): void;
}

describe('generic node scaling application projection', () => {
  it('projects size options and horizontal capability on each initial owned topology node', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 41 });
    const nodes = controller.getView().topology.nodes as readonly ScalingNode[];
    const app = nodes.find((node) => node.id === 'v1:app:SPRING_BOOT')!;
    const db = nodes.find((node) => node.id === 'v1:database:POSTGRESQL')!;
    const storage = nodes.find((node) => node.id === 'v1:storage:OBJECT_STORAGE')!;

    expect(app.scaling?.currentSize).toBe('SMALL');
    expect(app.scaling?.sizeOptions).toHaveLength(4);
    expect(app.scaling?.sizeOptions.find((option) => option.size === 'SMALL')?.monthlyCost).toBeCloseTo(105_000);
    expect(app.scaling?.scaleOut).toMatchObject({
      kind: 'INSTANCE', count: 1, maxCount: 10, available: false, reason: expect.stringMatching(/ALB/i),
    });

    expect(db.scaling?.currentSize).toBe('SMALL');
    expect(db.scaling?.scaleOut).toMatchObject({
      kind: 'READ_REPLICA', count: 0, maxCount: 3, available: true, reason: null,
    });
    expect(db.scaling?.scaleOut?.monthlyCostDelta).toBe(120_000);

    expect(storage.monthlyCost).toBe(0);
    expect(storage.scaling?.currentSize).toBe('SMALL');
    expect(storage.scaling?.sizeOptions.find((option) => option.size === 'LARGE')).toMatchObject({
      capacity: { storage: 320 }, monthlyCost: 50_000,
    });
    expect(storage.scaling?.scaleOut).toBeNull();
  });

  it('emits exactly one updated view after a generic node resize command', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 42 });
    const commands = controller as unknown as GenericScalingController;
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    commands.resizeInfrastructureNode('v1:storage:OBJECT_STORAGE', ServerSize.LARGE);

    expect(listener).toHaveBeenCalledTimes(2);
    const storage = (listener.mock.lastCall?.[0].topology.nodes as readonly ScalingNode[])
      .find((node) => node.id === 'v1:storage:OBJECT_STORAGE');
    expect(storage?.scaling?.currentSize).toBe('LARGE');
    expect(storage?.monthlyCost).toBe(50_000);
    unsubscribe();
  });
});
