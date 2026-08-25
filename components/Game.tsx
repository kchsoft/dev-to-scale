"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  DATABASES,
  FEATURES,
  FOUNDER_PRESETS,
  FRAMEWORKS,
  HOSTING,
  LANGUAGES,
  SKILL_LABELS,
  TECHNOLOGIES,
  getDatabase,
  getFeature,
  getFrameworkName,
  getHosting,
  getLanguageName,
  getTechnology,
} from "@/game/data";
import {
  applyEventChoice,
  formatNumber,
  formatWon,
  getCapacity,
  getCapacityUsage,
  getComplexity,
  getMonthlyInfraCost,
  getProjectWeeks,
  getTeamPower,
  simulateWeek,
  startFeatureProject,
  startTechnologyProject,
} from "@/game/engine";
import {
  DatabaseId,
  FrameworkId,
  GameState,
  HostingId,
  LanguageId,
  SkillMap,
} from "@/game/types";

const STORAGE_KEY = "dev-to-scale-save-v1";

type SetupState = {
  founderPreset: number;
  language: LanguageId;
  framework: FrameworkId;
  database: DatabaseId;
  hosting: HostingId;
};

const initialSetup: SetupState = {
  founderPreset: 0,
  language: "java",
  framework: "spring",
  database: "postgresql",
  hosting: "vm",
};

const createInitialGame = (setup: SetupState): GameState => {
  const preset = FOUNDER_PRESETS[setup.founderPreset];
  return {
    started: true,
    gameOver: false,
    week: 1,
    cash: 50_000_000,
    dau: 120,
    mrr: 0,
    trust: 82,
    reliability: 99.4,
    techDebt: 7,
    fatigue: 6,
    skills: { ...preset.skills },
    language: setup.language,
    framework: setup.framework,
    languageSkills: { [setup.language]: 3 },
    frameworkSkills: { [setup.framework]: 2.5 },
    hosting: setup.hosting,
    database: setup.database,
    installedTechs: [],
    completedFeatures: [],
    activeProject: null,
    pendingEvent: null,
    highestDau: 120,
    logs: [
      {
        week: 1,
        tone: "good",
        text: `${getLanguageName(setup.language)} + ${getFrameworkName(setup.framework)}로 커뮤니티 서비스를 출시했습니다.`,
      },
    ],
  };
};

const starText = (value: number) => {
  const filled = Math.max(0, Math.min(5, Math.floor(value + 0.001)));
  return `${"★".repeat(filled)}${"☆".repeat(5 - filled)}`;
};

const weekLabel = (week: number) => {
  const year = Math.floor((week - 1) / 52) + 1;
  const weekOfYear = ((week - 1) % 52) + 1;
  return `Year ${year} · Week ${weekOfYear}`;
};

export default function Game() {
  const [setup, setSetup] = useState<SetupState>(initialSetup);
  const [state, setState] = useState<GameState | null>(null);
  const [tab, setTab] = useState<"roadmap" | "infra" | "skills" | "finance">("roadmap");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setState(JSON.parse(saved) as GameState);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && state) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const selectedFrameworks = FRAMEWORKS[setup.language];

  const onLanguageChange = (language: LanguageId) => {
    const firstFramework = FRAMEWORKS[language][0].id;
    setSetup((current) => ({ ...current, language, framework: firstFramework }));
  };

  const reset = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setState(null);
    setSetup(initialSetup);
    setTab("roadmap");
  };

  if (!hydrated) return <main className="loading-screen">Loading Dev to Scale…</main>;

  if (!state) {
    return (
      <main className="setup-shell">
        <div className="setup-hero">
          <span className="eyebrow">DEVELOPMENT SERVICE SURVIVAL SIM</span>
          <h1>DEV TO SCALE</h1>
          <p>Build it. Ship it. Keep it alive. Scale it.</p>
        </div>

        <section className="setup-card">
          <div className="step-heading">
            <span>01</span>
            <div>
              <h2>서비스를 선택하세요</h2>
              <p>MVP에서는 커뮤니티를 실제 플레이할 수 있습니다.</p>
            </div>
          </div>
          <div className="choice-grid three">
            <button className="choice active">
              <strong>Community</strong>
              <small>읽기 트래픽 · 이미지 · 캐시 · 성장</small>
              <span className="difficulty">난이도 ★★☆☆☆</span>
            </button>
            <button className="choice disabled" disabled>
              <strong>Commerce</strong>
              <small>주문 · 재고 · 검색 · 결제</small>
              <span>Coming soon</span>
            </button>
            <button className="choice disabled" disabled>
              <strong>Messenger</strong>
              <small>실시간 · 동시 접속 · 메시지</small>
              <span>Coming soon</span>
            </button>
          </div>
        </section>

        <section className="setup-card">
          <div className="step-heading">
            <span>02</span>
            <div>
              <h2>Founder 배경</h2>
              <p>기본 역량은 실제 백엔드 현업에서 자주 나뉘는 큰 축으로 구성했습니다.</p>
            </div>
          </div>
          <div className="choice-grid three">
            {FOUNDER_PRESETS.map((preset, index) => (
              <button
                key={preset.id}
                className={`choice ${setup.founderPreset === index ? "active" : ""}`}
                onClick={() => setSetup((current) => ({ ...current, founderPreset: index }))}
              >
                <strong>{preset.name}</strong>
                <small>{preset.subtitle}</small>
                <div className="mini-skill-list">
                  <span>DB {starText(preset.skills.database)}</span>
                  <span>Network {starText(preset.skills.network)}</span>
                  <span>Infra {starText(preset.skills.infra)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="setup-card">
          <div className="step-heading">
            <span>03</span>
            <div>
              <h2>백엔드 스택</h2>
              <p>언어를 고르면 해당 언어의 프레임워크가 열립니다.</p>
            </div>
          </div>
          <h3 className="subheading">Language</h3>
          <div className="language-grid">
            {LANGUAGES.map((language) => (
              <button
                key={language.id}
                className={`language-choice ${setup.language === language.id ? "active" : ""}`}
                onClick={() => onLanguageChange(language.id)}
              >
                <strong>{language.name}</strong>
                <small>{language.description}</small>
              </button>
            ))}
          </div>
          <h3 className="subheading">Framework</h3>
          <div className="choice-grid two">
            {selectedFrameworks.map((framework) => (
              <button
                key={framework.id}
                className={`choice compact ${setup.framework === framework.id ? "active" : ""}`}
                onClick={() => setSetup((current) => ({ ...current, framework: framework.id }))}
              >
                <strong>{framework.name}</strong>
                <small>{framework.description}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="setup-card split-setup">
          <div>
            <div className="step-heading">
              <span>04</span>
              <div><h2>Database</h2><p>커뮤니티의 첫 데이터 저장소입니다.</p></div>
            </div>
            <div className="stacked-choices">
              {DATABASES.map((db) => (
                <button key={db.id} className={`row-choice ${setup.database === db.id ? "active" : ""}`} onClick={() => setSetup((current) => ({ ...current, database: db.id }))}>
                  <div><strong>{db.name}</strong><small>{db.description}</small></div>
                  <span>월 {formatWon(db.monthlyCost)}원</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="step-heading">
              <span>05</span>
              <div><h2>Hosting</h2><p>돈과 운영 부담의 첫 번째 선택입니다.</p></div>
            </div>
            <div className="stacked-choices">
              {HOSTING.map((host) => (
                <button key={host.id} className={`row-choice ${setup.hosting === host.id ? "active" : ""}`} onClick={() => setSetup((current) => ({ ...current, hosting: host.id }))}>
                  <div><strong>{host.name}</strong><small>{host.description}</small></div>
                  <span>월 {formatWon(host.monthlyCost)}원</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="launch-card">
          <div>
            <span>STARTING CASH</span>
            <strong>₩ 5,000만</strong>
          </div>
          <div>
            <span>STACK</span>
            <strong>{getLanguageName(setup.language)} · {getFrameworkName(setup.framework)} · {getDatabase(setup.database).name}</strong>
          </div>
          <button className="primary-button" onClick={() => setState(createInitialGame(setup))}>서비스 출시하기 →</button>
        </section>
      </main>
    );
  }

  return <Dashboard state={state} setState={setState} tab={tab} setTab={setTab} reset={reset} />;
}

function Dashboard({
  state,
  setState,
  tab,
  setTab,
  reset,
}: {
  state: GameState;
  setState: Dispatch<SetStateAction<GameState | null>>;
  tab: "roadmap" | "infra" | "skills" | "finance";
  setTab: Dispatch<SetStateAction<"roadmap" | "infra" | "skills" | "finance">>;
  reset: () => void;
}) {
  const capacity = getCapacity(state);
  const usage = getCapacityUsage(state);
  const complexity = getComplexity(state);
  const teamPower = getTeamPower(state);
  const monthlyCost = getMonthlyInfraCost(state);
  const runway = state.mrr >= monthlyCost ? null : Math.max(0, state.cash / Math.max(1, monthlyCost - state.mrr));
  const progress = state.activeProject ? Math.round(((state.activeProject.totalWeeks - state.activeProject.remainingWeeks) / state.activeProject.totalWeeks) * 100) : 0;

  const architectureNodes = useMemo(() => {
    const nodes = [getHosting(state.hosting).name, getFrameworkName(state.framework), getDatabase(state.database).name];
    if (state.installedTechs.includes("redis")) nodes.splice(2, 0, "Redis Cache");
    return nodes;
  }, [state]);

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">D/S</span><div><strong>DEV TO SCALE</strong><small>Community · {weekLabel(state.week)}</small></div></div>
        <div className="headline-metrics">
          <Metric label="Cash" value={`₩ ${formatWon(state.cash)}`} tone={state.cash < 10_000_000 ? "danger" : ""} />
          <Metric label="DAU" value={formatNumber(state.dau)} tone={usage > 100 ? "danger" : ""} />
          <Metric label="MRR" value={`₩ ${formatWon(state.mrr)}`} />
          <Metric label="Trust" value={`${state.trust.toFixed(0)}`} />
        </div>
        <button className="ghost-button" onClick={reset}>새 게임</button>
      </header>

      <section className="dashboard-grid">
        <aside className="left-rail panel">
          <div className="panel-heading"><span>COMPANY</span><strong>Community Inc.</strong></div>
          <StatusBar label="Capacity" value={Math.min(140, usage)} display={`${usage}%`} dangerAt={100} warningAt={75} />
          <StatusBar label="Reliability" value={state.reliability} display={`${state.reliability.toFixed(1)}%`} reverse />
          <StatusBar label="Tech Debt" value={state.techDebt} display={`${state.techDebt.toFixed(0)}`} dangerAt={70} warningAt={45} />
          <StatusBar label="Fatigue" value={state.fatigue} display={`${state.fatigue.toFixed(0)}`} dangerAt={75} warningAt={50} />

          <div className="rail-stats">
            <div><span>Capacity</span><strong>{formatNumber(capacity)} DAU</strong></div>
            <div><span>Complexity</span><strong>{complexity}</strong></div>
            <div><span>Team Power</span><strong>{teamPower}</strong></div>
            <div><span>Monthly Infra</span><strong>₩ {formatWon(monthlyCost)}</strong></div>
          </div>

          <div className="stack-summary">
            <span>CORE STACK</span>
            <strong>{getLanguageName(state.language)} / {getFrameworkName(state.framework)}</strong>
            <small>{getHosting(state.hosting).name} · {getDatabase(state.database).name}</small>
          </div>
        </aside>

        <section className="center-column">
          <div className="panel architecture-panel">
            <div className="panel-heading row"><div><span>LIVE ARCHITECTURE</span><strong>Your service</strong></div><span className={`health-pill ${usage > 100 ? "danger" : usage > 75 ? "warning" : "good"}`}>{usage > 100 ? "OVERLOADED" : usage > 75 ? "WATCH" : "HEALTHY"}</span></div>
            <div className="architecture">
              <div className="client-node">Users<br/><b>{formatNumber(state.dau)} DAU</b></div>
              <span className="arrow">→</span>
              {architectureNodes.map((node, index) => (
                <div className="arch-fragment" key={`${node}-${index}`}>
                  <div className="arch-node">{node}</div>
                  {index < architectureNodes.length - 1 && <span className="arrow">→</span>}
                </div>
              ))}
            </div>
            {state.installedTechs.length > 0 && (
              <div className="support-techs">
                {state.installedTechs.filter((id) => id !== "redis").map((id) => <span key={id}>{getTechnology(id).name}</span>)}
              </div>
            )}
          </div>

          {state.activeProject ? (
            <div className="panel project-panel">
              <div className="panel-heading row"><div><span>IN DEVELOPMENT</span><strong>{state.activeProject.name}</strong></div><b>{state.activeProject.remainingWeeks}주 남음</b></div>
              <div className="project-track"><div style={{ width: `${progress}%` }} /></div>
              <small>한 번에 하나의 핵심 작업만 진행할 수 있습니다. 다음 주를 진행하면 개발이 계속됩니다.</small>
            </div>
          ) : (
            <div className="panel empty-project"><span>현재 개발 작업이 없습니다.</span><strong>Roadmap 또는 Infrastructure에서 다음 투자를 선택하세요.</strong></div>
          )}

          <div className="panel workspace-panel">
            <div className="tabs">
              <button className={tab === "roadmap" ? "active" : ""} onClick={() => setTab("roadmap")}>Roadmap</button>
              <button className={tab === "infra" ? "active" : ""} onClick={() => setTab("infra")}>Infrastructure</button>
              <button className={tab === "skills" ? "active" : ""} onClick={() => setTab("skills")}>Skills</button>
              <button className={tab === "finance" ? "active" : ""} onClick={() => setTab("finance")}>Finance</button>
            </div>
            {tab === "roadmap" && <Roadmap state={state} setState={setState} />}
            {tab === "infra" && <Infrastructure state={state} setState={setState} />}
            {tab === "skills" && <Skills state={state} />}
            {tab === "finance" && <Finance state={state} monthlyCost={monthlyCost} runway={runway} />}
          </div>
        </section>

        <aside className="right-rail">
          <div className="panel turn-panel">
            <span className="eyebrow">SIMULATION</span>
            <strong>{weekLabel(state.week)}</strong>
            <p>{state.pendingEvent ? "먼저 현재 이벤트에 대응해야 합니다." : "한 주를 진행하면 사용자, 비용, 개발과 장애가 계산됩니다."}</p>
            <button className="next-week" disabled={Boolean(state.pendingEvent) || state.gameOver} onClick={() => setState((current) => current ? simulateWeek(current) : current)}>다음 주 진행 <span>▶</span></button>
          </div>

          <div className="panel log-panel">
            <div className="panel-heading"><span>ACTIVITY LOG</span><strong>최근 변화</strong></div>
            <div className="logs">
              {state.logs.map((log, index) => (
                <div key={`${log.week}-${index}`} className={`log ${log.tone}`}><span>W{log.week}</span><p>{log.text}</p></div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {state.pendingEvent && (
        <div className="modal-backdrop">
          <div className={`event-modal ${state.pendingEvent.tone}`}>
            <span className="eyebrow">LIVE EVENT</span>
            <h2>{state.pendingEvent.title}</h2>
            <p>{state.pendingEvent.description}</p>
            <div className="event-choices">
              {state.pendingEvent.choices.map((choice) => (
                <button key={choice.id} onClick={() => setState((current) => current ? applyEventChoice(current, choice) : current)}><strong>{choice.label}</strong><small>{choice.description}</small></button>
              ))}
            </div>
          </div>
        </div>
      )}

      {state.gameOver && (
        <div className="modal-backdrop">
          <div className="event-modal danger game-over">
            <span className="eyebrow">GAME OVER</span>
            <h2>회사가 더 이상 서비스를 운영할 수 없습니다.</h2>
            <div className="game-over-stats"><div><span>생존</span><strong>{weekLabel(state.week)}</strong></div><div><span>최고 DAU</span><strong>{formatNumber(state.highestDau)}</strong></div><div><span>최종 Cash</span><strong>₩ {formatWon(state.cash)}</strong></div></div>
            <button className="primary-button" onClick={reset}>다시 시작하기</button>
          </div>
        </div>
      )}
    </main>
  );
}

function Roadmap({ state, setState }: { state: GameState; setState: Dispatch<SetStateAction<GameState | null>> }) {
  return (
    <div className="card-grid">
      {FEATURES.map((feature) => {
        const done = state.completedFeatures.includes(feature.id);
        const locked = state.dau < feature.unlockDau;
        const fastWeeks = getProjectWeeks(state, feature.weeks, feature.requiredSkills, "fast");
        const stableWeeks = getProjectWeeks(state, feature.weeks, feature.requiredSkills, "stable");
        return (
          <article className={`game-card ${done ? "done" : locked ? "locked" : ""}`} key={feature.id}>
            <div className="card-kicker"><span>FEATURE</span><b>{done ? "LIVE" : locked ? `${formatNumber(feature.unlockDau)} DAU` : "AVAILABLE"}</b></div>
            <h3>{feature.name}</h3>
            <p>{feature.description}</p>
            <div className="effect-list"><span>성장 {feature.growthBonus >= 0 ? "+" : ""}{(feature.growthBonus * 100).toFixed(1)}%p</span><span>Traffic ×{feature.trafficMultiplier.toFixed(2)}</span>{feature.revenuePerDau > 0 && <span>₩{feature.revenuePerDau}/DAU</span>}</div>
            <div className="card-footer">
              <small>개발비 ₩{formatWon(feature.cost)} · 기본 {feature.weeks}주</small>
              {!done && !locked && (
                <div className="dual-actions">
                  <button disabled={Boolean(state.activeProject) || state.cash < feature.cost} onClick={() => setState((current) => current ? startFeatureProject(current, feature.id, "fast") : current)}>빠르게 · {fastWeeks}주</button>
                  <button disabled={Boolean(state.activeProject) || state.cash < feature.cost} onClick={() => setState((current) => current ? startFeatureProject(current, feature.id, "stable") : current)}>안정적으로 · {stableWeeks}주</button>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Infrastructure({ state, setState }: { state: GameState; setState: Dispatch<SetStateAction<GameState | null>> }) {
  return (
    <div className="card-grid">
      {TECHNOLOGIES.map((tech) => {
        const installed = state.installedTechs.includes(tech.id);
        const locked = state.dau < tech.unlockDau;
        const weeks = getProjectWeeks(state, tech.weeks, tech.requiredSkills);
        const skillEntries = Object.entries(tech.requiredSkills);
        return (
          <article className={`game-card ${installed ? "done" : locked ? "locked" : ""}`} key={tech.id}>
            <div className="card-kicker"><span>{tech.category}</span><b>{installed ? "INSTALLED" : locked ? `${formatNumber(tech.unlockDau)} DAU` : "AVAILABLE"}</b></div>
            <h3>{tech.name}</h3>
            <p>{tech.description}</p>
            <div className="effect-list"><span>Capacity ×{tech.capacityMultiplier.toFixed(2)}</span><span>Complexity +{tech.complexity}</span>{tech.monthlyCost > 0 && <span>월 ₩{formatWon(tech.monthlyCost)}</span>}</div>
            {skillEntries.length > 0 && <div className="requirements">권장 {skillEntries.map(([key, value]) => `${SKILL_LABELS[key as keyof SkillMap]} ${"★".repeat(value ?? 0)}`).join(" · ")}</div>}
            <div className="card-footer"><small>도입비 ₩{formatWon(tech.setupCost)} · 예상 {weeks}주</small>{!installed && !locked && <button className="card-action" disabled={Boolean(state.activeProject) || state.cash < tech.setupCost} onClick={() => setState((current) => current ? startTechnologyProject(current, tech.id) : current)}>도입하기</button>}</div>
          </article>
        );
      })}
    </div>
  );
}

function Skills({ state }: { state: GameState }) {
  return (
    <div className="skills-layout">
      <section className="skill-section"><span className="eyebrow">FUNDAMENTALS</span><h3>기본 역량</h3><div className="skill-rows">{Object.entries(state.skills).map(([id, value]) => <SkillRow key={id} name={SKILL_LABELS[id as keyof SkillMap]} value={value} />)}</div></section>
      <section className="skill-section"><span className="eyebrow">LANGUAGE / FRAMEWORK</span><h3>현재 주력 스택</h3><SkillRow name={getLanguageName(state.language)} value={state.languageSkills[state.language] ?? 1} /><SkillRow name={getFrameworkName(state.framework)} value={state.frameworkSkills[state.framework] ?? 1} /><p className="skill-note">프로젝트를 완료하면 관련 기본 역량과 현재 언어/프레임워크 숙련도가 조금씩 성장합니다.</p></section>
    </div>
  );
}

function Finance({ state, monthlyCost, runway }: { state: GameState; monthlyCost: number; runway: number | null }) {
  const monthlyProfit = state.mrr - monthlyCost;
  return (
    <div className="finance-grid">
      <div className="finance-card"><span>MRR</span><strong>₩ {formatWon(state.mrr)}</strong><small>현재 완료된 수익화 기능 기준</small></div>
      <div className="finance-card"><span>Monthly Infra</span><strong>₩ {formatWon(monthlyCost)}</strong><small>Hosting + DB + 도입 기술</small></div>
      <div className={`finance-card ${monthlyProfit < 0 ? "negative" : "positive"}`}><span>Monthly Profit</span><strong>{monthlyProfit >= 0 ? "+" : "-"} ₩ {formatWon(Math.abs(monthlyProfit))}</strong><small>인건비는 MVP에서 제외</small></div>
      <div className="finance-card"><span>Runway</span><strong>{runway === null ? "Profitable" : `${runway.toFixed(1)}개월`}</strong><small>현재 손익이 유지된다고 가정</small></div>
    </div>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) { return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>; }

function StatusBar({ label, value, display, dangerAt = 101, warningAt = 101, reverse = false }: { label: string; value: number; display: string; dangerAt?: number; warningAt?: number; reverse?: boolean }) {
  const danger = reverse ? value < 92 : value >= dangerAt;
  const warning = reverse ? value < 97 : value >= warningAt;
  return <div className="status-row"><div><span>{label}</span><strong>{display}</strong></div><div className={`status-track ${danger ? "danger" : warning ? "warning" : "good"}`}><span style={{ width: `${Math.min(100, Math.max(2, value))}%` }} /></div></div>;
}

function SkillRow({ name, value }: { name: string; value: number }) {
  const percent = ((value - 1) / 4) * 100;
  return <div className="skill-row"><div><strong>{name}</strong><span>{starText(value)}</span></div><div className="skill-track"><span style={{ width: `${Math.max(3, percent)}%` }} /></div><small>{value.toFixed(2)} / 5</small></div>;
}
