export interface OperationalSloSample {
  readonly failureRate: number;
  readonly overloaded: boolean;
  readonly missingRequiredDependency: boolean;
}

export interface OperationalSloStatus {
  readonly sampleCount: number;
  readonly healthyDays: number;
  readonly unhealthyDays: number;
  readonly averageFailureRate: number;
  readonly missingRequiredDependencyDays: number;
  readonly passes: boolean;
}

const WINDOW_DAYS = 30;
const REQUIRED_HEALTHY_DAYS = 27;
const MAX_AVERAGE_FAILURE_RATE = 0.02;
const SEVERE_FAILURE_RATE = 0.10;

export class OperationalSloWindow {
  private readonly samples: OperationalSloSample[] = [];

  record(sample: OperationalSloSample): void {
    this.samples.push(Object.freeze({
      failureRate: Math.max(0, Math.min(1, sample.failureRate)),
      overloaded: sample.overloaded,
      missingRequiredDependency: sample.missingRequiredDependency,
    }));
    if (this.samples.length > WINDOW_DAYS) this.samples.shift();
  }

  get status(): OperationalSloStatus {
    const sampleCount = this.samples.length;
    const healthyDays = this.samples.filter((sample) => (
      sample.failureRate < SEVERE_FAILURE_RATE
      && !sample.overloaded
      && !sample.missingRequiredDependency
    )).length;
    const missingRequiredDependencyDays = this.samples.filter(
      ({ missingRequiredDependency }) => missingRequiredDependency,
    ).length;
    const averageFailureRate = sampleCount === 0
      ? 0
      : this.samples.reduce((sum, sample) => sum + sample.failureRate, 0) / sampleCount;

    return Object.freeze({
      sampleCount,
      healthyDays,
      unhealthyDays: sampleCount - healthyDays,
      averageFailureRate,
      missingRequiredDependencyDays,
      passes: sampleCount >= WINDOW_DAYS
        && healthyDays >= REQUIRED_HEALTHY_DAYS
        && averageFailureRate <= MAX_AVERAGE_FAILURE_RATE
        && missingRequiredDependencyDays === 0,
    });
  }
}
