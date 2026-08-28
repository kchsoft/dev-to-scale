import type { GameView, ObservabilityView } from '../application/game-view';
import { money, number } from './game-format';
import { PageHeading } from './game-panel';
import { LoadMini } from './ServiceDashboard';

export function ReportPanel({ view, observability }: { view: GameView; observability: ObservabilityView }) {
  const cards = [['DAU', number(view.hud.dau), '현재 일간 활성 사용자'], ['월 예상 매출', money(view.hud.monthlyRevenue), '현재 DAU 기준 예상치'], ['월 예상 비용', money(view.hud.monthlyCost), '인프라 + AI 예상치'], ['월 예상 순이익', money(view.hud.monthlyProfit), '실제 반영은 월말 정산']];
  const last = view.hud.lastSettlement;
  return <section className="page-panel"><PageHeading eyebrow="OPERATING REPORT" title="현재 런 요약" description={`현재 M${view.hud.month} D${view.hud.dayOfMonth} · Observability ${observability.level} · 다음 CASH 정산까지 ${view.hud.daysUntilSettlement}일`} /><div className="report-grid">{cards.map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small><i /></article>)}</div>{last && <div className="settlement-summary"><span>LAST SETTLEMENT · M{last.month}</span><strong>{last.profit >= 0 ? '+' : ''}{money(last.profit)}</strong><small>매출 {money(last.revenue)} · 비용 {money(last.totalCost)} · 정산 후 CASH {money(last.cashAfter)}</small></div>}<div className="report-loads resource-report-loads">{view.service.visibleLoads.map((metric) => <LoadMini key={metric.id} metric={metric} />)}</div><div className="settlement-summary"><span>OBSERVABILITY · {observability.level}</span><strong>{observability.label}</strong><small>{observability.nextUnlock ?? '모든 관측 정보 해금 완료'}</small></div></section>;
}
