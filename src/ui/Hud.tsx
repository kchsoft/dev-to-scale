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
  const metrics = [
    ['DATE', `M${view.hud.month} · D${view.hud.dayOfMonth}`, `정산까지 ${view.hud.daysUntilSettlement}일`],
    ['DAU', number(view.hud.dau), '일간 활성 사용자'],
    ['CASH', money(view.hud.cash), '정산 시 실제 증감'],
    ['월 예상 매출', money(view.hud.monthlyRevenue), '현재 DAU 기준'],
    ['월 예상 비용', money(view.hud.monthlyCost), '인프라 + AI'],
  ];
  const progressPercent = Math.max(0, Math.min(100, dayProgress * 100));
  const last = view.hud.lastSettlement;
  return <header className="hud"><div className="hud-status"><span className={`status-dot ${view.hud.status.toLowerCase()}`} /><div><strong>{view.hud.launched ? 'SERVICE ONLINE' : 'BUILDING MVP'}</strong><small>{view.hud.status}</small></div></div><div className="hud-metrics">{metrics.map(([label, value, detail]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</div><div className={`profit-chip ${view.hud.monthlyProfit >= 0 ? 'positive' : 'negative'}`}><span>월 예상 순이익</span><strong>{money(view.hud.monthlyProfit)}</strong><small>{last ? `직전 M${last.month}: ${last.profit >= 0 ? '+' : ''}${money(last.profit)}` : '첫 정산 대기'}</small></div><div className="clock-controls"><button className={speed === 0 ? 'active' : ''} onClick={() => onSpeed(0)}>Ⅱ</button><button className={speed === 1 ? 'active' : ''} onClick={() => onSpeed(1)}>▶ <small>x1</small></button><button className={speed === 2 ? 'active' : ''} onClick={() => onSpeed(2)}>▶▶ <small>x2</small></button><button title="하루 진행" onClick={onStep}>+1D</button></div><div className="day-progress-shell" aria-label={`M${view.hud.month} D${view.hud.dayOfMonth} progress ${Math.round(progressPercent)} percent`} title={speed === 0 ? `M${view.hud.month} D${view.hud.dayOfMonth} · PAUSED` : `M${view.hud.month} D${view.hud.dayOfMonth} 진행 중`}><span style={{ width: `${progressPercent}%` }} /></div></header>;
}
