import type { LoadSnapshot } from './infrastructure';

export type ServiceHealthStatus = 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
export type BottleneckKind = 'APP_CPU' | 'APP_IO' | 'DB_CPU' | 'DB_IO' | 'ASYNC' | 'STORAGE' | 'NONE';

export interface ServiceHealthSnapshot {
  status: ServiceHealthStatus;
  p95LatencyMs: number;
  bottleneck: BottleneckKind;
  bottleneckRatio: number;
}

const BOTTLENECKS: Array<[BottleneckKind, keyof LoadSnapshot]> = [
  ['APP_CPU', 'appCpuRatio'],
  ['APP_IO', 'appIoRatio'],
  ['DB_CPU', 'dbCpuRatio'],
  ['DB_IO', 'dbIoRatio'],
  ['ASYNC', 'asyncRatio'],
  ['STORAGE', 'storageRatio'],
];

function latencyFromPressure(maxRatio: number, failureRate: number): number {
  let latency: number;
  if (maxRatio <= 0.5) latency = 110 + maxRatio * 80;
  else if (maxRatio <= 0.7) latency = 150 + (maxRatio - 0.5) * 250;
  else if (maxRatio <= 0.9) latency = 200 + (maxRatio - 0.7) * 900;
  else if (maxRatio <= 1) latency = 380 + (maxRatio - 0.9) * 2_200;
  else latency = 600 + Math.min(2_400, (maxRatio - 1) * 5_000);

  latency += failureRate * 1_500;
  return Math.round(Math.max(100, Math.min(4_500, latency)));
}

export class ServiceHealthAnalyzer {
  static analyze(load: LoadSnapshot): ServiceHealthSnapshot {
    let bottleneck: BottleneckKind = 'NONE';
    let bottleneckRatio = 0;

    for (const [kind, field] of BOTTLENECKS) {
      const value = load[field];
      if (typeof value === 'number' && value > bottleneckRatio) {
        bottleneck = kind;
        bottleneckRatio = value;
      }
    }

    const p95LatencyMs = latencyFromPressure(bottleneckRatio, load.failureRate);
    const status: ServiceHealthStatus =
      load.failureRate >= 0.1 || bottleneckRatio > 1.1 || p95LatencyMs >= 1_500
        ? 'CRITICAL'
        : load.failureRate >= 0.01 || bottleneckRatio >= 0.85 || p95LatencyMs >= 500
          ? 'DEGRADED'
          : 'HEALTHY';

    return { status, p95LatencyMs, bottleneck, bottleneckRatio };
  }
}
