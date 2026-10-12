'use client';

import { useState } from 'react';
import {
  FEATURE_CATALOG, FEATURE_ORDER, MAX_SPRINTS,
  createFounderRun, currentIncident, launchFeature, investigate, remediate,
  continueFounderRun, abandonIncident, investInOperations, totalScore,
  type FeatureId, type FounderState, type ProbeId,
} from '../gameplay/founder-run';
import { INVESTMENTS, NODE_ORDER, calculateOperations } from '../gameplay/operational-model';

const won = (value: number) => '₩' + Math.round(value).toLocaleString('ko-KR');
const number = (value: number) => Math.round(value).toLocaleString('ko-KR');

export function FounderRun({ onExit }: { readonly onExit: () => void }) {
  const [game, setGame] = useState<FounderState>(createFounderRun);
  const incident = currentIncident(game);
  const currentReport = game.reports[game.reports.length - 1];

  const start = (featureId: FeatureId) => setGame((state) => launchFeature(state, featureId));
  const read = (probeId: ProbeId) => setGame((state) => investigate(state, probeId));
  const respond = (remedyId: string) => setGame((state) => remediate(state, remedyId));

  return (
    <main className="founder-run">
      <header className="founder-header">
        <div className="founder-brand">
          <span className="founder-logo">D2S</span>
          <div>
            <span className="founder-overline">DEV TO SCALE / PLAYABLE EXPERIMENT</span>
            <h1>FOUNDER RUN</h1>
            <p>당신의 선택으로 키우고, 직접 진단해서 살려내세요.</p>
          </div>
        </div>
        <div className="founder-header-actions">
          <span className="founder-label">SPRINT {game.sprint} / {MAX_SPRINTS}</span>
          <button type="button" className="founder-ghost" onClick={onExit}>← 게임 선택</button>
        </div>
      </header>

      <div className="founder-meter" aria-label="진행한 스프린트">
        {Array.from({ length: MAX_SPRINTS }, (_, index) => (
          <span key={index} className={index < game.sprint ? 'reached' : ''} />
        ))}
      </div>

      <section className="founder-status" aria-label="현재 회사 상태">
        <Status label="GAME DAY" value={'D' + game.day} />
        <Status label="DAILY USERS" value={number(game.dau)} detail="DAU" />
        <Status label="AVAILABLE CASH" value={won(game.cash)} />
        <Status label="USER TRUST" value={String(game.trust) + ' / 100'} tone={game.trust < 45 ? 'danger' : 'good'} />
        <Status label="TOTAL SCORE" value={number(totalScore(game))} />
      </section>

      <section className="founder-layout">
        <div className="founder-main">
          {game.phase === 'planning' && (
            <section className="founder-panel">
              <p className="founder-kicker">01 / PRODUCT STRATEGY</p>
              <h2>이번 스프린트에 무엇을 출시할까?</h2>
              <p className="founder-muted">
                기능을 선택하면 사용자가 증가하지만 새로운 운영 부하도 생깁니다.
                사용자가 늘어나는 것만으로 성공하는 게임은 아닙니다.
              </p>

              <section className="founder-investment-section" aria-labelledby="founder-investment-title">
                <div className="founder-subtitle">
                  <div>
                    <span className="founder-kicker">PREPARATION / OPTIONAL</span>
                    <h3 id="founder-investment-title">출시 전 사전 투자</h3>
                  </div>
                  <span className="founder-caption">{game.investedThisSprint ? '이번 스프린트 투자 완료' : '스프린트당 최대 1개 · 투자 없이 출시 가능'}</span>
                </div>
                <div className="founder-investment-grid">
                  {INVESTMENTS.map((investment) => {
                    const installed = game.investments.includes(investment.id);
                    return (
                      <button type="button" key={investment.id} className={installed ? 'founder-investment installed' : 'founder-investment'}
                        disabled={installed || game.investedThisSprint || game.cash < investment.cost}
                        onClick={() => setGame((state) => investInOperations(state, investment.id))}>
                        <span><strong>{investment.name}</strong><small>{investment.description}</small></span>
                        <span className="founder-investment-meta"><b>{installed ? '도입됨 ✓' : won(investment.cost)}</b><small>{investment.relatedTo}</small></span>
                      </button>
                    );
                  })}
                </div>
              </section>
              <div className="founder-subtitle">
                <div><span className="founder-kicker">CHOOSE NEXT FEATURE</span><h3>기능 출시 결정</h3></div>
                <span className="founder-caption">선택한 기능에 따라 실제 부하가 달라집니다.</span>
              </div>
              <div className="founder-choice-grid">
                {FEATURE_ORDER.filter((id) => !game.completed.includes(id)).map((id) => {
                  const feature = FEATURE_CATALOG[id];
                  const projection = calculateOperations([...game.completed, id], game.investments, game.dau + feature.users);
                  const maximumLoad = Math.round(Math.max(...NODE_ORDER.map((node) => projection.nodes[node].ratio)) * 100);
                  return (
                    <button type="button" key={feature.id} className="founder-choice" disabled={feature.cost > game.cash} onClick={() => start(feature.id)}>
                      <span className="founder-choice-head"><strong>{feature.name}</strong><b>↗</b></span>
                      <span className="founder-muted">{feature.pitch}</span>
                      <span className="founder-choice-data">
                        <span>개발비 <b>{won(feature.cost)}</b></span>
                        <span>신규 DAU <b>+{number(feature.users)}</b></span>
                      </span>
                      <span className="founder-risk">⚠ {feature.risk} · 예상 최고 부하 {maximumLoad}%</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {game.phase === 'incident' && incident && (
            <section className="founder-panel founder-incident">
              <div className="founder-incident-banner">
                <span className="founder-danger-tag">● SEV-1 / PRODUCTION INCIDENT</span>
                <h2>{incident.title}</h2>
                <p>{incident.story}</p>
              </div>
              <div className="founder-subtitle">
                <div><span className="founder-kicker">02 / OBSERVE</span><h3>시스템 관측</h3></div>
                <span className="founder-caption">원인은 공개되지 않습니다. 증거를 직접 확인하세요.</span>
              </div>
              <div className="founder-metrics">
                {incident.metrics.map((metric) => (
                  <div key={metric.label} className={metric.critical ? 'founder-metric critical' : 'founder-metric'}>
                    <small>{metric.label}</small><strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
              <div className="founder-subtitle">
                <div><span className="founder-kicker">03 / INVESTIGATE</span><h3>진단 도구</h3></div>
                <span className="founder-caption">조사당 {game.investments.includes('APM') ? won(3000) + ' · 1분' : won(10000) + ' · 3분'} 소요</span>
              </div>
              <div className="founder-probes">
                {incident.probes.map((probe) => {
                  const revealed = game.examined.includes(probe.id);
                  return (
                    <div key={probe.id} className={revealed ? 'founder-probe revealed' : 'founder-probe'}>
                      <div className="founder-probe-row">
                        <strong>{probe.name}</strong>
                        <button type="button" className="founder-small-button" disabled={revealed || game.cash < probe.cost} onClick={() => read(probe.id)}>
                          {revealed ? '확인 완료 ✓' : '증거 수집 →'}
                        </button>
                      </div>
                      {revealed ? <p>{probe.finding}</p> : <p className="founder-muted">관측 자료를 수집하면 이곳에 분석 결과가 표시됩니다.</p>}
                    </div>
                  );
                })}
              </div>
              <div className="founder-subtitle">
                <div><span className="founder-kicker">04 / TAKE ACTION</span><h3>어떻게 복구할까?</h3></div>
                <span className="founder-caption">임시 완화와 근본 해결은 다릅니다.</span>
              </div>
              <div className="founder-remedies">
                {incident.remedies.map((remedy) => {
                  const used = game.usedRemedies.includes(remedy.id);
                  return (
                    <button type="button" className="founder-remedy" key={remedy.id}
                      onClick={() => respond(remedy.id)}
                      disabled={used || game.cash < remedy.cost}>
                      <span><strong>{remedy.label}</strong><small>{remedy.description}</small></span>
                      <span className="founder-remedy-cost">
                        <b>{won(remedy.cost)}</b><small>{remedy.minutes}분 · {used ? '시도함' : '선택 →'}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <button className="founder-abort" type="button" onClick={() => setGame(abandonIncident)}>
                복구를 포기하고 서비스 중단 (큰 손실)
              </button>
            </section>
          )}

          {game.phase === 'debrief' && currentReport && (
            <section className="founder-panel founder-debrief">
              <p className="founder-kicker">POSTMORTEM / SPRINT {currentReport.sprint}</p>
              <h2>{!currentReport.fixed ? '장애 대응 실패' : currentReport.incident === '장애 없는 안정적인 기능 출시' ? '장애 없는 안정적인 출시' : '서비스 복구 완료'}</h2>
              <p className="founder-muted">사전 예방과 복구 과정에서 사용한 비용, 사용자 손실, 안정성을 함께 평가합니다.</p>
              <div className="founder-report-grid">
                <Status label="OUTAGE" value={currentReport.downtimeMinutes + '분'} />
                <Status label="INVESTIGATIONS" value={String(currentReport.investigationCount)} />
                <Status label="REMEDIATIONS" value={String(currentReport.actionCount)} />
                <Status label="SPRINT SCORE" value={number(currentReport.score)} tone="good" />
              </div>
              <div className="founder-postmortem">
                <span className="founder-kicker">{currentReport.incident === '장애 없는 안정적인 기능 출시' ? 'PREVENTION / 사전 예방 성공' : 'ROOT CAUSE / 근본 원인'}</span>
                <strong>{currentReport.cause}</strong>
                <p>{incident?.lesson ?? '시스템 용량과 사전 투자 덕분에 이 기능을 장애 없이 출시했습니다.'}</p>
              </div>
              <div className="founder-settlement">
                <span>이번 기간 수익 <b>+{won(currentReport.revenue)}</b></span>
                <span>운영 비용 <b>−{won(currentReport.expenses)}</b></span>
                <span>종료 시 DAU <b>{number(currentReport.finalDau)}</b></span>
                <span>종료 시 신뢰도 <b>{currentReport.finalTrust}/100</b></span>
              </div>
              <button type="button" className="founder-primary" onClick={() => setGame(continueFounderRun)}>
                {game.sprint === MAX_SPRINTS || game.cash <= 0 || game.trust <= 0 ? '최종 결과 확인 →' : '다음 스프린트 →'}
              </button>
            </section>
          )}

          {game.phase === 'complete' && (
            <section className="founder-panel founder-finish">
              <span className="founder-kicker">CAMPAIGN COMPLETED</span>
              <h2>{game.trust > 0 && game.cash > 0 ? '스타트업은 살아남았습니다.' : '스타트업이 멈춰 섰습니다.'}</h2>
              <div className="founder-final-score">{number(totalScore(game))}<small>FINAL SCORE</small></div>
              <p>총 {game.reports.length}개 기능 출시, {game.incidentsResolved}개 장애 해결. 같은 출발점에서도 어떤 기능을 먼저 선택하고 어떻게 대응했는지에 따라 결과가 달라집니다.</p>
              <div className="founder-history">
                {game.reports.map((report) => (
                  <div key={report.sprint}>
                    <strong>SPRINT {report.sprint} · {FEATURE_CATALOG[report.feature].name}</strong>
                    <span>{report.fixed ? '복구 성공' : '복구 포기'} · {report.downtimeMinutes}분 · {number(report.score)}점</span>
                  </div>
                ))}
              </div>
              <button type="button" className="founder-primary" onClick={() => setGame(createFounderRun())}>새로운 전략으로 재도전 ↻</button>
            </section>
          )}
        </div>

        <aside className="founder-sidebar">
          <section className="founder-aside-panel">
            <span className="founder-kicker">LIVE SYSTEM</span>
            <h3>서비스 토폴로지</h3>
            <div className="founder-topology">
              <div className="founder-node"><small>ENTRY</small><strong>USERS · {number(game.dau)} DAU</strong></div>
              <div className="founder-link">↓</div>
              {NODE_ORDER.map((node, index) => {
                const load = game.operational.nodes[node];
                const isIncidentNode = game.phase === 'incident' && incident?.node === node;
                return (
                  <div className="founder-node-block" key={node}>
                    {index > 0 && <div className="founder-link">↳</div>}
                    <div className={isIncidentNode ? 'founder-node alarm' : 'founder-node'}>
                      <small>{node === 'APP' ? 'API SERVER' : node === 'DB' ? 'DATABASE' : node === 'QUEUE' ? 'MESSAGES' : 'FILES'}</small>
                      <strong>{node} · {load.utilization}%</strong>
                      <div className="founder-load-track"><span style={{ width: load.utilization + '%' }} /></div>
                      <small>수요 {Math.round(load.demand)} / 용량 {load.capacity}</small>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="founder-muted founder-topology-caption">
              {game.phase === 'incident' ? '병목 후보를 강조했습니다. 조사하면 실제 근본 원인을 좁힐 수 있습니다.' : '출시 및 투자 이후 실시간 운영 부하 예측을 표시합니다.'}
            </p>
          </section>
          <section className="founder-aside-panel">
            <span className="founder-kicker">DECISION LOG</span>
            <h3>현재 선택의 결과</h3>
            <p className="founder-feedback" role="status">{game.feedback}</p>
            {game.phase === 'incident' && (
              <div className="founder-incident-stats">
                <span>장애 영향 시간 <strong>{game.downtimeMinutes}분</strong></span>
                <span>수집한 단서 <strong>{game.examined.length}/3</strong></span>
                <span>대응 시도 <strong>{game.usedRemedies.length}회</strong></span>
                <span>임시 완화 <strong>{game.mitigated ? '적용' : '없음'}</strong></span>
              </div>
            )}
          </section>
          <section className="founder-aside-panel">
            <span className="founder-kicker">TECH INVESTMENTS</span>
            <h3>구축한 운영 개선</h3>
            {game.investments.length === 0 ? <p className="founder-muted">아직 사전 투자하거나 장애를 근본 해결한 기록이 없습니다.</p> : (
              <ol className="founder-roadmap">{game.investments.map((id) => <li key={id}>{INVESTMENTS.find((item) => item.id === id)?.name ?? id}</li>)}</ol>
            )}
          </section>
          <section className="founder-aside-panel">
            <span className="founder-kicker">YOUR ROADMAP</span>
            <h3>출시한 기능</h3>
            {game.completed.length === 0 ? <p className="founder-muted">아직 출시한 기능이 없습니다.</p> : (
              <ol className="founder-roadmap">{game.completed.map((id) => <li key={id}>{FEATURE_CATALOG[id].name}</li>)}</ol>
            )}
          </section>
        </aside>
      </section>
      <footer className="founder-footer">FOUNDER RUN · 실험용 3-스프린트 시뮬레이션 · 수치는 게임 밸런싱을 위한 가상값입니다.</footer>
    </main>
  );
}

function Status({ label, value, detail, tone }: { readonly label: string; readonly value: string; readonly detail?: string; readonly tone?: 'good' | 'danger' }) {
  return <div className={'founder-stat ' + (tone ?? '')}><small>{label}</small><strong>{value}</strong>{detail && <span>{detail}</span>}</div>;
}
