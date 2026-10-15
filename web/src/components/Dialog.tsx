import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  /** Id of the element that names the dialog. */
  labelledBy: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

/** A modal panel over a dimmed page. Closes on Escape, the × button or a click outside. */
export function Dialog({ labelledBy, onClose, className, children }: Props) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className={className ? `detail ${className}` : 'detail'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeButton} type="button" className="detail-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
