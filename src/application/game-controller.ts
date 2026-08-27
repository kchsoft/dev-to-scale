import {
  BuildableTechnologyId,
  GameEngine,
  ServerSize,
  SkillRef,
  TrafficSpikeResponse,
} from '../core';
import { GameEventProjector } from './game-event-projector';
import type {
  AlertView,
  FeatureCardView,
  GameEventView,
  GameStartConfig,
  GameView,
  InfrastructureCostView,
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
import { GameViewProjector } from './game-view-projector';

export type {
  AlertView,
  FeatureCardView,
  GameEventView,
  GameView,
  InfrastructureCostView,
  RequestTraceView,
  SkillNodeView,
  TechnologyOptionView,
  TopologyEdgeView,
  TopologyNodeView,
  TopologyView,
} from './game-view';

export class GameController {
  readonly #engine: GameEngine;
  readonly #viewProjector: GameViewProjector;
  readonly #eventProjector: GameEventProjector;
  private readonly listeners = new Set<(view: GameView) => void>();

  constructor(config: GameStartConfig) {
    this.#engine = new GameEngine(config);
    this.#viewProjector = new GameViewProjector(this.#engine);
    this.#eventProjector = new GameEventProjector(this.#engine, this.#viewProjector);
  }

  subscribe(listener: (view: GameView) => void): () => void {
    this.listeners.add(listener);
    listener(this.getView());
    return () => this.listeners.delete(listener);
  }

  getView(): GameView {
    return this.#viewProjector.project();
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
  scaleApplication(size: ServerSizeView): void { this.#engine.scaleApplication(size as ServerSize); this.emit(); }
  addApplicationServer(): void { this.#engine.addApplicationServer(); this.emit(); }
  scaleDatabase(size: ServerSizeView): void { this.#engine.scaleDatabase(size as ServerSize); this.emit(); }
  addDatabaseReplica(): void { this.#engine.addDatabaseReplica(); this.emit(); }
  fastTrackCurrentFeature(): void { this.#engine.fastTrackCurrentFeature(); this.emit(); }
  startRefactor(): void { this.#engine.startRefactor(); this.emit(); }
  respondTrafficSpike(response: TrafficResponseChoice): void { this.#engine.respondToTrafficSpike(response as TrafficSpikeResponse); this.emit(); }

  private emit(): void {
    const view = this.getView();
    for (const listener of this.listeners) listener(view);
  }
}
