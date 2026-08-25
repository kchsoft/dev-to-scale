import { DATABASES, FEATURES, HOSTING, TECHNOLOGIES, getDatabase, getFeature, getHosting, getTechnology } from "./data";
import { EventChoice, FeatureId, GameState, PendingEvent, SkillMap, TechId } from "./types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const formatWon = (value: number) => {
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 10_000).toLocaleString()}만`;
  return Math.round(value).toLocaleString();
};

export const formatNumber = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return Math.round(value).toLocaleString();
};

export const getMonthlyInfraCost = (state: GameState) => {
  const techCost = state.installedTechs.reduce((sum, techId) => sum + getTechnology(techId).monthlyCost, 0);
  return getHosting(state.hosting).monthlyCost + getDatabase(state.database).monthlyCost + techCost;
};

export const getComplexity = (state: GameState) => {
  const tech = state.installedTechs.reduce((sum, id) => sum + getTechnology(id).complexity, 0);
  const feature = state.completedFeatures.length * 1.8;
  return Math.round(getHosting(state.hosting).complexity + getDatabase(state.database).complexity + tech + feature);
};

export const getTeamPower = (state: GameState) => {
  const fundamental = Object.values(state.skills).reduce((sum, value) => sum + value, 0) / 7;
  const language = state.languageSkills[state.language] ?? 1;
  const framework = state.frameworkSkills[state.framework] ?? 1;
  return Math.round((fundamental * 0.55 + language * 0.2 + framework * 0.25) * 20);
};

export const getCapacity = (state: GameState) => {
  const hosting = getHosting(state.hosting);
  const database = getDatabase(state.database);
  const techMultiplier = state.installedTechs.reduce((value, id) => value * getTechnology(id).capacityMultiplier, 1);
  const trafficMultiplier = state.completedFeatures.reduce((value, id) => value * getFeature(id).trafficMultiplier, 1);
  const complexityGap = Math.max(0, getComplexity(state) - getTeamPower(state));
  const complexityPenalty = Math.max(0.55, 1 - complexityGap / 150);
  const base = Math.min(hosting.capacity, database.capacity * database.communityFit);
  return Math.round((base * techMultiplier * complexityPenalty) / Math.max(1, trafficMultiplier * 0.72));
};

export const getCapacityUsage = (state: GameState) => Math.round((state.dau / Math.max(1, getCapacity(state))) * 100);

const skillGap = (skills: SkillMap, required: Partial<SkillMap>) =>
  Object.entries(required).reduce((gap, [key, target]) => {
    const current = skills[key as keyof SkillMap] ?? 1;
    return gap + Math.max(0, (target ?? 1) - current);
  }, 0);

export const getProjectWeeks = (state: GameState, baseWeeks: number, required: Partial<SkillMap>, mode?: "fast" | "stable") => {
  const gap = skillGap(state.skills, required);
  const complexityGap = Math.max(0, getComplexity(state) - getTeamPower(state));
  const hasAi = state.installedTechs.includes("ai-assistant");
  const hasCicd = state.installedTechs.includes("cicd");
  const speedMultiplier = (hasAi ? 0.88 : 1) * (hasCicd ? 0.94 : 1);
  const modeMultiplier = mode === "fast" ? 0.72 : mode === "stable" ? 1.15 : 1;
  return Math.max(1, Math.ceil(baseWeeks * (1 + gap * 0.13 + complexityGap / 180) * speedMultiplier * modeMultiplier));
};

const growSkills = (state: GameState, required: Partial<SkillMap>, strength = 0.08) => {
  const next = { ...state.skills };
  for (const key of Object.keys(required) as Array<keyof SkillMap>) {
    next[key] = clamp(next[key] + strength, 1, 5);
  }
  return next;
};

const calculateMrr = (state: GameState) => {
  const revenuePerDau = state.completedFeatures.reduce((sum, id) => sum + getFeature(id).revenuePerDau, 0);
  return Math.round(state.dau * revenuePerDau);
};

const growthRate = (state: GameState, usage: number) => {
  let base = state.dau < 1_000 ? 0.11 : state.dau < 10_000 ? 0.075 : state.dau < 100_000 ? 0.048 : state.dau < 1_000_000 ? 0.027 : 0.013;
  const featureBonus = state.completedFeatures.reduce((sum, id) => sum + getFeature(id).growthBonus, 0);
  const trustBonus = (state.trust - 70) / 900;
  const reliabilityBonus = (state.reliability - 96) / 260;
  const overloadPenalty = usage > 100 ? Math.min(0.35, (usage - 100) / 170) : usage > 82 ? (usage - 82) / 500 : 0;
  const noise = (Math.random() - 0.5) * 0.028;
  return clamp(base + featureBonus + trustBonus + reliabilityBonus - overloadPenalty + noise, -0.45, 0.3);
};

const createIncident = (state: GameState, usage: number): PendingEvent | null => {
  const complexityGap = getComplexity(state) - getTeamPower(state);
  const roll = Math.random();

  if (usage >= 110 && roll < Math.min(0.7, 0.18 + (usage - 100) / 120)) {
    return {
      id: `overload-${state.week}`,
      tone: "danger",
      title: "🔥 서비스 과부하",
      description: `사용자 증가가 현재 처리 용량을 넘어섰습니다. Capacity 사용률이 ${usage}%까지 올라갔습니다.`,
      choices: [
        { id: "scale", label: "긴급 증설", description: "500만원을 투입해 장애 영향을 줄입니다.", cashDelta: -5_000_000, reliabilityDelta: 3, trustDelta: 1 },
        { id: "freeze", label: "기능 동결 & 정리", description: "성장을 잠시 희생하고 기술부채를 줄입니다.", techDebtDelta: -9, trustDelta: -1, dauMultiplier: 0.97 },
        { id: "endure", label: "일단 버틴다", description: "돈은 아끼지만 사용자와 신뢰를 잃을 수 있습니다.", trustDelta: -8, reliabilityDelta: -8, dauMultiplier: 0.86 },
      ],
    };
  }

  if (complexityGap > 12 && roll < 0.2) {
    return {
      id: `complexity-${state.week}`,
      tone: "warning",
      title: "🧩 운영 복잡도 경고",
      description: "현재 팀이 다루는 기술 스택이 팀 역량보다 복잡해졌습니다. 사소한 변경에도 문제가 반복됩니다.",
      choices: [
        { id: "refactor", label: "리팩터링 주간", description: "기술부채와 피로도를 줄이는 데 집중합니다.", techDebtDelta: -10, fatigueDelta: -6, cashDelta: -600000 },
        { id: "train", label: "팀 학습 투자", description: "비용을 들여 운영 충격을 완화합니다.", cashDelta: -1200000, reliabilityDelta: 2 },
        { id: "ignore", label: "일정 우선", description: "당장은 넘어가지만 부채가 더 쌓입니다.", techDebtDelta: 6, fatigueDelta: 5 },
      ],
    };
  }

  if (state.dau > 1_500 && roll > 0.965) {
    return {
      id: `viral-${state.week}`,
      tone: "good",
      title: "🚀 커뮤니티에서 입소문이 났습니다",
      description: "유명 개발자가 서비스를 소개했습니다. 새로운 사용자가 한꺼번에 유입될 조짐입니다.",
      choices: [
        { id: "welcome", label: "성장에 올인", description: "바이럴을 적극적으로 받아들입니다.", dauMultiplier: 1.55, fatigueDelta: 5 },
        { id: "safe", label: "안정적으로 받기", description: "프로모션을 제한하고 완만하게 성장시킵니다.", dauMultiplier: 1.28, reliabilityDelta: 1 },
      ],
    };
  }

  return null;
};

export const startFeatureProject = (state: GameState, featureId: FeatureId, mode: "fast" | "stable"): GameState => {
  if (state.activeProject || state.completedFeatures.includes(featureId)) return state;
  const feature = getFeature(featureId);
  if (state.cash < feature.cost) return state;
  const weeks = getProjectWeeks(state, feature.weeks, feature.requiredSkills, mode);
  return {
    ...state,
    cash: state.cash - feature.cost,
    activeProject: { kind: "feature", id: featureId, name: feature.name, totalWeeks: weeks, remainingWeeks: weeks, mode },
    logs: [{ week: state.week, tone: "neutral" as const, text: `${feature.name} 개발을 시작했습니다. (${weeks}주 예상)` }, ...state.logs].slice(0, 18),
  };
};

export const startTechnologyProject = (state: GameState, techId: TechId): GameState => {
  if (state.activeProject || state.installedTechs.includes(techId)) return state;
  const tech = getTechnology(techId);
  if (state.cash < tech.setupCost || state.dau < tech.unlockDau) return state;
  const weeks = getProjectWeeks(state, tech.weeks, tech.requiredSkills);
  return {
    ...state,
    cash: state.cash - tech.setupCost,
    activeProject: { kind: "technology", id: techId, name: tech.name, totalWeeks: weeks, remainingWeeks: weeks },
    logs: [{ week: state.week, tone: "neutral" as const, text: `${tech.name} 도입을 시작했습니다. (${weeks}주 예상)` }, ...state.logs].slice(0, 18),
  };
};

export const applyEventChoice = (state: GameState, choice: EventChoice): GameState => ({
  ...state,
  cash: state.cash + (choice.cashDelta ?? 0),
  trust: clamp(state.trust + (choice.trustDelta ?? 0), 0, 100),
  reliability: clamp(state.reliability + (choice.reliabilityDelta ?? 0), 0, 100),
  dau: Math.max(0, Math.round(state.dau * (choice.dauMultiplier ?? 1))),
  techDebt: clamp(state.techDebt + (choice.techDebtDelta ?? 0), 0, 100),
  fatigue: clamp(state.fatigue + (choice.fatigueDelta ?? 0), 0, 100),
  pendingEvent: null,
  logs: [{ week: state.week, tone: "warning" as const, text: `${choice.label}: ${choice.description}` }, ...state.logs].slice(0, 18),
});

export const simulateWeek = (state: GameState): GameState => {
  if (state.pendingEvent || state.gameOver) return state;

  let next: GameState = { ...state, week: state.week + 1 };
  let project = next.activeProject;
  let completionLog: GameState["logs"][number] | null = null;

  if (project) {
    project = { ...project, remainingWeeks: project.remainingWeeks - 1 };
    if (project.remainingWeeks <= 0) {
      if (project.kind === "feature") {
        const id = project.id as FeatureId;
        const feature = getFeature(id);
        const debtDelta = project.mode === "fast" ? feature.debt + 5 : Math.max(0, feature.debt - 2);
        next = {
          ...next,
          completedFeatures: [...next.completedFeatures, id],
          techDebt: clamp(next.techDebt + debtDelta, 0, 100),
          skills: growSkills(next, feature.requiredSkills, 0.1),
          languageSkills: { ...next.languageSkills, [next.language]: clamp((next.languageSkills[next.language] ?? 1) + 0.05, 1, 5) },
          frameworkSkills: { ...next.frameworkSkills, [next.framework]: clamp((next.frameworkSkills[next.framework] ?? 1) + 0.08, 1, 5) },
        };
        completionLog = { week: next.week, tone: "good", text: `${feature.name} 기능이 출시되었습니다.` };
      } else {
        const id = project.id as TechId;
        const tech = getTechnology(id);
        next = {
          ...next,
          installedTechs: [...next.installedTechs, id],
          skills: growSkills(next, tech.requiredSkills, 0.12),
          languageSkills: { ...next.languageSkills, [next.language]: clamp((next.languageSkills[next.language] ?? 1) + 0.03, 1, 5) },
          frameworkSkills: { ...next.frameworkSkills, [next.framework]: clamp((next.frameworkSkills[next.framework] ?? 1) + 0.04, 1, 5) },
        };
        completionLog = { week: next.week, tone: "good", text: `${tech.name} 도입이 완료되었습니다.` };
      }
      project = null;
    }
  }
  next.activeProject = project;

  const usageBeforeGrowth = getCapacityUsage(next);
  const growth = growthRate(next, usageBeforeGrowth);
  next.dau = Math.max(10, Math.round(next.dau * (1 + growth)));
  next.highestDau = Math.max(next.highestDau, next.dau);

  const mrr = calculateMrr(next);
  const infra = getMonthlyInfraCost(next);
  const weeklyNet = mrr / 4.33 - infra / 4.33;
  next.mrr = mrr;
  next.cash = Math.round(next.cash + weeklyNet);

  const usage = getCapacityUsage(next);
  if (usage > 100) {
    next.reliability = clamp(next.reliability - Math.min(6, (usage - 100) / 12), 0, 100);
    next.trust = clamp(next.trust - Math.min(3, (usage - 100) / 30), 0, 100);
    next.fatigue = clamp(next.fatigue + 2.5, 0, 100);
  } else {
    const reliabilityBonus = next.installedTechs.reduce((sum, id) => sum + (getTechnology(id).reliabilityBonus ?? 0), 0);
    next.reliability = clamp(next.reliability + 0.35 + reliabilityBonus * 0.04 - next.techDebt / 500, 0, 99.99);
    next.trust = clamp(next.trust + (next.reliability > 98 ? 0.18 : 0.02), 0, 100);
    next.fatigue = clamp(next.fatigue - 0.45, 0, 100);
  }

  if (next.activeProject) next.fatigue = clamp(next.fatigue + 0.35, 0, 100);
  if (next.techDebt > 65 && Math.random() < 0.08) next.reliability = clamp(next.reliability - 2, 0, 100);

  const event = createIncident(next, usage);
  next.pendingEvent = event;

  const weeklyLog = {
    week: next.week,
    tone: usage > 100 ? ("danger" as const) : growth >= 0 ? ("neutral" as const) : ("warning" as const),
    text: `DAU ${growth >= 0 ? "+" : ""}${(growth * 100).toFixed(1)}% · Capacity ${usage}% · 주간 손익 ${weeklyNet >= 0 ? "+" : ""}${Math.round(weeklyNet).toLocaleString()}원`,
  };
  next.logs = [weeklyLog, ...(completionLog ? [completionLog] : []), ...next.logs].slice(0, 18);

  if (next.cash < -3_000_000 || next.trust <= 3 || next.dau < 10) {
    next.gameOver = true;
  }

  return next;
};

export const catalogStats = { hosting: HOSTING.length, databases: DATABASES.length, tech: TECHNOLOGIES.length, features: FEATURES.length };
