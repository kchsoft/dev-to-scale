import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { DevelopmentActionView, DevelopmentOptionView } from '../application/development-view';

interface DevelopmentActionDialogProps {
  readonly option: DevelopmentOptionView;
  readonly action: DevelopmentActionView;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function DevelopmentActionDialog({
  option,
  action,
  onCancel,
  onConfirm,
}: DevelopmentActionDialogProps) {
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
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'),
    );
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

  return <div
    className="development-dialog-backdrop"
    role="presentation"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}
  >
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
      <p id="development-dialog-description">
        {option.title}에 상태 변경을 적용합니다. 실행 시점의 최신 게임 규칙으로 다시 검증됩니다.
      </p>
      <div><small>ACTION</small><code>{action.kind}</code></div>
      <footer>
        <button type="button" ref={cancelRef} onClick={onCancel}>취소</button>
        <button type="button" className="confirm" onClick={onConfirm}>{option.actionLabel ?? '실행'}</button>
      </footer>
    </div>
  </div>;
}
