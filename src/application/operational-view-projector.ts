import { DeveloperProfile, GameSnapshot } from '../core';
import { LoadMetricView, ServiceOperationsView } from './game-view';

function percent(value: number): number {
  return Math.max(0, Math.round(value * 100));
}

function metric(label: string, ratio: number): LoadMetricView {
  const tone = ratio > 1 ? 'overload' : ratio >= 0.9 ? 'critical' : ratio >= 0.7 ? 'busy' : 'stable';
  return { label, percent: percent(ratio), tone };
}

export class OperationalViewProjector {
  static project(snapshot: GameSnapshot, _developer: DeveloperProfile): ServiceOperationsView {
    return {
      observability: {
        level: 'BASIC',
        label: 'BASIC HEALTH',
        nextUnlock: 'Metrics: OS & Runtime Lv.2',
        showsResourceSignature: false,
        tracesRequests: false,
      },
      health: {
        status: 'HEALTHY',
        p95LatencyMs: 100,
        bottleneck: 'NONE',
        bottleneckLabel: 'NONE',
        bottleneckPercent: 0,
      },
      visibleLoads: [
        metric('APP', snapshot.load.appRatio),
        metric('DB', snapshot.load.dbRatio),
        metric('ASYNC', snapshot.load.asyncRatio),
        metric('STORAGE', snapshot.load.storageRatio),
      ],
      failurePercent: percent(snapshot.load.failureRate),
    };
  }
}
