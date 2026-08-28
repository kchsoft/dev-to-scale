import {
  BuildableTechnologyId,
  GameEngine,
  ServerSize,
  SkillRef,
  TrafficSpikeResponse,
} from '../core';
import type { InfrastructureNodeId } from '../core';
import { DevelopmentWorkbenchProjector } from './development-workbench-projector';
import type { DevelopmentWorkbenchView } from './development-view';
import { GameEventProjector } from './game-event-projector';
import type {
  AlertView,
  FeatureCardView,
  GameEventView,
  GameStartConfig,
  GameView as BaseGameView,
  RequestTraceView,
  ServerSizeView,
  SkillNodeView,
  SkillRefView,
  TechnologyIdView,
  TechnologyOptionView,
  TopologyEdgeView,
  TopologyNodeView,
  TopologyView,
  TrafficResponseChoice,
} from './game-view';
import { GameServiceProjector } from './game-service-projector';
import { GameViewProjector } from './game-view-projector';

export type {
  AlertView,
  FeatureCardView,
  GameEventView,
  RequestTraceView,
  SkillNodeView,
  TechnologyOptionView,
  TopologyEdgeView,
  TopologyNodeView,
  TopologyView,
} from './game-view';
export type {
  DevelopmentActionView,
  DevelopmentOptionKind,
  DevelopmentOptionState,
  DevelopmentOptionView,
  DevelopmentWorkbenchView,
} from './development-view';

export interface GameView extends BaseGameView {
  readonly development: DevelopmentWorkbenchView;
}

export class GameController {
  readonly #engine: GameEngine;
  readonly #viewProjector: GameViewProjector;
  readonly #developmentProjector = new DevelopmentWorkbenchProjector();
  readonly #eventProjector: GameEventProjector;
  private readonly listeners = new Set<(view: GameView) => void>();

  constructor(config: GameStartConfig) {
    this.#engine = new GameEngine(config);
    const serviceProjector = new GameServiceProjector(this.#engine);
    this.#viewProjector = new GameViewProjector(this.#engine, serviceProjector);
    this.#eventProjector = new GameEventProjector(this.#engine, serviceProjector);
  }

  subscribe(listener: (view: GameView) => void): () => void {
    this.listeners.add(listener);
    listener(this.getView());
    return () => this.listeners.delete(listener);
  }

  getView(): GameView {
    const baseView = this.#viewProjector.project();
    return {
      ...baseView,
      development: this.#developmentProjector.project(baseView),
    };
  }

  advanceDay(): GameEventView[] {
    const before = this.#engine.snapshot;
    const after = this.#engine.advanceDay();
    const events = [...this.#eventProjector.project(before, after)];
    this.emit();
    return events;
  }

  startTechnologyBuild(id: TechnologyIdView): void { this.#engine.startTechnologyBuild(id as BuildableTechnologyId); this.emit(); }
  startLearning(ref: SkillRefView): void { this.#engine.startLearning(ref as SkillRef); this.emit(); }
  startIncidentResponse(id: string): void { this.#engine.startIncidentResponse(id); this.emit(); }
  resizeInfrastructureNode(nodeId: string, size: ServerSizeView): void {
    this.#engine.resizeInfrastructureNode(nodeId as InfrastructureNodeId, size as ServerSize);
    this.emit();
  }
  scaleOutInfrastructureNode(nodeId: string): void {
    this.#engine.scaleOutInfrastructureNode(nodeId as InfrastructureNodeId);
    this.emit();
  }
  fastTrackCurrentFeature(): void { this.#engine.fastTrackCurrentFeature(); this.emit(); }
  startRefactor(): void { this.#engine.startRefactor(); this.emit(); }
  respondTrafficSpike(response: TrafficResponseChoice): void { this.#engine.respondToTrafficSpike(response as TrafficSpikeResponse); this.emit(); }

  private emit(): void {
    const view = this.getView();
    for (const listener of this.listeners) listener(view);
  }
}
