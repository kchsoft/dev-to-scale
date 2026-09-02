import type { RefObject } from 'react';
import type {
  DevelopmentActionView,
  DevelopmentOptionKind,
  DevelopmentOptionView,
} from '../application/development-view';
import { money, pct } from './game-format';

export const DEVELOPMENT_KIND_LABEL: Readonly<Record<DevelopmentOptionKind, string>> = {
  feature: 'FEATURE',
  technology: 'TECH',
  learning: 'LEARN',
};

interface DevelopmentOptionDetailProps {
  readonly option: DevelopmentOptionView;
  readonly titleId: string;
  readonly actionButtonRef?: RefObject<HTMLButtonElement | null>;
  readonly onAction?: (action: DevelopmentActionView) => void;
  readonly className?: string;
}

export function DevelopmentOptionDetail({
  option,
  titleId,
  actionButtonRef,
  onAction,
  className = '',
}: DevelopmentOptionDetailProps) {
  return <>
    <div className={`development-inspector-body ${className}`.trim()} aria-labelledby={titleId}>
      <div className="development-inspector-status">
        <em className={`development-state ${option.state}`}>{option.statusLabel}</em>
        <code>{option.id}</code>
      </div>
      <p className="development-summary">{option.summary}</p>

      {option.progress !== null && <section>
        <label>PROGRESS</label>
        <div className="development-progress"><i style={{ width: `${pct(option.progress)}%` }} /></div>
        <strong>{pct(option.progress)}%</strong>
      </section>}

      <div className="development-cost-grid">
        <span><small>TIME</small><b>{option.durationLabel ?? '—'}</b></span>
        <span><small>UPFRONT</small><b>{option.upfrontCost === null ? '—' : money(option.upfrontCost)}</b></span>
        <span><small>MONTHLY</small><b>{option.monthlyCost === null ? '—' : money(option.monthlyCost)}</b></span>
      </div>

      <DevelopmentDetailList title="BENEFIT" items={option.benefits} empty="표시할 주요 효과 없음" />
      <DevelopmentDetailList title="RISK / TRADE-OFF" items={option.risks} empty="추가 위험 정보 없음" />
      <DevelopmentDetailList title="REQUIREMENTS" items={option.requirements} empty="추가 선행 조건 없음" />

      {option.unavailableReason && <div className="development-blocker">
        <span>UNAVAILABLE</span>
        <strong>{option.unavailableReason}</strong>
      </div>}
    </div>
    <footer>
      {option.action && onAction
        ? <button
            type="button"
            ref={actionButtonRef}
            className="development-primary-action"
            onClick={() => onAction(option.action!)}
          >{option.actionLabel ?? '실행'}</button>
        : <span>현재 실행 가능한 Action 없음</span>}
    </footer>
  </>;
}

function DevelopmentDetailList({
  title,
  items,
  empty,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly empty: string;
}) {
  return <section className="development-inspector-list">
    <label>{title}</label>
    {items.length
      ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
      : <p>{empty}</p>}
  </section>;
}
