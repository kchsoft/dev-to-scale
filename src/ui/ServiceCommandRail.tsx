import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type {
  DevelopmentActionView,
  DevelopmentOptionKind,
  DevelopmentOptionView,
  DevelopmentWorkbenchView,
} from '../application/development-view';
import type { WorkSlotView } from '../application/game-view';
import { DevelopmentActionDialog } from './DevelopmentActionDialog';
import { DEVELOPMENT_KIND_LABEL, DevelopmentOptionDetail } from './DevelopmentOptionDetail';
import { optionIdForWorkSlot } from './DevelopmentWorkbench';
import { money, pct } from './game-format';

export type ServiceCommandState =
  | { readonly kind: DevelopmentOptionKind; readonly optionId: string | null }
  | null;

export interface ServiceCommandBrowseModel {
  readonly active: readonly DevelopmentOptionView[];
  readonly ready: readonly DevelopmentOptionView[];
  readonly lockedCount: number;
}

const COMMAND_KIND_TITLE: Readonly<Record<DevelopmentOptionKind, string>> = {
  feature: 'Feature',
  technology: 'Technology',
  learning: 'Learning',
};

export function developmentKindForWorkSlot(slot: WorkSlotView): DevelopmentOptionKind | null {
  if (slot.id === 'feature') return 'feature';
  if (slot.id === 'technology') return 'technology';
  if (slot.id === 'learning') return 'learning';
  return null;
}

export function serviceCommandStateForWorkSlot(
  slot: WorkSlotView,
  options: readonly DevelopmentOptionView[],
): ServiceCommandState {
  const kind = developmentKindForWorkSlot(slot);
  if (!kind) return null;
  return {
    kind,
    optionId: slot.active ? optionIdForWorkSlot(slot, options) : null,
  };
}

export function projectServiceCommandBrowse(
  options: readonly DevelopmentOptionView[],
  kind: DevelopmentOptionKind,
): ServiceCommandBrowseModel {
  const ofKind = options.filter((option) => option.kind === kind);
  return {
    active: ofKind.filter((option) => option.state === 'active'),
    ready: ofKind.filter((option) => option.state === 'ready'),
    lockedCount: ofKind.filter((option) => option.state === 'locked').length,
  };
}

export function reconcileServiceCommandState(
  state: ServiceCommandState,
  options: readonly DevelopmentOptionView[],
): ServiceCommandState {
  if (!state || !state.optionId) return state;
  return options.some((option) => option.id === state.optionId)
    ? state
    : { kind: state.kind, optionId: null };
}

interface ServiceCommandRailProps {
  readonly view: DevelopmentWorkbenchView;
  readonly state: NonNullable<ServiceCommandState>;
  readonly onStateChange: (next: ServiceCommandState) => void;
  readonly onAction: (action: DevelopmentActionView) => void;
  readonly onOpenFullBuild: (kind: DevelopmentOptionKind, optionId: string | null) => void;
  readonly onClose: () => void;
}

export function ServiceCommandRail({
  view,
  state,
  onStateChange,
  onAction,
  onOpenFullBuild,
  onClose,
}: ServiceCommandRailProps) {
  const [pendingAction, setPendingAction] = useState<DevelopmentActionView | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);
  const selected = state.optionId
    ? view.options.find((option) => option.id === state.optionId) ?? null
    : null;
  const kindTitle = COMMAND_KIND_TITLE[state.kind];

  useEffect(() => {
    if (!state.optionId || selected) return;
    setPendingAction(null);
    onStateChange({ kind: state.kind, optionId: null });
  }, [onStateChange, selected, state.kind, state.optionId]);

  const closeDialog = () => {
    setPendingAction(null);
    requestAnimationFrame(() => actionButtonRef.current?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || pendingAction) return;
    event.preventDefault();
    onClose();
  };

  return <aside
    className={`service-command-rail ${selected ? 'detail' : 'browse'}`}
    aria-labelledby="service-command-title"
    onKeyDown={onKeyDown}
  >
    <header className="service-command-header">
      <div>
        <span>QUICK COMMAND · {DEVELOPMENT_KIND_LABEL[state.kind]}</span>
        <strong id="service-command-title">{selected ? selected.title : `${kindTitle} 선택`}</strong>
      </div>
      <button type="button" className="service-command-close" onClick={onClose} aria-label={`${kindTitle} 빠른 선택 닫기`}>×</button>
    </header>

    {selected
      ? <ServiceCommandDetail
          option={selected}
          actionButtonRef={actionButtonRef}
          onBack={() => onStateChange({ kind: state.kind, optionId: null })}
          onAction={setPendingAction}
          onOpenFullBuild={() => onOpenFullBuild(state.kind, selected.id)}
        />
      : <ServiceCommandBrowse
          model={projectServiceCommandBrowse(view.options, state.kind)}
          kind={state.kind}
          onSelect={(optionId) => onStateChange({ kind: state.kind, optionId })}
          onOpenFullBuild={() => onOpenFullBuild(state.kind, null)}
        />}

    {pendingAction && selected && <DevelopmentActionDialog
      option={selected}
      action={pendingAction}
      onCancel={closeDialog}
      onConfirm={() => {
        onAction(pendingAction);
        closeDialog();
      }}
    />}
  </aside>;
}

function ServiceCommandBrowse({
  model,
  kind,
  onSelect,
  onOpenFullBuild,
}: {
  readonly model: ServiceCommandBrowseModel;
  readonly kind: DevelopmentOptionKind;
  readonly onSelect: (optionId: string) => void;
  readonly onOpenFullBuild: () => void;
}) {
  return <div className="service-command-body">
    <ServiceCommandSection
      label="IN PROGRESS"
      meta="현재 진행"
      options={model.active}
      empty="현재 진행 중인 작업 없음"
      onSelect={onSelect}
    />
    <ServiceCommandSection
      label="AVAILABLE NOW"
      meta="즉시 실행 가능"
      options={model.ready}
      empty="지금 바로 실행 가능한 선택 없음"
      onSelect={onSelect}
    />
    <div className="service-command-locked-summary">
      <div><span>LOCKED / NEEDS</span><small>전체 조건은 BUILD에서 확인</small></div>
      <b>{model.lockedCount}</b>
    </div>
    <button type="button" className="service-command-full-build" onClick={onOpenFullBuild}>
      <span>OPEN FULL BUILD</span>
      <small>{COMMAND_KIND_TITLE[kind]} 전체 전략 보기</small>
      <b aria-hidden="true">→</b>
    </button>
  </div>;
}

function ServiceCommandSection({
  label,
  meta,
  options,
  empty,
  onSelect,
}: {
  readonly label: string;
  readonly meta: string;
  readonly options: readonly DevelopmentOptionView[];
  readonly empty: string;
  readonly onSelect: (optionId: string) => void;
}) {
  return <section className="service-command-section">
    <header><div><span>{label}</span><small>{meta}</small></div><b>{options.length}</b></header>
    <div className="service-command-options">
      {options.length
        ? options.map((option) => <button
            type="button"
            key={option.id}
            className={`service-command-option ${option.state}`}
            onClick={() => onSelect(option.id)}
          >
            <div><small>{option.eyebrow}</small><em className={`development-state ${option.state}`}>{option.statusLabel}</em></div>
            <strong>{option.title}</strong>
            <p>{option.benefits[0] ?? option.summary}</p>
            <span className="service-command-option-meta">
              <b>{option.durationLabel ?? '—'}</b>
              <b>{option.upfrontCost === null ? '—' : money(option.upfrontCost)}</b>
              <b>{option.monthlyCost === null ? '—' : `${money(option.monthlyCost)}/mo`}</b>
            </span>
            {option.progress !== null && <div className="development-progress" aria-label={`${pct(option.progress)}%`}><i style={{ width: `${pct(option.progress)}%` }} /></div>}
          </button>)
        : <div className="service-command-empty">{empty}</div>}
    </div>
  </section>;
}

function ServiceCommandDetail({
  option,
  actionButtonRef,
  onBack,
  onAction,
  onOpenFullBuild,
}: {
  readonly option: DevelopmentOptionView;
  readonly actionButtonRef: React.RefObject<HTMLButtonElement | null>;
  readonly onBack: () => void;
  readonly onAction: (action: DevelopmentActionView) => void;
  readonly onOpenFullBuild: () => void;
}) {
  return <div className="service-command-detail">
    <div className="service-command-detail-nav">
      <button type="button" onClick={onBack}>← {DEVELOPMENT_KIND_LABEL[option.kind]}</button>
      <button type="button" onClick={onOpenFullBuild}>전체 BUILD에서 보기 →</button>
    </div>
    <DevelopmentOptionDetail
      option={option}
      titleId="service-command-title"
      actionButtonRef={actionButtonRef}
      onAction={onAction}
      className="service-command-detail-body"
    />
  </div>;
}
