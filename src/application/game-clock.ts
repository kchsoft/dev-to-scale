import { GameController, GameEventView } from './game-controller';

export type GameSpeed = 0 | 1 | 2;

const PROGRESS_STEP_MS = 100;

export class GameClock {
  private timer: ReturnType<typeof setInterval> | null = null;
  private _speed: GameSpeed = 0;
  private _dayProgress = 0;
  private readonly listeners = new Set<(speed: GameSpeed) => void>();
  private readonly progressListeners = new Set<(progress: number) => void>();

  constructor(
    private readonly controller: GameController,
    private readonly onEvents?: (events: GameEventView[]) => void,
  ) {}

  get speed(): GameSpeed { return this._speed; }
  get dayProgress(): number { return this._dayProgress; }

  subscribe(listener: (speed: GameSpeed) => void): () => void {
    this.listeners.add(listener);
    listener(this._speed);
    return () => this.listeners.delete(listener);
  }

  subscribeProgress(listener: (progress: number) => void): () => void {
    this.progressListeners.add(listener);
    listener(this._dayProgress);
    return () => this.progressListeners.delete(listener);
  }

  setSpeed(speed: GameSpeed): void {
    if (this._speed === speed) return;
    this.clearTimer();
    this._speed = speed;
    this.emitSpeed();

    if (speed === 0) return;
    this.timer = setInterval(() => this.advanceProgress(), PROGRESS_STEP_MS);
  }

  pause(): void { this.setSpeed(0); }

  advanceOneDay(): void {
    this._dayProgress = 0;
    this.emitProgress();
    this.tick();
  }

  dispose(): void {
    this.clearTimer();
    this.listeners.clear();
    this.progressListeners.clear();
  }

  private advanceProgress(): void {
    if (this._speed === 0) return;
    const dayDuration = this._speed === 1 ? 10_000 : 5_000;
    this._dayProgress = Math.min(1, this._dayProgress + PROGRESS_STEP_MS / dayDuration);

    if (this._dayProgress >= 1 - Number.EPSILON * 10) {
      this._dayProgress = 0;
      this.emitProgress();
      this.tick();
      return;
    }

    this.emitProgress();
  }

  private tick(): void {
    const events = this.controller.advanceDay();
    if (events.length > 0) this.onEvents?.(events);
    if (events.some((event) => event.autoPause)) this.pause();
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private emitSpeed(): void {
    for (const listener of this.listeners) listener(this._speed);
  }

  private emitProgress(): void {
    for (const listener of this.progressListeners) listener(this._dayProgress);
  }
}
