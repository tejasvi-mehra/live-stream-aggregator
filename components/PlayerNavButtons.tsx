
import React from 'react';

interface PlayerNavButtonsProps {
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  variant?: 'overlay' | 'footer';
}

const PlayerNavButtons: React.FC<PlayerNavButtonsProps> = ({
  onPrevious,
  onNext,
  hasPrevious = true,
  hasNext = true,
  variant = 'footer',
}) => {
  const buttonClass =
    variant === 'overlay'
      ? 'text-white hover:text-emerald-400 transition-colors p-1'
      : 'text-slate-300 hover:text-emerald-400 transition-colors p-1.5 rounded-md hover:bg-slate-800';
  const disabledClass = 'opacity-40 cursor-not-allowed hover:text-inherit hover:bg-transparent';

  const iconClass = variant === 'overlay' ? 'w-6 h-6' : 'w-5 h-5';

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onPrevious}
        disabled={!hasPrevious}
        className={`${buttonClass} ${!hasPrevious ? disabledClass : ''}`}
        title="Previous stream"
        type="button"
      >
        <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>
      <button
        onClick={onNext}
        disabled={!hasNext}
        className={`${buttonClass} ${!hasNext ? disabledClass : ''}`}
        title="Next stream"
        type="button"
      >
        <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 18l8.5-6L6 6zM16 6v12h2V6z" />
        </svg>
      </button>
    </div>
  );
};

export default PlayerNavButtons;
