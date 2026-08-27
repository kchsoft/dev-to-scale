import type { GameEventView, GameView, ObservabilityView, TrafficResponseChoice } from '../application/game-view';
import { money } from './game-format';

interface EventOverlayProps {
  readonly event: GameEventView;
  readonly view: GameView;
  readonly observability: ObservabilityView;
  readonly onDismiss: () => void;
  readonly onRespond: () => void;
  readonly onTrafficResponse: (response: TrafficResponseChoice) => void;
}

export function EventOverlay({ event, view, observability, onDismiss, onRespond, onTrafficResponse }: EventOverlayProps) {
  const incident = event.kind === 'incident';
  const traffic = event.kind === 'traffic';
  const diagnosisText = incident ? event.diagnosis ?? null : null;
  const viral = traffic ? view.operations.trafficSpike : null;
  const dismiss = traffic ? () => onTrafficResponse('RIDE') : onDismiss;
  return <div className="event-overlay"><article className={`event-card ${event.kind}`}><button aria-label="팝업 닫기" onClick={dismiss} className="event-close">×</button><div className="event-scan" /><span className="event-code">{event.kind === 'requirement' ? 'SYSTEM / REQUIREMENT' : incident ? `SYSTEM / INCIDENT / ${observability.level}` : traffic ? 'SYSTEM / TRAFFIC / DECISION' : 'SYSTEM'}</span><div className="event-symbol">{incident ? '⚡' : traffic ? '🔥' : event.kind === 'won' ? '◆' : event.kind === 'bankrupt' ? '×' : '＋'}</div><h2>{event.title}</h2><p>{event.message}</p>{diagnosisText && <p>{diagnosisText}</p>}{traffic && viral && <p>RIDE · 부하 ×1.80 / 성장 +5%p / 무료　·　LIMIT · 부하 ×1.15 / 성장 +1%p / 무료　·　BURST · 부하 ×1.35 / 성장 +5%p / {money(viral.burstCost)}</p>}{event.severity && <strong className="severity-chip">{event.severity}</strong>}<footer>{traffic ? <><button className="secondary" onClick={() => onTrafficResponse('RIDE')}>그냥 버틴다</button><button className="secondary" onClick={() => onTrafficResponse('THROTTLE')}>Traffic Limit</button><button className="primary" disabled={Boolean(viral && view.hud.cash < viral.burstCost)} onClick={() => onTrafficResponse('BURST')}>Emergency Burst · {money(viral?.burstCost ?? 0)}</button></> : <>{incident && <button className="secondary" onClick={onDismiss}>나중에</button>}<button className="primary" onClick={incident ? onRespond : onDismiss}>{incident ? '대응 시작' : '확인'}</button></>}</footer></article></div>;
}
