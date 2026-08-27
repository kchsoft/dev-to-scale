import { COMMUNITY_BOOTSTRAP, GameEngine, GameSnapshot } from '../core';
import type { GameEventView } from './game-view';
import { GameViewProjector } from './game-view-projector';
import { OperationalViewProjector } from './operational-view-projector';
import { presentationCatalog } from './presentation-catalog';

export class GameEventProjector {
  readonly #engine: GameEngine;
  readonly #viewProjector: GameViewProjector;

  constructor(engine: GameEngine, viewProjector: GameViewProjector) {
    this.#engine = engine;
    this.#viewProjector = viewProjector;
  }

  project(before: GameSnapshot, after: GameSnapshot): readonly GameEventView[] {
    const events: GameEventView[] = [];
    if (!before.launched && after.launched) {
      events.push({ id: `launch-${after.day}`, kind: 'launch', title: 'SERVICE ONLINE', message: '커뮤니티 서비스가 공개되었습니다. DAU 80에서 시작합니다.', autoPause: false });
    }
    if (after.currentFeature && after.currentFeature.id !== before.currentFeature?.id && after.currentFeature.id !== COMMUNITY_BOOTSTRAP.id) {
      const impact = this.#viewProjector.featureImpact(after, after.currentFeature.id);
      events.push({
        id: `req-${after.day}-${after.currentFeature.id}`,
        kind: 'requirement',
        title: 'NEW REQUIREMENT',
        message: `${presentationCatalog.label(after.currentFeature.id)} 개발이 자동으로 시작되었습니다.${impact ? ` 출시 예상 · ${impact.summary}` : ''}`,
        autoPause: true,
      });
    }
    if (after.growthEvent?.type === 'VIRAL' && before.growthEvent?.type !== 'VIRAL') {
      events.push({
        id: `traffic-${after.day}`,
        kind: 'traffic',
        title: 'TRAFFIC SPIKE',
        message: `바이럴 유입이 시작됐습니다. ${after.growthEvent.remainingDays}일 동안 유입 ×${after.growthEvent.trafficMultiplier.toFixed(1)}. 버티면 성장 기회를 모두 가져가지만 부하도 그대로 받고, Traffic Limit은 성장을 포기해 안정화하며, Emergency Burst는 비용을 내고 성장 기회를 유지합니다.`,
        autoPause: true,
      });
    }
    if (after.lastSettlement && after.lastSettlement.month !== before.lastSettlement?.month) {
      const settlement = after.lastSettlement;
      const sign = settlement.profit >= 0 ? '+' : '-';
      events.push({
        id: `settlement-${settlement.month}`,
        kind: 'settlement',
        title: `M${settlement.month} SETTLEMENT`,
        message: `월 매출 ${settlement.revenue.toLocaleString()}원 · 월 비용 ${settlement.totalCost.toLocaleString()}원 · 순변동 ${sign}${Math.abs(settlement.profit).toLocaleString()}원`,
        autoPause: false,
      });
    }
    const previousIncidents = new Set(before.incidents.map((incident) => incident.id));
    for (const incident of after.incidents) {
      if (previousIncidents.has(incident.id)) continue;
      const autoPause = incident.severity === 'MAJOR' || incident.severity === 'CRITICAL';
      events.push({
        id: incident.id,
        kind: 'incident',
        title: `${incident.severity} INCIDENT`,
        message: `${this.nodeLabel(incident.nodeId)}에서 장애가 발생했습니다.`,
        severity: incident.severity,
        nodeId: incident.nodeId,
        diagnosis: OperationalViewProjector.diagnosisText(incident.nodeId, after, this.#engine.developer),
        autoPause,
      });
    }
    if (before.status !== after.status && after.status === 'BANKRUPT') {
      events.push({ id: `bankrupt-${after.day}`, kind: 'bankrupt', title: 'BANKRUPT', message: '월 정산 후 현금이 음수가 되었습니다.', autoPause: true });
    }
    if (before.status !== after.status && after.status === 'WON') {
      events.push({ id: `won-${after.day}`, kind: 'won', title: 'EXIT', message: '모든 기능을 완성하고 목표 월 매출을 달성했습니다.', autoPause: true });
    }
    return events;
  }

  private nodeLabel(nodeId: string): string {
    return presentationCatalog.label(nodeId.split(':').pop() ?? nodeId);
  }
}
