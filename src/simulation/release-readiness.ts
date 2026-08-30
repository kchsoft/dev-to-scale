import { withReleaseReadinessIntent, type SimulationAction } from './balance-action';
import type { BalanceObservation } from './balance-observation';
import type { BalanceStrategyId } from './balance-scenario';
import type { StrategyDecisionContext } from './balance-strategy';
import { cheapestAffordable, technologyAction } from './strategy-helpers';

export function preventativeDependencyAction(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
  strategyId: BalanceStrategyId,
): SimulationAction | null {
  const gap = observation.upcomingRequiredDependencyGaps[0];
  if (!gap) return null;

  const reason = `prepare ${gap.role} before ${gap.workloadIds.join(', ')} release`;
  const action = cheapestAffordable(
    observation,
    context,
    strategyId,
    gap.candidateTechnologyIds.map((technologyId) => (
      technologyAction(observation, technologyId, reason)
    )),
  );
  return action
    ? withReleaseReadinessIntent(action, 'RELEASE_READINESS_DEPENDENCY')
    : null;
}
