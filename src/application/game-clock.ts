import { GameController, GameEventView } from './game-controller';

export type GameSpeed = 0 | 1 | 2;

export class GameClock {
  private timer: ReturnType<typeof setInterval> | null = null;
  private _speed: GameSpeed = 0;
  private readonly listeners = new Set<(speed: GameSpeed) => void>();

  constructor(
    private readonly controller: GameController,
    private readonly onEvents?: (events: GameEventView[]) => void,
  ) {}

  get speed(): GameSpeed { return this._speed; }

  subscribe(listener: (speed: GameSpeed) => void): () => void {
    this.listeners.add(listener);
    listener(this._speed);
    return () => this.listeners.delete(listener);
  }

  setSpeed(speed: GameSpeed): void {
    if (this._speed === speed) return;
    this.clearTimer();
    this._speed = speed;
    this.emit();

    if (speed === 0) return;
    const interval = speed === 1 ? 10_000 : 5_000;
    this.timer = setInterval(() => this.tick(), interval);
  }

  pause(): void { this.setSpeed(0); }

  advanceOneDay(): void { this.tick(); }

  dispose(): void {
    this.clearTimer();
    this.listeners.clear();
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

  private emit(): void {
    for (const listener of this.listeners) listener(this._speed);
  }
}
