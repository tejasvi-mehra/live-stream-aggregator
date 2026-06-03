
import React from 'react';
import { StreamEvent, StreamAudioTrack } from '../types';
import {
  getAudioTrackLabel,
  getEventAudioTracks,
  isAudioTrackPlayable,
} from '../services/audioTracks';

interface AudioSwitcherProps {
  event: StreamEvent;
  activeTrackId: string | null;
  onSelectTrack: (track: StreamAudioTrack) => void;
}

const AudioSwitcher: React.FC<AudioSwitcherProps> = ({
  event,
  activeTrackId,
  onSelectTrack,
}) => {
  const tracks = getEventAudioTracks(event);
  if (tracks.length === 0) {
    return null;
  }

  const activeTrack = tracks.find((track) => track.id === activeTrackId) ?? tracks[0];
  const activeIndex = tracks.findIndex((track) => track.id === activeTrack.id);
  const activeLabel = getAudioTrackLabel(activeTrack, activeIndex === -1 ? 0 : activeIndex);

  if (tracks.length === 1) {
    return (
      <p className="text-xs text-slate-500 mt-1">
        Audio · <span className="text-emerald-400 font-semibold">{activeLabel}</span>
      </p>
    );
  }

  return (
    <div className="mt-1.5">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">
        Audio · playing {activeLabel}
      </p>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {tracks.map((track, index) => {
          const label = getAudioTrackLabel(track, index);
          const isActive = track.id === activeTrack.id;
          const playable = isAudioTrackPlayable(track);

          return (
            <React.Fragment key={track.id}>
              {index > 0 && <span className="text-slate-600 text-xs">·</span>}
              <button
                type="button"
                onClick={() => onSelectTrack(track)}
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

export default AudioSwitcher;
