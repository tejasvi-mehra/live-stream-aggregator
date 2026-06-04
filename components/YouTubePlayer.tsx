
import React from 'react';
import { StreamEvent, StreamSource } from '../types';
import { buildYouTubeLiveEmbedUrl } from '../services/youtubeService';
import PlayerNavButtons from './PlayerNavButtons';
import SourceSwitcher from './SourceSwitcher';

interface YouTubePlayerProps {
  event: StreamEvent;
  activeStream: StreamSource;
  isMinimized: boolean;
  onMinimize: () => void;
  onExpand: () => void;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSelectSource: (source: StreamSource) => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  event,
  activeStream,
  isMinimized,
  onMinimize,
  onExpand,
  onClose,
  onNext,
  onPrevious,
  onSelectSource,
  hasPrevious = true,
  hasNext = true,
}) => {
  const channelId = activeStream.channelId!;
  const embedUrl = buildYouTubeLiveEmbedUrl(channelId);

  const playerClasses = isMinimized
    ? 'fixed bottom-6 right-6 w-80 aspect-video z-50 rounded-xl overflow-hidden shadow-2xl border-2 border-slate-800 bg-black flex flex-col'
    : 'fixed inset-0 bg-black z-50 flex flex-col font-sans';

  return (
    <div className={playerClasses}>
      {!isMinimized && (
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent flex items-center justify-between z-30">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-white hover:text-red-500 transition-colors bg-black/20 hover:bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="font-bold text-sm">Close</span>
            </button>
            <button
              onClick={onMinimize}
              className="flex items-center gap-2 text-white hover:text-emerald-400 transition-colors bg-black/20 hover:bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
              <span className="font-bold text-sm">Minimize</span>
            </button>
          </div>
          <div className="text-right max-w-md">
            <h2 className="text-lg font-black text-white leading-tight uppercase tracking-tight truncate">
              {event.name}
            </h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              {event.categoryName} · YouTube
            </p>
          </div>
        </div>
      )}

      {isMinimized && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40 pointer-events-none hover:pointer-events-auto">
          <div className="flex gap-3 pointer-events-auto">
            <button onClick={onPrevious} className="p-2 bg-white/20 rounded-full text-white hover:scale-110 transition-transform backdrop-blur">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>
            <button onClick={onExpand} className="p-2 bg-white rounded-full text-black hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            <button onClick={onNext} className="p-2 bg-white/20 rounded-full text-white hover:scale-110 transition-transform backdrop-blur">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6zM16 6v12h2V6z" />
              </svg>
            </button>
            <button onClick={onClose} className="p-2 bg-red-600 rounded-full text-white hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="absolute bottom-2 text-[10px] font-bold text-white uppercase tracking-widest truncate px-4 w-full text-center pointer-events-none">
            {event.name}
          </p>
        </div>
      )}

      <div className="relative bg-black flex-1 min-h-0">
        <iframe
          key={channelId}
          src={embedUrl}
          title={event.name}
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>

      {!isMinimized && (
        <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              {event.logo && (
                <div className="h-10 w-10 bg-white rounded p-1 shrink-0">
                  <img src={event.logo} alt="" className="h-full w-full object-contain" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm text-slate-300 font-medium truncate">
                  {event.name}
                  {activeStream.liveTitle && (
                    <span className="text-slate-500"> · {activeStream.liveTitle}</span>
                  )}
                </p>
                <SourceSwitcher
                  event={event}
                  activeStream={activeStream}
                  onSelectSource={onSelectSource}
                />
              </div>
            </div>
            <PlayerNavButtons
              onPrevious={onPrevious}
              onNext={onNext}
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              variant="footer"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default YouTubePlayer;
