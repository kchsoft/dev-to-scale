import type {
  FeatureCardView,
  GameView,
  SkillNodeView,
  TechnologyOptionView,
} from './game-view';
import type {
  DevelopmentActionView,
  DevelopmentOptionState,
  DevelopmentOptionView,
  DevelopmentWorkbenchView,
} from './development-view';

const STATE_RANK: Readonly<Record<DevelopmentOptionState, number>> = {
  active: 0,
  ready: 1,
  locked: 2,
  completed: 3,
};

const STATUS_LABEL: Readonly<Record<DevelopmentOptionState, string>> = {
  active: '진행 중',
  ready: '시작 가능',
  locked: '잠금',
  completed: '완료',
};

interface IndexedOption {
  readonly option: DevelopmentOptionView;
  readonly index: number;
}

export class DevelopmentWorkbenchProjector {
  project(view: GameView): DevelopmentWorkbenchView {
    const featureOptions = view.features.map((feature) => this.featureOption(feature, view));
    const currentFeature = view.operations.currentFeature;
    if (currentFeature && !view.features.some(({ id }) => id === currentFeature.id)) {
      featureOptions.unshift(this.currentFeatureFallbackOption(view));
    }

    const options = [
      ...featureOptions,
      this.refactorOption(view),
      ...view.technologies.map((technology) => this.technologyOption(technology, view)),
      ...view.skills.map((skill) => this.learningOption(skill, view)),
    ];

    const sorted = options
      .map((option, index): IndexedOption => ({ option, index }))
      .sort((left, right) => left.option.sortRank - right.option.sortRank || left.index - right.index)
      .map(({ option }) => option);

    return {
      workSlots: view.workSlots,
      options: sorted,
    };
  }

  private currentFeatureFallbackOption(view: GameView): DevelopmentOptionView {
    const current = view.operations.currentFeature;
    if (!current) throw new Error('Current feature fallback requires an active feature');

    const slot = view.workSlots.find(({ id }) => id === 'feature');
    const action: DevelopmentActionView | null = view.hud.status === 'RUNNING'
      && view.hud.launched
      && view.operations.techDebt.canFastTrack
      ? { kind: 'fast-track-feature', featureId: current.id }
      : null;
    const unavailableReason = action
      ? null
      : view.hud.status !== 'RUNNING'
        ? '게임이 종료되어 Fast Track을 적용할 수 없음'
        : !view.hud.launched
          ? '서비스 출시 전에는 Fast Track을 적용할 수 없음'
          : view.operations.techDebt.refactoring
            ? 'Refactor 진행 중에는 Fast Track을 적용할 수 없음'
            : '이미 Fast Track을 적용했거나 현재 기능에는 적용할 수 없음';

    return this.option({
      id: `feature:${current.id}`,
      kind: 'feature',
      title: slot?.title && slot.title !== 'REFACTORING' ? slot.title : current.id,
      eyebrow: 'FEATURE · ACTIVE ROADMAP',
      summary: view.hud.launched
        ? '현재 자동 개발 중인 커뮤니티 요구사항'
        : '서비스 출시를 위해 자동 개발 중인 초기 기능',
      state: 'active',
      progress: current.requiredWork > 0 ? current.progress / current.requiredWork : null,
      durationLabel: `약 ${current.estimatedRemainingDays}일 남음`,
      upfrontCost: null,
      monthlyCost: null,
      benefits: [
        view.hud.launched ? '현재 로드맵 기능을 완료해 다음 요구사항으로 진행' : '초기 서비스 기능을 완료해 서비스 출시 단계로 진행',
      ],
      risks: [`Fast Track 사용 시 Tech Debt 증가 · 현재 ${view.operations.techDebt.value}/100`],
      requirements: ['로드맵 규칙에 따라 자동으로 진행되는 기능'],
      unavailableReason,
      actionLabel: action ? 'FAST TRACK · +30% PROGRESS' : null,
      action,
    });
  }

  private featureOption(feature: FeatureCardView, view: GameView): DevelopmentOptionView {
    const current = view.operations.currentFeature;
    const isCurrent = feature.state === 'developing' && current?.id === feature.id;
    const state: DevelopmentOptionState = feature.state === 'completed'
      ? 'completed'
      : isCurrent
        ? 'active'
        : 'locked';

    const fastTrackAction: DevelopmentActionView | null = isCurrent && view.hud.status === 'RUNNING' && view.hud.launched && view.operations.techDebt.canFastTrack
      ? { kind: 'fast-track-feature', featureId: feature.id }
      : null;

    const unavailableReason = state === 'completed'
      ? null
      : isCurrent
        ? fastTrackAction
          ? null
          : view.hud.status !== 'RUNNING'
            ? '게임이 종료되어 Fast Track을 적용할 수 없음'
            : !view.hud.launched
              ? '서비스 출시 전에는 Fast Track을 적용할 수 없음'
              : view.operations.techDebt.refactoring
                ? 'Refactor 진행 중에는 Fast Track을 적용할 수 없음'
                : '이미 Fast Track을 적용한 기능'
        : feature.state === 'hidden'
          ? `DAU ${feature.threshold} 도달 필요`
          : '로드맵 규칙에 따라 자동으로 시작되는 기능';

    const durationLabel = isCurrent && current
      ? `약 ${current.estimatedRemainingDays}일 남음`
      : null;
    const progress = isCurrent && current && current.requiredWork > 0
      ? current.progress / current.requiredWork
      : feature.state === 'completed'
        ? 1
        : null;

    const routeSummary = feature.route?.length
      ? `요청 경로 · ${feature.route.join(' → ')}`
      : feature.state === 'hidden'
        ? '요구사항이 공개되면 요청 경로를 확인할 수 있음'
        : '요청 경로 정보 없음';

    const benefits = feature.load
      ? [
          `Resource signature · APP ${feature.load.app} / DB ${feature.load.db} / ASYNC ${feature.load.async} / STORAGE ${feature.load.storage}`,
          routeSummary,
        ]
      : [routeSummary];

    return this.option({
      id: `feature:${feature.id}`,
      kind: 'feature',
      title: feature.name,
      eyebrow: `FEATURE · PHASE ${feature.phase}`,
      summary: state === 'completed'
        ? '출시가 완료된 로드맵 기능'
        : isCurrent
          ? '현재 자동 개발 중인 커뮤니티 요구사항'
          : feature.state === 'hidden'
            ? 'DAU 성장에 따라 공개되는 로드맵 기능'
            : '조건을 만족하면 자동으로 개발이 시작되는 로드맵 기능',
      state,
      progress,
      durationLabel,
      upfrontCost: null,
      monthlyCost: null,
      benefits,
      risks: isCurrent
        ? [`Fast Track 사용 시 Tech Debt 증가 · 현재 ${view.operations.techDebt.value}/100`]
        : [],
      requirements: feature.state === 'completed'
        ? []
        : [`공개 기준 · DAU ${feature.threshold}`],
      unavailableReason,
      actionLabel: fastTrackAction ? 'FAST TRACK · +30% PROGRESS' : null,
      action: fastTrackAction,
    });
  }

  private refactorOption(view: GameView): DevelopmentOptionView {
    const debt = view.operations.techDebt;
    const state: DevelopmentOptionState = debt.refactoring
      ? 'active'
      : view.hud.status === 'RUNNING' && view.hud.launched && debt.value >= 10
        ? 'ready'
        : 'locked';
    const action: DevelopmentActionView | null = state === 'ready' ? { kind: 'start-refactor' } : null;
    const progress = debt.refactoring ? 1 - debt.remainingRefactorDays / 5 : null;
    const unavailableReason = state === 'locked'
      ? view.hud.status !== 'RUNNING'
        ? '게임이 종료되어 실행할 수 없음'
        : !view.hud.launched
          ? '서비스 출시 후 사용할 수 있음'
          : `Tech Debt 10 이상 필요 · 현재 ${debt.value}`
      : null;

    return this.option({
      id: 'feature:refactor',
      kind: 'feature',
      title: 'Tech Debt Refactor',
      eyebrow: 'FEATURE OPS · MAINTENANCE',
      summary: debt.refactoring
        ? `리팩터링 진행 중 · ${debt.remainingRefactorDays}일 남음`
        : `누적 Tech Debt ${debt.value}/100을 정리해 개발 효율과 장애 위험을 회복`,
      state,
      progress,
      durationLabel: '5일',
      upfrontCost: null,
      monthlyCost: null,
      benefits: ['완료 시 Tech Debt -30', '개발 속도 페널티와 장애 위험 배율 완화'],
      risks: ['5일 동안 기능 개발 진행이 중단됨'],
      requirements: ['서비스 출시', 'Tech Debt 10 이상', '다른 Refactor가 진행 중이지 않음'],
      unavailableReason,
      actionLabel: action ? 'REFACTOR · 5 DAYS' : null,
      action,
    });
  }

  private technologyOption(technology: TechnologyOptionView, view: GameView): DevelopmentOptionView {
    const activeBuild = view.operations.currentTechnologyBuild;
    const building = activeBuild?.id === technology.id;
    const state: DevelopmentOptionState = technology.deployed
      ? 'completed'
      : building
        ? 'active'
        : technology.available && view.hud.status === 'RUNNING'
          ? 'ready'
          : 'locked';
    const action: DevelopmentActionView | null = state === 'ready'
      ? { kind: 'start-technology', technologyId: technology.id }
      : null;
    const progress = building && activeBuild && activeBuild.requiredWork > 0
      ? activeBuild.progress / activeBuild.requiredWork
      : technology.deployed
        ? 1
        : null;
    const durationLabel = building && activeBuild
      ? `약 ${activeBuild.estimatedRemainingDays}일 남음`
      : `BASE WORK ${technology.buildWork}`;

    return this.option({
      id: `technology:${technology.id}`,
      kind: 'technology',
      title: technology.name,
      eyebrow: `TECH · ${technology.id}`,
      summary: technology.preview || '서비스 토폴로지에 새로운 기술을 연결',
      state,
      progress,
      durationLabel,
      upfrontCost: technology.buildCost,
      monthlyCost: technology.monthlyCost,
      benefits: technology.benefits,
      risks: technology.tradeoffs,
      requirements: technology.reason ? [technology.reason] : ['기술 구축 슬롯 사용 가능', '선행 학습과 구축비 확보'],
      unavailableReason: state === 'locked' ? view.hud.status !== 'RUNNING' ? '게임이 종료되어 실행할 수 없음' : technology.reason ?? '현재 구축할 수 없음' : null,
      actionLabel: action ? `${technology.name} 구축 시작` : null,
      action,
    });
  }

  private learningOption(skill: SkillNodeView, view: GameView): DevelopmentOptionView {
    const completed = skill.level >= 10;
    const state: DevelopmentOptionState = completed
      ? 'completed'
      : skill.studying
        ? 'active'
        : skill.canStudy && view.hud.status === 'RUNNING'
          ? 'ready'
          : 'locked';
    const action: DevelopmentActionView | null = state === 'ready'
      ? { kind: 'start-learning', skill: skill.ref }
      : null;
    const target = skill.targetLevel ? `Lv.${skill.level} → Lv.${skill.targetLevel}` : `Lv.${skill.level}`;
    const experience = skill.requiredExperience === null
      ? '최대 레벨'
      : `경험 ${skill.experienceDays}/${skill.requiredExperience}일`;

    return this.option({
      id: `learning:${skill.key}`,
      kind: 'learning',
      title: skill.name,
      eyebrow: `LEARN · ${skill.category.toUpperCase()}`,
      summary: `${target} · ${experience}`,
      state,
      progress: skill.studying ? skill.studyProgress : completed ? 1 : null,
      durationLabel: skill.studyDays ? `${skill.studyDays}일` : null,
      upfrontCost: skill.cost,
      monthlyCost: null,
      benefits: completed ? ['최대 숙련도 도달'] : [`숙련도 상승 · ${target}`],
      risks: skill.studyDays ? [`${skill.studyDays}일 동안 학습 슬롯 점유`] : [],
      requirements: skill.reason ? [skill.reason] : [experience, '학습 비용 확보'],
      unavailableReason: state === 'locked' ? view.hud.status !== 'RUNNING' ? '게임이 종료되어 실행할 수 없음' : skill.reason ?? '현재 학습할 수 없음' : null,
      actionLabel: action && skill.targetLevel ? `${skill.name} Lv.${skill.targetLevel} 학습 시작` : null,
      action,
    });
  }

  private option(input: Omit<DevelopmentOptionView, 'statusLabel' | 'sortRank'>): DevelopmentOptionView {
    return {
      ...input,
      statusLabel: STATUS_LABEL[input.state],
      sortRank: STATE_RANK[input.state],
    };
  }
}
