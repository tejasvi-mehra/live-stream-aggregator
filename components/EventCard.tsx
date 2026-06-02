
import React from 'react';
import { StreamEvent } from '../types';
import { getEventSourceSummary, isEventPlayable } from '../services/streamService';
import { FALLBACK_LOGO } from '../constants';

interface EventCardProps {
  event: StreamEvent;
  onClick: (event: StreamEvent) => void;
}

const EventCard: React.FC<EventCardProps> = ({ event, onClick }) => {
  const playable = isEventPlayable(event);
  const summary = getEventSourceSummary(event);

  const handleClick = () => {
    if (!playable) return;
    onClick(event);
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative flex flex-col gap-2 transition-transform duration-300 ${
        playable ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed opacity-70'
      }`}
    >
      <div
        className={`aspect-video w-full bg-slate-800 rounded-lg overflow-hidden border relative ${
          playable
            ? 'border-slate-700 group-hover:border-emerald-500'
            : 'border-slate-800'
        }`}
      >
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 to-slate-800">
          {event.logo ? (
            <img
              src={event.logo}
              alt={event.name}
              className="max-w-full max-h-full object-contain filter drop-shadow-lg"
              onError={(e) => {
                (e.target as HTMLImageElement).src = FALLBACK_LOGO;
              }}
            />
          ) : (
            <div className="text-slate-500 font-bold text-center">
              <div className="text-2xl mb-1">{event.name.charAt(0)}</div>
              <div className="text-[10px] uppercase tracking-widest">{event.categoryName}</div>
            </div>
          )}
        </div>

        {playable && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-emerald-600 rounded-full p-3 shadow-xl">
              <svg className="w-6 h-6 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {summary.hasYouTube && (
            <span className="bg-red-600 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">YouTube</span>
          )}
          {summary.hasYouTube ? (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                summary.isLive ? 'bg-emerald-600 animate-pulse' : 'bg-slate-600'
              }`}
            >
              {summary.isLive ? 'Live' : 'Not live'}
            </span>
          ) : (
            <>
              <span className="bg-red-600 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">Live</span>
              {summary.bestLatency != null && (
                <span className="bg-emerald-600 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">
                  {summary.bestLatency}ms
                </span>
              )}
              {!summary.isLive && (
                <span className="bg-slate-700 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">Offline</span>
              )}
            </>
          )}
          {summary.sourceCount > 1 && (
            <span className="bg-slate-700 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">
              {summary.sourceCount} sources
            </span>
          )}
        </div>
      </div>
      <div className="px-1">
        <h3
          className={`text-sm font-semibold truncate transition-colors ${
            playable ? 'text-slate-100 group-hover:text-emerald-400' : 'text-slate-400'
          }`}
        >
          {event.name}
        </h3>
        <p className="text-[10px] text-slate-400 uppercase tracking-wider">{event.categoryName}</p>
      </div>
    </div>
  );
};

export default EventCard;
