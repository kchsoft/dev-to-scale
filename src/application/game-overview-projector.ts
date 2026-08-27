import { GameEngine, GameSnapshot } from '../core';
import { FeatureOperationsView, HudView, TechnologyIdView, WorkSlotView } from './game-view';
import { presentationCatalog } from './presentation-catalog';

function calendarForDay(day: number): { month: number; dayOfMonth: number; daysUntilSettlement: number } {
  const month = Math.floor((day - 1) / 30) + 1;
  const dayOfMonth = ((day - 1) % 30) + 1;
  return { month, dayOfMonth, daysUntilSettlement: 31 - dayOfMonth };
}

export interface GameFinancialProjection {
  readonly monthlyRevenue: number;
  readonly monthlyCost: number;
  readonly monthlyProfit: number;
}

export interface GameOverviewProjection {
  readonly hud: HudView;
  readonly workSlots: readonly WorkSlotView[];
  readonly operations: FeatureOperationsView;
}

export class GameOverviewProjector {
  readonly #engine: GameEngine;

  constructor(engine: GameEngine) {
    this.#engine = engine;
  }

  project(snapshot: GameSnapshot, financials: GameFinancialProjection): GameOverviewProjection {
    const calendar = calendarForDay(snapshot.day);
    return {
      hud: this.hud(snapshot, calendar, financials),
      workSlots: this.workSlots(snapshot),
      operations: this.operations(snapshot),
    };
  }

  private hud(
    snapshot: GameSnapshot,
    calendar: { month: number; dayOfMonth: number; daysUntilSettlement: number },
    financials: GameFinancialProjection,
  ): HudView {
    return {
      day: snapshot.day,
      month: calendar.month,
      dayOfMonth: calendar.dayOfMonth,
      daysUntilSettlement: calendar.daysUntilSettlement,
      dau: snapshot.dau,
      cash: snapshot.cash,
      monthlyRevenue: financials.monthlyRevenue,
      monthlyCost: financials.monthlyCost,
      monthlyProfit: financials.monthlyProfit,
      lastSettlement: snapshot.lastSettlement,
      status: snapshot.status,
      launched: snapshot.launched,
    };
  }

  private workSlots(snapshot: GameSnapshot): WorkSlotView[] {
    const feature = snapshot.currentFeature;
    const tech = snapshot.currentTechnologyBuild;
    const learning = this.#engine.learning.current;
    const responding = snapshot.incidents.find((incident) => incident.remainingResponseDays !== null);
    const featureTotal = feature ? feature.elapsedDays + feature.estimatedRemainingDays : 0;
    const techTotal = tech ? tech.elapsedDays + tech.estimatedRemainingDays : 0;
    const responseTotal = responding?.totalResponseDays ?? 0;
    const responseElapsed = responding?.elapsedResponseDays ?? 0;
    const refactorProgress = snapshot.techDebt.refactoring
      ? 1 - snapshot.techDebt.remainingRefactorDays / 5
      : null;
    return [
      snapshot.techDebt.refactoring
        ? {
            id: 'feature',
            label: 'FEATURE',
            title: 'REFACTORING',
            progress: refactorProgress,
            meta: `${snapshot.techDebt.remainingRefactorDays}일 남음 · 완료 시 Tech Debt -30`,
            active: true,
          }
        : {
            id: 'feature',
            label: 'FEATURE',
            title: feature ? presentationCatalog.label(feature.id) : '비어 있음',
            progress: feature ? feature.progress / feature.requiredWork : null,
            meta: feature ? `${feature.elapsedDays}/~${featureTotal}일 · 약 ${feature.estimatedRemainingDays}일 남음` : '다음 요구사항 대기',
            active: Boolean(feature),
          },
      {
        id: 'technology',
        label: 'TECHNOLOGY',
        title: tech ? presentationCatalog.label(tech.id) : '비어 있음',
        progress: tech ? tech.progress / tech.requiredWork : null,
        meta: tech ? `${tech.elapsedDays}/~${techTotal}일 · 약 ${tech.estimatedRemainingDays}일 남음` : '기술을 선택하세요',
        active: Boolean(tech),
      },
      {
        id: 'learning',
        label: 'LEARNING',
        title: learning ? `${presentationCatalog.label(learning.skill.id)} → Lv.${learning.targetLevel}` : '비어 있음',
        progress: learning ? learning.progress : null,
        meta: learning ? `${learning.elapsedStudyDays}/${learning.requiredStudyDays}일 · ${Math.max(0, learning.requiredStudyDays - learning.elapsedStudyDays)}일 남음` : '학습을 선택하세요',
        active: Boolean(learning),
      },
      {
        id: 'incident',
        label: 'INCIDENT',
        title: responding ? this.nodeLabel(responding.nodeId) : '비어 있음',
        progress: responding && responseTotal > 0 ? responseElapsed / responseTotal : null,
        meta: responding
          ? `${responseElapsed}/${responseTotal}일 · ${responding.remainingResponseDays ?? 0}일 남음`
          : `${snapshot.incidents.length}건 미해결`,
        active: Boolean(responding),
      },
    ];
  }

  private operations(snapshot: GameSnapshot): FeatureOperationsView {
    return {
      currentFeature: snapshot.currentFeature,
      currentTechnologyBuild: snapshot.currentTechnologyBuild
        ? { ...snapshot.currentTechnologyBuild, id: snapshot.currentTechnologyBuild.id as TechnologyIdView }
        : null,
      techDebt: snapshot.techDebt,
      trafficSpike: snapshot.growthEvent?.type === 'VIRAL'
        ? { burstCost: snapshot.growthEvent.burstCost }
        : null,
    };
  }

  private nodeLabel(nodeId: string): string {
    const id = nodeId.split(':').pop() ?? nodeId;
    return presentationCatalog.label(id);
  }
}
