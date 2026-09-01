import type { GameView, ObservabilityView } from '../application/game-view';
import { money, number } from './game-format';
import { PageHeading } from './game-panel';
import { LoadMini } from './ServiceDashboard';

export function ReportPanel({ view, observability }: { view: GameView; observability: ObservabilityView }) {
  const financials = [
    ['DAU', number(view.hud.dau), '현재 일간 활성 사용자'],
    ['REVENUE', money(view.hud.monthlyRevenue), '현재 DAU 기준 월 예상 매출'],
    ['COST', money(view.hud.monthlyCost), '인프라 + AI 월 예상 비용'],
    ['NET', money(view.hud.monthlyProfit), '실제 CASH 반영은 월말 정산'],
  ] as const;
  const last = view.hud.lastSettlement;

  return <section className="page-panel operating-report">
    <PageHeading
      eyebrow="OPERATING REPORT"
      title="CURRENT RUN"
      description={`M${view.hud.month} D${view.hud.dayOfMonth} · Observability ${observability.level} · 다음 CASH 정산까지 ${view.hud.daysUntilSettlement}일`}
    />

    <section className="report-section report-financials" aria-labelledby="report-financials-title">
      <header className="report-section-heading">
        <div><span>FINANCIALS</span><strong id="report-financials-title">현재 운영 규모</strong></div>
        <small>MONTHLY ESTIMATE</small>
      </header>
      <div className="report-grid">
        {financials.map(([label, value, detail]) => <article key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{detail}</small>
          <i />
        </article>)}
      </div>
      {last && <div className="settlement-summary report-settlement">
        <span>LAST SETTLEMENT · M{last.month}</span>
        <strong>{last.profit >= 0 ? '+' : ''}{money(last.profit)}</strong>
        <small>매출 {money(last.revenue)} · 비용 {money(last.totalCost)} · 정산 후 CASH {money(last.cashAfter)}</small>
      </div>}
    </section>

    <section className="report-section report-system" aria-labelledby="report-system-title">
      <header className="report-section-heading">
        <div><span>SYSTEM LOAD</span><strong id="report-system-title">현재 서비스 압력</strong></div>
        <small>OBS · {observability.level}</small>
      </header>
      <div className="report-loads resource-report-loads">
        {view.service.visibleLoads.map((metric) => <LoadMini key={metric.id} metric={metric} />)}
      </div>
      <div className="settlement-summary report-observability">
        <span>OBSERVABILITY · {observability.level}</span>
        <strong>{observability.label}</strong>
        <small>{observability.nextUnlock ?? '모든 관측 정보 해금 완료'}</small>
      </div>
    </section>
  </section>;
}
