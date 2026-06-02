
import React from 'react';
import { StreamEvent, StreamSource } from '../types';
import { getSourceLabel, isSourcePlayable } from '../services/streamService';

interface SourceSwitcherProps {
  event: StreamEvent;
  activeStream: StreamSource;
  onSelectSource: (source: StreamSource) => void;
}

const SourceSwitcher: React.FC<SourceSwitcherProps> = ({
  event,
  activeStream,
  onSelectSource,
}) => {
  const activeLabel = getSourceLabel(event, activeStream);

  if (event.streams.length <= 1) {
    return (
      <p className="text-xs text-slate-500 mt-1">
        Playing <span className="text-emerald-400 font-semibold">{activeLabel}</span>
      </p>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">
        Sources · playing {activeLabel}
      </p>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {event.streams.map((source, index) => {
          const label = getSourceLabel(event, source);
          const isActive = source.id === activeStream.id;
          const playable = isSourcePlayable(source);

          return (
            <React.Fragment key={source.id}>
              {index > 0 && <span className="text-slate-600 text-xs">·</span>}
              <button
                type="button"
                onClick={() => onSelectSource(source)}
                className={`text-xs font-semibold transition-colors ${
                  isActive
                    ? 'text-emerald-400 underline underline-offset-2'
                    : playable
                      ? 'text-slate-300 hover:text-emerald-300 hover:underline underline-offset-2'
                      : 'text-slate-500 hover:text-slate-300 hover:underline underline-offset-2'
                }`}
                title={
                  playable
                    ? `Switch to ${label}`
                    : `${label} is offline — click to try anyway`
                }
              >
                {label}
                {isActive && ' ✓'}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default SourceSwitcher;
