import { describe, expect, it } from 'vitest';
import { IncidentDiagnosisPolicy, LoadSnapshot } from '..';

function load(overrides: Partial<LoadSnapshot> = {}): LoadSnapshot {
  return {
    appDemand: 0, dbDemand: 0, asyncDemand: 0, storageDemand: 0,
    rawAppCapacity: 100, rawDbCapacity: 100, rawAsyncCapacity: 100,
    appCapacity: 100, dbCapacity: 100, asyncCapacity: 100, storageCapacity: 100,
    appRatio: 0.4, dbRatio: 0.4, asyncRatio: 0.2, storageRatio: 0.1,
    appCpuDemand: 40, appIoDemand: 40, dbCpuDemand: 40, dbIoDemand: 40,
    rawAppCpuCapacity: 100, rawAppIoCapacity: 100, rawDbCpuCapacity: 100, rawDbIoCapacity: 100,
    appCpuCapacity: 100, appIoCapacity: 100, dbCpuCapacity: 100, dbIoCapacity: 100,
    appCpuRatio: 0.4, appIoRatio: 0.4, dbCpuRatio: 0.4, dbIoRatio: 0.4,
    failureRate: 0,
    requestFlows: [],
    ...overrides,
  };
}

describe('incident diagnosis', () => {
  it('identifies APP I/O as the strongest framework signal', () => {
    const diagnosis = IncidentDiagnosisPolicy.diagnose({
      nodeId: 'framework:NESTJS',
      load: load({ appRatio: 1.15, appCpuRatio: 0.62, appIoRatio: 1.15 }),
      techDebt: 10,
    });

    expect(diagnosis.primarySignal).toBe('APP I/O');
    expect(diagnosis.likelyCause).toContain('Capacity 초과');
    expect(diagnosis.suggestions).toContain('Queue로 비동기 I/O 분리');
  });

  it('connects a traffic spike with a hot resource without inventing a new resource model', () => {
    const diagnosis = IncidentDiagnosisPolicy.diagnose({
      nodeId: 'database:POSTGRESQL',
      load: load({ dbRatio: 0.96, dbCpuRatio: 0.55, dbIoRatio: 0.96 }),
      techDebt: 20,
      trafficMultiplier: 1.8,
    });

    expect(diagnosis.primarySignal).toBe('DB I/O');
    expect(diagnosis.signals).toContain('Traffic ×1.8');
    expect(diagnosis.likelyCause).toContain('Traffic Spike');
  });

  it('surfaces high tech debt as an APP incident risk signal', () => {
    const diagnosis = IncidentDiagnosisPolicy.diagnose({
      nodeId: 'framework:SPRING_BOOT',
      load: load({ appRatio: 0.72, appCpuRatio: 0.72, appIoRatio: 0.51 }),
      techDebt: 72,
    });

    expect(diagnosis.signals).toContain('Tech Debt 72/100');
    expect(diagnosis.likelyCause).toContain('Tech Debt');
  });
});
