import type { GameSpeed } from '../application/game-clock';
import type { GameView } from '../application/game-view';
import { money, number } from './game-format';

interface HudProps {
  readonly view: GameView;
  readonly speed: GameSpeed;
  readonly dayProgress: number;
  readonly onSpeed: (speed: GameSpeed) => void;
  readonly onStep: () => void;
}

export function Hud({ view, speed, dayProgress, onSpeed, onStep }: HudProps) {
  const progressPercent = Math.max(0, Math.min(100, dayProgress * 100));
  const serviceLabel = view.hud.launched ? 'SERVICE ONLINE' : 'BUILDING MVP';

  return (
    <header className="hud">
      <div className="hud-primary">
        <div className="hud-status">
          <span className={`status-dot ${view.hud.status.toLowerCase()}`} />
          <div>
            <strong>{serviceLabel}</strong>
            <small>{view.hud.status}</small>
          </div>
        </div>
        <div className="hud-vital">
          <span>DATE</span>
          <strong>M{view.hud.month} · D{view.hud.dayOfMonth}</strong>
          <small>정산 D-{view.hud.daysUntilSettlement}</small>
        </div>
        <div className="hud-vital">
          <span>DAU</span>
          <strong>{number(view.hud.dau)}</strong>
          <small>ACTIVE USERS</small>
        </div>
        <div className="hud-vital">
          <span>CASH</span>
          <strong>{money(view.hud.cash)}</strong>
          <small>월말 정산 반영</small>
        </div>
      </div>

      <div className={`hud-finance ${view.hud.monthlyProfit >= 0 ? 'positive' : 'negative'}`}>
        <span>MONTHLY</span>
        <div><small>REV</small><b>{money(view.hud.monthlyRevenue)}</b></div>
        <div><small>COST</small><b>{money(view.hud.monthlyCost)}</b></div>
        <div><small>NET</small><strong>{money(view.hud.monthlyProfit)}</strong></div>
      </div>

      <div className="clock-controls" aria-label="게임 속도">
        <button aria-label="일시정지" aria-pressed={speed === 0} className={speed === 0 ? 'active' : ''} onClick={() => onSpeed(0)}>Ⅱ</button>
        <button aria-label="1배속" aria-pressed={speed === 1} className={speed === 1 ? 'active' : ''} onClick={() => onSpeed(1)}>▶ <small>x1</small></button>
        <button aria-label="2배속" aria-pressed={speed === 2} className={speed === 2 ? 'active' : ''} onClick={() => onSpeed(2)}>▶▶ <small>x2</small></button>
        <button title="하루 진행" aria-label="하루 진행" onClick={onStep}>+1D</button>
      </div>

      <div className="service-pulse">
        <div className="service-pulse-copy">
          <span>SERVICE PULSE</span>
          <strong>{view.service.summary.headline}</strong>
          <small>{view.service.summary.detail}</small>
        </div>
        <div
          className="day-progress-shell"
          aria-label={`M${view.hud.month} D${view.hud.dayOfMonth} progress ${Math.round(progressPercent)} percent`}
          title={speed === 0 ? `M${view.hud.month} D${view.hud.dayOfMonth} · PAUSED` : `M${view.hud.month} D${view.hud.dayOfMonth} 진행 중`}
        >
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        <span className="service-pulse-time">{speed === 0 ? 'PAUSED' : `LIVE · x${speed}`}</span>
      </div>
    </header>
  );
}
