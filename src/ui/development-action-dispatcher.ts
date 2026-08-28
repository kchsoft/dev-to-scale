import type { DevelopmentActionView } from '../application/development-view';
import type { SkillRefView, TechnologyIdView } from '../application/game-view';

export interface DevelopmentActionHandlers {
  readonly startTechnologyBuild: (technologyId: TechnologyIdView) => void;
  readonly startLearning: (skill: SkillRefView) => void;
  readonly fastTrackFeature: (featureId: string) => void;
  readonly startRefactor: () => void;
}

export function dispatchDevelopmentAction(
  action: DevelopmentActionView,
  handlers: DevelopmentActionHandlers,
): void {
  switch (action.kind) {
    case 'start-technology':
      handlers.startTechnologyBuild(action.technologyId);
      return;
    case 'start-learning':
      handlers.startLearning(action.skill);
      return;
    case 'fast-track-feature':
      handlers.fastTrackFeature(action.featureId);
      return;
    case 'start-refactor':
      handlers.startRefactor();
  }
}
