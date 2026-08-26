import { DeveloperProfile, skillRef } from './learning';

export type ObservabilityLevel = 'BASIC' | 'METRICS' | 'APM';

export interface ObservabilitySnapshot {
  level: ObservabilityLevel;
  nextUnlock: string | null;
}

/**
 * Observability depth comes from fundamentals instead of another infra product.
 * The player learns to see more, rather than configuring a monitoring stack.
 */
export class ObservabilityPolicy {
  static evaluate(developer: DeveloperProfile): ObservabilitySnapshot {
    const osRuntime = developer.get(skillRef.fundamental('OS_RUNTIME')).level;
    const network = developer.get(skillRef.fundamental('NETWORK')).level;
    const softwareDesign = developer.get(skillRef.fundamental('SOFTWARE_DESIGN')).level;

    if (osRuntime >= 3 && network >= 2 && softwareDesign >= 2) {
      return { level: 'APM', nextUnlock: null };
    }
    if (osRuntime >= 2) {
      return {
        level: 'METRICS',
        nextUnlock: 'APM: OS & Runtime Lv.3 + Network Lv.2 + Software Design Lv.2',
      };
    }
    return {
      level: 'BASIC',
      nextUnlock: 'Metrics: OS & Runtime Lv.2',
    };
  }
}
