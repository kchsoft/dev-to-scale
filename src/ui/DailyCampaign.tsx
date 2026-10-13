'use client';

import { useEffect, useState } from 'react';
import { FEATURE_CATALOG, FEATURE_ORDER } from '../gameplay/founder-run';
import { INVESTMENTS, NODE_ORDER } from '../gameplay/operational-model';
import {
  CAMPAIGN_LENGTH, MONTH_LENGTH,
  advanceDailyCampaign, chooseDailyMarket, concedeDailyIncident,
  createDailyCampaign, dailyCampaignOutcome, dailyIncidentInfo, dailyMarketEvent, dailyScore,
  developmentDays, investigateDailyIncident, nextDailyMonth, prepareDailyOperations,
  repairDailyIncident, runUntilDecision, skipDailyFeature, startDailyDevelopment,
  type DailyCampaignState, type EngineeringPace, type RepairChoice,
} from '../gameplay/daily-campaign';

const money = (v: number) => '₩' + Math.round(v).toLocaleString('ko-KR');
const num = (v: number) => Math.round(v).toLocaleString('ko-KR');
const SAVE_KEY = 'dev-to-scale:daily-campaign:v1';

/** A narrow, versioned reader: corrupted or stale saves never crash the play surface. */
function validSave(value: unknown): value is DailyCampaignState {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<DailyCampaignState>;
  return typeof data.seed === 'number' && Number.isSafeInteger(data.seed)
    && typeof data.day === 'number' && Number.isInteger(data.day)
    && data.day >= 1 && data.day <= CAMPAIGN_LENGTH
    && typeof data.cash === 'number' && Number.isFinite(data.cash)
    && typeof data.dau === 'number' && Number.isFinite(data.dau)
    && typeof data.trust === 'number' && Number.isFinite(data.trust)
    && typeof data.debt === 'number' && Number.isFinite(data.debt)
    && typeof data.phase === 'string'
    && ['market', 'planning', 'development', 'operating', 'incident', 'report', 'complete'].includes(data.phase)
    && Array.isArray(data.history) && data.history.length <= CAMPAIGN_LENGTH
    && Array.isArray(data.features) && Array.isArray(data.investments)
    && Array.isArray(data.reports) && Array.isArray(data.marketHistory)
    && data.ops !== null && typeof data.ops === 'object' && !!data.ops.nodes;
}

export function DailyCampaign({ onExit }: { readonly onExit: () => void }) {
  const [game, setGame] = useState<DailyCampaignState>(() => createDailyCampaign());
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [newSeed, setNewSeed] = useState(17);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        const candidate: unknown = JSON.parse(raw);
        if (validSave(candidate)) {
          setGame(candidate);
          setNewSeed(candidate.seed);
        }
      }
    } catch { /* Session remains playable even if storage is blocked. */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(game)); }
    catch { /* Storage quota/privacy mode must not block gameplay. */ }
  }, [game, loaded]);

  const act = (fn: (s: DailyCampaignState) => DailyCampaignState) => {
    try {
      const next = fn(game);
      setGame(next);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '작업을 처리할 수 없습니다.');
    }
  };

  const changeSeed = (seed: number) => {
    setNewSeed(seed);
    setGame(createDailyCampaign(seed));
    setMessage('');
  };
  const event = dailyMarketEvent(game);
  const fault = dailyIncidentInfo(game);
  const outcome = dailyCampaignOutcome(game);
  const currentMonth = game.reports[game.reports.length - 1];
  const availableDays = Math.max(0, CAMPAIGN_LENGTH - game.history.length);
  const latestDays = game.history.slice(-10);
  const peak = game.day <= game.peakUntilDay ? game.peakMultiplier : 1;

  return (
    <main className="founder-run daily-campaign">
      <header className="founder-header">
        <div className="founder-brand">
          <span className="founder-logo">D2S</span>
          <div>
            <span className="founder-overline">DEV TO SCALE / DAILY SIMULATION</span>
            <h1>90-DAY FOUNDER</h1>
            <p>90일 동안 만들고, 배포하고, 운영하면서 살아남으세요.</p>
          </div>
        </div>
        <div className="founder-header-actions">
          <span className="founder-label">MONTH {game.month}/3 · DAY {game.day}</span>
          <button className="founder-ghost" type="button" onClick={onExit}>← 시작 화면</button>
        </div>
      </header>
      <div className="founder-meter" aria-label="90일 캠페인 진행률">
        {Array.from({ length: 3 }, (_, i) => <span className={game.history.length >= (i + 1) * MONTH_LENGTH ? 'reached' : ''} key={i} />)}
      </div>
      <section className="founder-status">
        <Status label="DAY" value={game.day + ' / 90'} sub={num(game.history.length) + '일 운영'} />
        <Status label="DAILY USERS" value={num(game.dau)} sub="활성 사용자" />
        <Status label="CASH" value={money(game.cash)} />
        <Status label="TRUST" value={game.trust + ' / 100'} tone={game.trust < 50 ? 'bad' : 'ok'} />
        <Status label="TECH DEBT" value={game.debt + ' / 100'} tone={game.debt >= 55 ? 'bad' : 'neutral'} />
      </section>
      {message && <p className="daily-error" role="alert">{message}</p>}

      <section className="founder-layout">
        <div className="founder-main">
          {game.phase === 'market' && event && (
            <section className="founder-panel">
              <div className="founder-market-banner">
                <span className="founder-kicker">DAY {game.day} · MONTH {game.month} / MARKET EVENT</span>
                <h2>{event.title}</h2>
                <p>{event.story}</p>
              </div>
              <div className="founder-subtitle"><h3>사업 전략 결정</h3><span className="founder-caption">선택한 성장 전략이 실제 운영 부하에 영향을 줍니다.</span></div>
              <div className="founder-market-options">
                {event.options.map((option) => (
                  <button key={option.id} type="button" className="founder-market-option"
                    disabled={game.cash + option.cashDelta < 0}
                    onClick={() => act((s) => chooseDailyMarket(s, option.id))}>
                    <strong>{option.label}<span aria-hidden="true">↗</span></strong>
                    <span className="founder-muted">{option.description}</span>
                    <span className="founder-market-effects">
                      <span>DAU {option.dauDelta >= 0 ? '+' : ''}{num(option.dauDelta)}</span>
                      <span>현금 {option.cashDelta >= 0 ? '+' : '−'}{money(Math.abs(option.cashDelta))}</span>
                      <span>신뢰 {option.trustDelta >= 0 ? '+' : ''}{option.trustDelta}</span>
                      <span>피크 ×{option.trafficMultiplier.toFixed(2)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {game.phase === 'planning' && (
            <section className="founder-panel">
              <span className="founder-kicker">MONTH {game.month} / PRODUCT & ENGINEERING</span>
              <h2>이번 달 무엇을 출시할까?</h2>
              <p className="founder-muted">사전 투자는 한 번만 할 수 있습니다. 기능을 빠르게 출시하면 성장 시점을 앞당기지만 기술 부채가 증가합니다.</p>
              <div className="founder-subtitle"><h3>01 · 사전 인프라 투자</h3><span className="founder-caption">{game.preparedThisMonth ? '이번 달 투자 완료' : '건너뛰어도 됩니다'}</span></div>
              <div className="founder-investment-grid">
                {INVESTMENTS.map((item) => (
                  <button className={game.investments.includes(item.id) ? 'founder-investment installed' : 'founder-investment'} type="button"
                    key={item.id}
                    disabled={game.preparedThisMonth || game.investments.includes(item.id) || game.cash < item.cost}
                    onClick={() => act((s) => prepareDailyOperations(s, item.id))}>
                    <span><strong>{item.name}</strong><small>{item.description}</small></span>
                    <span className="founder-investment-meta"><b>{game.investments.includes(item.id) ? '도입됨 ✓' : money(item.cost)}</b></span>
                  </button>
                ))}
              </div>
              <div className="founder-subtitle"><h3>02 · 기능 및 개발 속도</h3><span className="founder-caption">일자별 개발 진행 · 개발비 즉시 지출</span></div>
              <div className="daily-development-options">
                {FEATURE_ORDER.filter((id) => !game.features.includes(id)).map((id) => {
                  const feature = FEATURE_CATALOG[id];
                  return (
                    <article key={id} className="daily-feature-card">
                      <strong>{feature.name}</strong>
                      <p>{feature.pitch}</p>
                      <div className="daily-feature-facts"><span>개발비 {money(feature.cost)}</span><span>출시 DAU +{num(feature.users)}</span></div>
                      <div className="daily-feature-buttons">
                        {(['NORMAL', 'FAST_TRACK'] as EngineeringPace[]).map((pace) => (
                          <button type="button" key={pace} disabled={game.cash < feature.cost}
                            onClick={() => act((s) => startDailyDevelopment(s, id, pace))}>
                            {pace === 'NORMAL' ? '기본 개발' : 'Fast Track'} · {developmentDays(id, game.debt, pace)}일
                            <small>기술 부채 +{pace === 'NORMAL' ? 4 : 27}</small>
                          </button>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
              <button className="founder-ghost daily-skip" type="button" onClick={() => act(skipDailyFeature)}>이번 달 신규 기능 없이 운영 →</button>
            </section>
          )}

          {(game.phase === 'development' || game.phase === 'operating') && (
            <section className="founder-panel">
              <span className="founder-kicker">DAY {game.day} / LIVE OPERATIONS</span>
              <h2>{game.phase === 'development' ? '기능 개발 진행 중' : '서비스 운영 중'}</h2>
              {game.job ? (
                <div className="daily-active-job">
                  <div className="founder-choice-head"><strong>{FEATURE_CATALOG[game.job.feature].name}</strong><span>{game.job.total - game.job.remaining} / {game.job.total}일</span></div>
                  <div className="daily-progress"><span style={{ width: ((game.job.total - game.job.remaining) / game.job.total) * 100 + '%' }} /></div>
                  <p>{game.job.pace === 'FAST_TRACK' ? 'Fast Track 진행 중 · 높은 기술 부채' : '기본 일정으로 개발 중'}</p>
                </div>
              ) : (
                <p className="founder-muted">기능이 운영 환경에서 실행 중입니다. 성장에 따른 부하를 살펴보고 다음 날짜를 진행하세요.</p>
              )}
              <div className="daily-actions">
                <button type="button" className="founder-primary" onClick={() => act(advanceDailyCampaign)}>+1일 운영 →</button>
                <button type="button" className="founder-ghost" onClick={() => act((s) => runUntilDecision(s, 7))}>최대 7일 빨리 진행 »</button>
                <button type="button" className="founder-ghost" onClick={() => act((s) => runUntilDecision(s, 30))}>다음 주요 사건까지 »</button>
              </div>
              <h3 className="daily-small-title">최근 일일 기록</h3>
              <div className="daily-ledger">
                {latestDays.length === 0 ? <p className="founder-muted">아직 운영 기록이 없습니다.</p> : latestDays.map((day) => (
                  <div key={day.day} className="daily-ledger-entry">
                    <span className="founder-kicker">D{day.day}</span>
                    <div><strong>{day.event}</strong><small>DAU {num(day.dau)} · 매출 +{money(day.revenue)} · 비용 −{money(day.expense)}</small></div>
                    <span className={day.healthy ? 'daily-ok' : 'daily-warn'}>{day.healthy ? 'STABLE' : 'WARN'}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {game.phase === 'incident' && fault && game.incident && (
            <section className="founder-panel">
              <div className="founder-incident-banner">
                <span className="founder-danger-tag">● INCIDENT · D{game.day} · {game.incident.node}</span>
                <h2>서비스에서 장애가 감지됐습니다</h2>
                <p>새로운 장애가 운영을 중단시켰습니다. 현재 메트릭을 확인하고, 로그와 추적 데이터를 조사해서 원인을 좁혀보세요.</p>
              </div>
              <div className="founder-subtitle"><h3>실시간 관측</h3><span className="founder-caption">원인은 해결하거나 포기한 뒤에 공개됩니다.</span></div>
              <div className="founder-metrics">
                {fault.metrics.map((metric) => (
                  <div className={metric.critical ? 'founder-metric critical' : 'founder-metric'} key={metric.label}>
                    <small>{metric.label}</small><strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
              <div className="founder-subtitle"><h3>증거 수집</h3><span className="founder-caption">조사마다 장애 시간과 비용이 증가합니다.</span></div>
              <div className="founder-probes">
                {fault.probes.map((probe) => {
                  const looked = game.incident!.findings.includes(probe.id);
                  const cost = game.investments.includes('APM') ? 3000 : 10000;
                  return (
                    <div className={looked ? 'founder-probe revealed' : 'founder-probe'} key={probe.id}>
                      <div className="founder-probe-row">
                        <strong>{probe.title}</strong>
                        <button type="button" className="founder-small-button" disabled={looked || game.cash < cost}
                          onClick={() => act((s) => investigateDailyIncident(s, probe.id))}>
                          {looked ? '수집 완료 ✓' : '분석 · ' + money(cost)}
                        </button>
                      </div>
                      <p>{looked ? probe.finding : '진단할 정보가 있습니다.'}</p>
                    </div>
                  );
                })}
              </div>
              <div className="founder-subtitle"><h3>조치 적용</h3><span className="founder-caption">가능한 모든 조치가 현재 장애를 해결하는 것은 아닙니다.</span></div>
              <div className="daily-repair-grid">
                {INVESTMENTS.filter((item) => item.id !== 'APM' && !game.investments.includes(item.id)).map((item) => (
                  <button type="button" className="founder-remedy" key={item.id} disabled={game.cash < item.cost}
                    onClick={() => act((s) => repairDailyIncident(s, item.id))}>
                    <span><strong>{item.name}</strong><small>{item.description}</small></span>
                    <span className="founder-remedy-cost"><b>{money(item.cost)}</b><small>8분</small></span>
                  </button>
                ))}
                <button type="button" className="founder-remedy" disabled={game.cash < 80000}
                  onClick={() => act((s) => repairDailyIncident(s, 'REFACTOR'))}>
                  <span><strong>회귀 결함 검증 및 리팩터링</strong><small>기술 부채 −45 · 개발 회귀 문제를 줄입니다.</small></span>
                  <span className="founder-remedy-cost"><b>{money(80000)}</b><small>11분</small></span>
                </button>
                <button type="button" className="founder-remedy" disabled={game.cash < 25000 || game.incident.attempted.includes('THROTTLE')}
                  onClick={() => act((s) => repairDailyIncident(s, 'THROTTLE'))}>
                  <span><strong>긴급 Rate Limit</strong><small>피크 트래픽 일부 완화 · 근본 해결은 아님</small></span>
                  <span className="founder-remedy-cost"><b>{money(25000)}</b><small>4분</small></span>
                </button>
              </div>
              <button className="founder-abort" type="button" onClick={() => act(concedeDailyIncident)}>서비스 일부 중단하고 피해 감수</button>
            </section>
          )}

          {game.phase === 'report' && currentMonth && (
            <section className="founder-panel founder-debrief">
              <span className="founder-kicker">MONTH {game.month} / OPERATING REPORT</span>
              <h2>Day {game.day} · 월말 정산</h2>
              <p className="founder-muted">30번의 일별 운영 결과가 누적되었습니다. 이번 달의 수익, 비용, 장애와 기술 부채를 확인하세요.</p>
              <div className="founder-report-grid">
                <Status label="REVENUE" value={money(currentMonth.revenue)} tone="ok" />
                <Status label="COST" value={money(currentMonth.cost)} />
                <Status label="INCIDENTS" value={String(currentMonth.incidents)} />
                <Status label="HEALTHY DAYS" value={currentMonth.healthyDays + '/30'} tone="ok" />
              </div>
              <div className="founder-postmortem">
                <span className="founder-kicker">MONTHLY OUTCOME</span>
                <strong>{currentMonth.feature ? FEATURE_CATALOG[currentMonth.feature].name + ' 출시' : '신규 기능 없이 운영'}</strong>
                <p>다운타임 {currentMonth.outageMinutes}분 · 월말 DAU {num(currentMonth.endDau)} · 기술 부채 {currentMonth.endDebt}/100</p>
              </div>
              <button type="button" className="founder-primary daily-report-next" onClick={() => act(nextDailyMonth)}>
                {game.month === 3 ? '90일 최종 결과 →' : '다음 달 시장 이벤트 →'}
              </button>
            </section>
          )}

          {game.phase === 'complete' && (
            <section className="founder-panel founder-finish">
              <span className="founder-kicker">90-DAY POSTMORTEM · SEED #{game.seed}</span>
              <h2>{outcome === 'won' ? '스타트업 성장 목표 달성!' : outcome === 'failed' ? '스타트업 경영 실패' : '살아남았지만 목표는 미달했어요.'}</h2>
              <div className="founder-final-score">{num(dailyScore(game))}<small>CAMPAIGN SCORE</small></div>
              <p>총 {game.history.length}일 운영 · 출시 {game.features.length}/3개 · 안정적인 날 {game.healthyDays}/90일</p>
              <div className="founder-campaign-result">
                <span>최종 DAU <strong>{num(game.dau)} / 1,700</strong></span>
                <span>최종 신뢰 <strong>{game.trust} / 50</strong></span>
                <span>최종 현금 <strong>{money(game.cash)}</strong></span>
                <span>기술 부채 <strong>{game.debt} / 100</strong></span>
              </div>
              <div className="founder-history">
                {game.reports.map((report) => (
                  <div key={report.month}><strong>MONTH {report.month} · {report.feature ? FEATURE_CATALOG[report.feature].name : '운영 집중'}</strong>
                    <span>안정 {report.healthyDays}/30일 · 장애 {report.incidents}건 · 수익 {money(report.revenue - report.cost)}</span>
                  </div>
                ))}
              </div>
              <button type="button" className="founder-primary" onClick={() => changeSeed(game.seed)}>같은 시장 환경에서 재도전 ↻</button>
              <button type="button" className="founder-ghost founder-another-seed" onClick={() => changeSeed(game.seed + 1)}>다른 시장 환경에서 도전 →</button>
            </section>
          )}
        </div>

        <aside className="founder-sidebar">
          <section className="founder-aside-panel">
            <span className="founder-kicker">LIVE ARCHITECTURE</span>
            <h3>현재 인프라 부하</h3>
            <div className="founder-topology">
              {NODE_ORDER.map((node) => {
                const load = game.ops.nodes[node];
                const affected = game.incident?.node === node;
                return (
                  <div className="founder-node-block" key={node}>
                    <div className={affected ? 'founder-node alarm' : 'founder-node'}>
                      <small>{node}</small><strong>{load.utilization}%</strong>
                      <div className="founder-load-track"><span style={{ width: load.utilization + '%' }} /></div>
                      <small>수요 {Math.round(load.demand)} / 용량 {load.capacity}</small>
                    </div>
                    {node !== 'QUEUE' && <div className="founder-link">↓</div>}
                  </div>
                );
              })}
            </div>
            <p className="founder-muted founder-topology-caption">피크 ×{peak.toFixed(2)} · P95 {game.ops.p95Ms}ms · 게임용 처리량 단위</p>
          </section>
          <section className="founder-aside-panel">
            <span className="founder-kicker">OPERATION STATUS</span><h3>현재 상황</h3>
            <p className="founder-feedback" role="status">{game.feedback}</p>
            <div className="founder-incident-stats">
              <span>운영한 날짜 <strong>{game.history.length}/90</strong></span>
              <span>올해 누적 건강 일수 <strong>{game.healthyDays}</strong></span>
              <span>이번 달 매출 <strong>{money(game.monthRevenue)}</strong></span>
              <span>이번 달 비용 <strong>{money(game.monthCost)}</strong></span>
              <span>시장 부하 종료일 <strong>{game.peakUntilDay || '종료'}</strong></span>
            </div>
          </section>
          <section className="founder-aside-panel">
            <span className="founder-kicker">ROADMAP</span><h3>기술과 기능</h3>
            <p className="founder-muted">출시 기능 {game.features.length}개 · 도입 기술 {game.investments.length}개</p>
            <ol className="founder-roadmap">
              {game.features.map((id) => <li key={id}>{FEATURE_CATALOG[id].name}</li>)}
              {game.investments.map((id) => <li key={id}>{INVESTMENTS.find((i) => i.id === id)?.name}</li>)}
            </ol>
          </section>
          <section className="founder-aside-panel">
            <span className="founder-kicker">LOCAL SAVE</span><h3>진행 상태 저장</h3>
            <p className="founder-muted">이 브라우저에 자동 저장돼요. 다른 장치와 동기화되지는 않습니다.</p>
            <button className="founder-ghost daily-reset" type="button" onClick={() => changeSeed(newSeed)}>진행 초기화 ↻</button>
          </section>
        </aside>
      </section>
      <footer className="founder-footer">일 단위 시뮬레이션 · 테스트용 경제 및 인프라 수치 · 실제 클라우드 벤치마크가 아닙니다.</footer>
    </main>
  );
}

function Status({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'ok' | 'bad' | 'neutral'
}) {
  return <div className={'founder-stat ' + (tone === 'ok' ? 'good' : tone === 'bad' ? 'danger' : '')}>
    <small>{label}</small><strong>{value}</strong>{sub && <span>{sub}</span>}
  </div>;
}
