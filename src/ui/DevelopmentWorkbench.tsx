import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type {
  DevelopmentActionView,
  DevelopmentOptionKind,
  DevelopmentOptionView,
  DevelopmentWorkbenchView,
} from '../application/development-view';
import type { WorkSlotView } from '../application/game-view';
import { money, pct } from './game-format';

export type DevelopmentFilter = 'all' | DevelopmentOptionKind;

const FILTERS: readonly { readonly id: DevelopmentFilter; readonly label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'feature', label: 'FEATURE' },
  { id: 'technology', label: 'TECH' },
  { id: 'learning', label: 'LEARN' },
];

const KIND_LABEL: Readonly<Record<DevelopmentOptionKind, string>> = {
  feature: 'FEATURE',
  technology: 'TECH',
  learning: 'LEARN',
};

interface DevelopmentWorkbenchProps {
  readonly view: DevelopmentWorkbenchView;
  readonly initialSelectedId?: string | null;
  readonly onAction: (action: DevelopmentActionView) => void;
}

export function filterDevelopmentOptions(
  options: readonly DevelopmentOptionView[],
  filter: DevelopmentFilter,
): readonly DevelopmentOptionView[] {
  return filter === 'all' ? options : options.filter((option) => option.kind === filter);
}

export function optionIdForWorkSlot(
  slot: WorkSlotView,
  options: readonly DevelopmentOptionView[],
): string | null {
  if (!slot.active || slot.id === 'incident') return null;
  const kind: DevelopmentOptionKind = slot.id === 'feature'
    ? 'feature'
    : slot.id === 'technology'
      ? 'technology'
      : 'learning';
  const active = options.filter((option) => option.kind === kind && option.state === 'active');
  if (slot.id === 'feature' && slot.title === 'REFACTORING') {
    return active.find((option) => option.id === 'feature:refactor')?.id ?? null;
  }
  return active.find((option) => option.id !== 'feature:refactor')?.id ?? active[0]?.id ?? null;
}

export function DevelopmentWorkbench({ view, initialSelectedId = null, onAction }: DevelopmentWorkbenchProps) {
  const [filter, setFilter] = useState<DevelopmentFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(() => (
    initialSelectedId && view.options.some((option) => option.id === initialSelectedId)
      ? initialSelectedId
      : null
  ));
  const [pendingAction, setPendingAction] = useState<DevelopmentActionView | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);

  const visibleOptions = useMemo(
    () => filterDevelopmentOptions(view.options, filter),
    [view.options, filter],
  );
  const selected = selectedId
    ? view.options.find((option) => option.id === selectedId) ?? null
    : null;

  useEffect(() => {
    if (selectedId && !visibleOptions.some((option) => option.id === selectedId)) {
      setSelectedId(null);
      setPendingAction(null);
    }
  }, [selectedId, visibleOptions]);

  const selectSlot = (slot: WorkSlotView) => {
    const optionId = optionIdForWorkSlot(slot, view.options);
    if (!optionId) return;
    setFilter('all');
    setSelectedId(optionId);
  };

  const closeDialog = () => {
    setPendingAction(null);
    requestAnimationFrame(() => actionButtonRef.current?.focus());
  };

  return <section className="development-workbench" aria-labelledby="development-workbench-title">
    <header className="development-heading">
      <div>
        <span>UNIFIED WORKBENCH</span>
        <h2 id="development-workbench-title">개발 의사결정</h2>
        <p>기능 · 기술 · 학습을 한 화면에서 비용, 시간, 효과, 위험, 선행 조건 기준으로 비교합니다.</p>
      </div>
      <div className="development-legend" aria-label="정렬 우선순위">
        <span>01 ACTIVE</span><span>02 READY</span><span>03 LOCKED</span><span>04 DONE</span>
      </div>
    </header>

    <WorkSlotStrip slots={view.workSlots} onSelect={selectSlot} />

    <div className="development-grid">
      <DevelopmentFilterBar filter={filter} options={view.options} onChange={setFilter} />
      <DevelopmentOptionList
        options={visibleOptions}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <DevelopmentInspector
        option={selected}
        actionButtonRef={actionButtonRef}
        onClose={() => setSelectedId(null)}
        onAction={(action) => setPendingAction(action)}
      />
    </div>

    {pendingAction && selected && selected.action && <StartDevelopmentDialog
      option={selected}
      action={pendingAction}
      onCancel={closeDialog}
      onConfirm={() => {
        onAction(pendingAction);
        closeDialog();
      }}
    />}
  </section>;
}

function WorkSlotStrip({ slots, onSelect }: { readonly slots: readonly WorkSlotView[]; readonly onSelect: (slot: WorkSlotView) => void }) {
  return <section className="development-slots" aria-label="작업 슬롯">
    {slots.map((slot) => <button
      type="button"
      key={slot.id}
      className={`development-slot ${slot.active ? 'active' : 'empty'}`}
      onClick={() => onSelect(slot)}
      disabled={!slot.active || slot.id === 'incident'}
    >
      <div><span>{slot.label}</span><b>{slot.active ? '● ACTIVE' : '○ IDLE'}</b></div>
      <strong>{slot.title}</strong>
      <small>{slot.meta}</small>
      {slot.progress !== null && <div className="development-progress" aria-label={`${pct(slot.progress)}%`}><i style={{ width: `${pct(slot.progress)}%` }} /></div>}
    </button>)}
  </section>;
}

function DevelopmentFilterBar({
  filter,
  options,
  onChange,
}: {
  readonly filter: DevelopmentFilter;
  readonly options: readonly DevelopmentOptionView[];
  readonly onChange: (filter: DevelopmentFilter) => void;
}) {
  return <aside className="development-filters panel-shell" aria-label="개발 종류 필터">
    <header><span>FILTERS</span><strong>OPTION TYPE</strong></header>
    <div role="tablist" aria-label="개발 종류">
      {FILTERS.map((item) => {
        const count = item.id === 'all' ? options.length : options.filter((option) => option.kind === item.id).length;
        return <button
          type="button"
          role="tab"
          aria-selected={filter === item.id}
          className={filter === item.id ? 'active' : ''}
          key={item.id}
          onClick={() => onChange(item.id)}
        >
          <span>{item.label}</span><b>{count}</b>
        </button>;
      })}
    </div>
    <p>상태 우선순위는 Application에서 계산됩니다. 필터는 정렬을 바꾸지 않습니다.</p>
  </aside>;
}

function DevelopmentOptionList({
  options,
  selectedId,
  onSelect,
}: {
  readonly options: readonly DevelopmentOptionView[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}) {
  return <section className="development-list panel-shell" aria-label="개발 옵션">
    <header><div><span>DEVELOPMENT OPTIONS</span><strong>현재 작업과 다음 선택지</strong></div><b>{options.length} ITEMS</b></header>
    <div className="development-list-body">
      {options.length === 0
        ? <div className="development-empty"><strong>표시할 항목이 없습니다.</strong><small>다른 종류 필터를 선택하세요.</small></div>
        : options.map((option) => <DevelopmentOptionRow
            key={option.id}
            option={option}
            selected={selectedId === option.id}
            onSelect={() => onSelect(option.id)}
          />)}
    </div>
  </section>;
}

function DevelopmentOptionRow({ option, selected, onSelect }: { readonly option: DevelopmentOptionView; readonly selected: boolean; readonly onSelect: () => void }) {
  const headline = option.unavailableReason ?? option.benefits[0] ?? option.summary;
  return <button
    type="button"
    className={`development-option-row ${option.kind} ${option.state} ${selected ? 'selected' : ''}`}
    onClick={onSelect}
    aria-pressed={selected}
  >
    <span className="development-kind">{KIND_LABEL[option.kind]}</span>
    <div className="development-option-copy">
      <div><small>{option.eyebrow}</small><em className={`development-state ${option.state}`}>{option.statusLabel}</em></div>
      <strong>{option.title}</strong>
      <p>{headline}</p>
      {option.progress !== null && <div className="development-progress" aria-label={`${pct(option.progress)}%`}><i style={{ width: `${pct(option.progress)}%` }} /></div>}
    </div>
    <div className="development-option-metrics">
      <span><small>TIME</small><b>{option.durationLabel ?? '—'}</b></span>
      <span><small>UPFRONT</small><b>{option.upfrontCost === null ? '—' : money(option.upfrontCost)}</b></span>
      <span><small>MONTHLY</small><b>{option.monthlyCost === null ? '—' : money(option.monthlyCost)}</b></span>
    </div>
    <span className="development-chevron" aria-hidden="true">›</span>
  </button>;
}

function DevelopmentInspector({
  option,
  actionButtonRef,
  onClose,
  onAction,
}: {
  readonly option: DevelopmentOptionView | null;
  readonly actionButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
  readonly onAction: (action: DevelopmentActionView) => void;
}) {
  if (!option) {
    return <aside className="development-inspector panel-shell" aria-labelledby="development-inspector-title">
      <header><span>INSPECTOR</span><strong id="development-inspector-title">선택 항목 검토</strong></header>
      <div className="development-inspector-empty">
        <b>NO SELECTION</b>
        <strong>검토할 개발 항목을 선택하세요.</strong>
        <p>선택만으로 게임 상태는 바뀌지 않습니다. 실행 가능한 항목도 Inspector와 최종 확인을 거쳐야 합니다.</p>
      </div>
    </aside>;
  }

  return <aside className="development-inspector panel-shell" aria-labelledby="development-inspector-title">
    <header><div><span>INSPECTOR · {KIND_LABEL[option.kind]}</span><strong id="development-inspector-title">{option.title}</strong></div><button type="button" onClick={onClose} aria-label="Inspector 닫기">×</button></header>
    <div className="development-inspector-body">
      <div className="development-inspector-status"><em className={`development-state ${option.state}`}>{option.statusLabel}</em><code>{option.id}</code></div>
      <p className="development-summary">{option.summary}</p>

      {option.progress !== null && <section><label>PROGRESS</label><div className="development-progress"><i style={{ width: `${pct(option.progress)}%` }} /></div><strong>{pct(option.progress)}%</strong></section>}

      <div className="development-cost-grid">
        <span><small>TIME</small><b>{option.durationLabel ?? '—'}</b></span>
        <span><small>UPFRONT</small><b>{option.upfrontCost === null ? '—' : money(option.upfrontCost)}</b></span>
        <span><small>MONTHLY</small><b>{option.monthlyCost === null ? '—' : money(option.monthlyCost)}</b></span>
      </div>

      <InspectorList title="BENEFIT" items={option.benefits} empty="표시할 주요 효과 없음" />
      <InspectorList title="RISK / TRADE-OFF" items={option.risks} empty="추가 위험 정보 없음" />
      <InspectorList title="REQUIREMENTS" items={option.requirements} empty="추가 선행 조건 없음" />

      {option.unavailableReason && <div className="development-blocker"><span>UNAVAILABLE</span><strong>{option.unavailableReason}</strong></div>}
    </div>
    <footer>
      {option.action
        ? <button type="button" ref={actionButtonRef} className="development-primary-action" onClick={() => onAction(option.action!)}>{option.actionLabel ?? '실행'}</button>
        : <span>현재 실행 가능한 Action 없음</span>}
    </footer>
  </aside>;
}

function InspectorList({ title, items, empty }: { readonly title: string; readonly items: readonly string[]; readonly empty: string }) {
  return <section className="development-inspector-list"><label>{title}</label>{items.length
    ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    : <p>{empty}</p>}</section>;
}

function StartDevelopmentDialog({
  option,
  action,
  onCancel,
  onConfirm,
}: {
  readonly option: DevelopmentOptionView;
  readonly action: DevelopmentActionView;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')) as HTMLElement[];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <div className="development-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div
      ref={dialogRef}
      className="development-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="development-dialog-title"
      aria-describedby="development-dialog-description"
      onKeyDown={onKeyDown}
    >
      <span>CONFIRM ACTION</span>
      <h3 id="development-dialog-title">{option.actionLabel ?? option.title}</h3>
      <p id="development-dialog-description">{option.title}에 상태 변경을 적용합니다. 실행 시점의 최신 게임 규칙으로 다시 검증됩니다.</p>
      <div><small>ACTION</small><code>{action.kind}</code></div>
      <footer><button type="button" ref={cancelRef} onClick={onCancel}>취소</button><button type="button" className="confirm" onClick={onConfirm}>{option.actionLabel ?? '실행'}</button></footer>
    </div>
  </div>;
}
