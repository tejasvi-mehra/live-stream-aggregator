
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls, { ErrorDetails, ErrorTypes, Events } from 'hls.js';
import { StreamEvent, StreamSource, StreamAudioTrack } from '../types';
import { findFailoverSource, getStreamPlaybackUrl } from '../services/streamService';
import {
  findAudioTrackById,
  findFailoverAudioTrack,
  getAudioPlaybackUrl,
  getFirstPlayableAudioTrack,
  sourceUsesSeparateAudio,
} from '../services/audioTracks';
import {
  getHlsConfig,
  getRecoveryConfig,
  shouldFailoverAfterAttempt,
} from '../hlsConfig';
import { getProfileMeta } from '../services/streamService';
import YouTubePlayer from './YouTubePlayer';
import PlayerNavButtons from './PlayerNavButtons';
import SourceSwitcher from './SourceSwitcher';
import AudioSwitcher from './AudioSwitcher';

const AUDIO_SYNC_THRESHOLD_SEC = 0.35;

interface QualityLevel {
  index: number;
  label: string;
}

interface VideoPlayerProps {
  event: StreamEvent;
  activeStream: StreamSource;
  isMinimized: boolean;
  onMinimize: () => void;
  onExpand: () => void;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onFailover: (stream: StreamSource) => void;
  onSelectSource: (stream: StreamSource) => void;
}

const AUTOPLAY_KEY = 'livestream_autoplay_next';
const VOLUME_KEY = 'livestream_volume';
const MUTED_KEY = 'livestream_muted';

const HlsVideoPlayer: React.FC<VideoPlayerProps> = ({
  event,
  activeStream,
  isMinimized,
  onMinimize,
  onExpand,
  onClose,
  onNext,
  onPrevious,
  onFailover,
  onSelectSource,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const audioHlsRef = useRef<Hls | null>(null);
  const prevSourceIdRef = useRef<string | null>(null);
  const recoverAttemptsRef = useRef(0);
  const audioRecoverAttemptsRef = useRef(0);
  const recoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRecoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingSource, setSwitchingSource] = useState(false);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [autoPlayNext, setAutoPlayNext] = useState(() => {
    return localStorage.getItem(AUTOPLAY_KEY) === 'true';
  });
  const profileKey = useMemo(() => getProfileMeta().key, []);
  const recoveryConfig = getRecoveryConfig(profileKey);
  const hlsConfig = getHlsConfig(profileKey);
  const eventRef = useRef(event);
  const onFailoverRef = useRef(onFailover);
  const onNextRef = useRef(onNext);

  eventRef.current = event;
  onFailoverRef.current = onFailover;
  onNextRef.current = onNext;

  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem(VOLUME_KEY);
    return saved !== null ? parseFloat(saved) : 1;
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return localStorage.getItem(MUTED_KEY) === 'true';
  });
  const [activeAudioTrackId, setActiveAudioTrackId] = useState<string | null>(() => {
    return getFirstPlayableAudioTrack(activeStream)?.id ?? activeStream.audioTracks?.[0]?.id ?? null;
  });
  const usesSeparateAudio = sourceUsesSeparateAudio(activeStream);
  const activeAudioTrack = useMemo(() => {
    if (activeAudioTrackId) {
      return findAudioTrackById(event, activeAudioTrackId) ?? getFirstPlayableAudioTrack(activeStream);
    }
    return getFirstPlayableAudioTrack(activeStream);
  }, [activeAudioTrackId, activeStream, event]);

  useEffect(() => {
    const firstTrack =
      getFirstPlayableAudioTrack(activeStream) ?? activeStream.audioTracks?.[0] ?? null;
    setActiveAudioTrackId(firstTrack?.id ?? null);
  }, [activeStream.id]);

  const handleVolumeChange = (newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolume(clampedVolume);
    localStorage.setItem(VOLUME_KEY, clampedVolume.toString());

    if (videoRef.current) {
      videoRef.current.volume = clampedVolume;
    }
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }

    if (clampedVolume > 0 && isMuted) {
      setIsMuted(false);
      localStorage.setItem(MUTED_KEY, 'false');
      if (videoRef.current) {
        videoRef.current.muted = false;
      }
      if (audioRef.current) {
        audioRef.current.muted = false;
      }
    }
  };

  const toggleMute = () => {
    const newState = !isMuted;
    setIsMuted(newState);
    localStorage.setItem(MUTED_KEY, String(newState));
    if (videoRef.current) {
      videoRef.current.muted = newState;
    }
    if (audioRef.current) {
      audioRef.current.muted = newState;
    }
  };

  const toggleAutoPlay = () => {
    const newState = !autoPlayNext;
    setAutoPlayNext(newState);
    localStorage.setItem(AUTOPLAY_KEY, String(newState));
  };

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    if (usesSeparateAudio && audio) {
      video.muted = true;
      audio.volume = volume;
      audio.muted = isMuted;
      return;
    }

    video.volume = volume;
    video.muted = isMuted;
  }, [volume, isMuted, usesSeparateAudio, activeStream.id]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio || !usesSeparateAudio || !activeAudioTrack) {
      return;
    }

    const syncAudioToVideo = (force = false) => {
      const drift = Math.abs(audio.currentTime - video.currentTime);
      if (force || drift > AUDIO_SYNC_THRESHOLD_SEC) {
        audio.currentTime = video.currentTime;
      }
    };

    const handleVideoPlay = () => {
      syncAudioToVideo(true);
      audio.play().catch(() => undefined);
    };
    const handleVideoPause = () => {
      audio.pause();
    };
    const handleVideoSeeking = () => {
      syncAudioToVideo(true);
    };
    const handleVideoTimeUpdate = () => {
      syncAudioToVideo(false);
    };

    video.addEventListener('play', handleVideoPlay);
    video.addEventListener('pause', handleVideoPause);
    video.addEventListener('seeking', handleVideoSeeking);
    video.addEventListener('timeupdate', handleVideoTimeUpdate);

    return () => {
      video.removeEventListener('play', handleVideoPlay);
      video.removeEventListener('pause', handleVideoPause);
      video.removeEventListener('seeking', handleVideoSeeking);
      video.removeEventListener('timeupdate', handleVideoTimeUpdate);
    };
  }, [usesSeparateAudio, activeStream.id, activeAudioTrack?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    const playbackUrl = activeAudioTrack ? getAudioPlaybackUrl(activeAudioTrack) : undefined;
    if (!audio || !playbackUrl || !usesSeparateAudio) {
      if (audioHlsRef.current) {
        audioHlsRef.current.destroy();
        audioHlsRef.current = null;
      }
      return;
    }

    audioRecoverAttemptsRef.current = 0;

    const clearAudioRecoveryTimers = () => {
      if (audioRecoverTimerRef.current) {
        clearTimeout(audioRecoverTimerRef.current);
        audioRecoverTimerRef.current = null;
      }
    };

    const failOrFailoverAudio = () => {
      clearAudioRecoveryTimers();
      const currentTrackId = activeAudioTrack.id;
      const fallback = findFailoverAudioTrack(eventRef.current, activeStream, currentTrackId);
      if (fallback && fallback.id !== currentTrackId) {
        setActiveAudioTrackId(fallback.id);
        return;
      }
    };

    const scheduleAudioRecover = (recover: () => void) => {
      audioRecoverAttemptsRef.current += 1;
      if (shouldFailoverAfterAttempt(audioRecoverAttemptsRef.current, recoveryConfig.maxAttempts)) {
        failOrFailoverAudio();
        return;
      }

      const delay = recoveryConfig.baseDelayMs * 2 ** (audioRecoverAttemptsRef.current - 1);
      clearAudioRecoveryTimers();
      audioRecoverTimerRef.current = setTimeout(() => {
        recover();
        audio.play().catch(() => undefined);
      }, delay);
    };

    if (audioHlsRef.current) {
      audioHlsRef.current.destroy();
      audioHlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const audioHls = new Hls(hlsConfig);
      audioHlsRef.current = audioHls;
      audioHls.loadSource(playbackUrl);
      audioHls.attachMedia(audio);

      audioHls.on(Events.MANIFEST_PARSED, () => {
        const video = videoRef.current;
        if (video && !video.paused) {
          audio.currentTime = video.currentTime;
          audio.play().catch(() => undefined);
        }
      });

      audioHls.on(Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case ErrorTypes.NETWORK_ERROR:
              scheduleAudioRecover(() => audioHls.startLoad());
              return;
            case ErrorTypes.MEDIA_ERROR:
              scheduleAudioRecover(() => audioHls.recoverMediaError());
              return;
            default:
              failOrFailoverAudio();
              return;
          }
        }
      });

      return () => {
        clearAudioRecoveryTimers();
        audioHls.destroy();
        audioHlsRef.current = null;
      };
    }

    if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      audio.src = playbackUrl;
      const onMetadata = () => {
        const video = videoRef.current;
        if (video) {
          audio.currentTime = video.currentTime;
        }
        if (video && !video.paused) {
          audio.play().catch(() => undefined);
        }
      };
      audio.addEventListener('loadedmetadata', onMetadata);
      return () => {
        audio.removeEventListener('loadedmetadata', onMetadata);
        clearAudioRecoveryTimers();
      };
    }

    return () => {
      clearAudioRecoveryTimers();
    };
  }, [
    activeAudioTrack?.id,
    activeAudioTrack?.playbackUrl,
    activeStream.id,
    hlsConfig,
    recoveryConfig,
    usesSeparateAudio,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    const playbackUrl = getStreamPlaybackUrl(activeStream);
    if (!video || !playbackUrl) return;

    const isSourceSwitch =
      prevSourceIdRef.current !== null && prevSourceIdRef.current !== activeStream.id;
    prevSourceIdRef.current = activeStream.id;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (usesSeparateAudio) {
      video.muted = true;
    }

    setLoading(true);
    setSwitchingSource(isSourceSwitch);
    setError(null);
    setQualities([]);
    setCurrentQuality(-1);

    const handleEnterPip = () => setIsPipActive(true);
    const handleLeavePip = () => setIsPipActive(false);

    const handleEnded = () => {
      if (autoPlayNext) {
        onNextRef.current();
      }
    };

    video.addEventListener('enterpictureinpicture', handleEnterPip);
    video.addEventListener('leavepictureinpicture', handleLeavePip);
    video.addEventListener('ended', handleEnded);

    recoverAttemptsRef.current = 0;

    const clearRecoveryTimers = () => {
      if (recoverTimerRef.current) {
        clearTimeout(recoverTimerRef.current);
        recoverTimerRef.current = null;
      }
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };

    const resetRecovery = () => {
      recoverAttemptsRef.current = 0;
      clearRecoveryTimers();
    };

    const failOrFailover = (message: string) => {
      clearRecoveryTimers();
      const fallback = findFailoverSource(eventRef.current, activeStream.id);
      if (fallback) {
        onFailoverRef.current(fallback);
        return;
      }
      setError(message);
      setLoading(false);
    };

    const scheduleRecover = (reason: string, recover: () => void) => {
      recoverAttemptsRef.current += 1;
      if (shouldFailoverAfterAttempt(recoverAttemptsRef.current, recoveryConfig.maxAttempts)) {
        failOrFailover(`Stream Error: ${reason}`);
        return;
      }

      const delay = recoveryConfig.baseDelayMs * 2 ** (recoverAttemptsRef.current - 1);
      clearRecoveryTimers();
      recoverTimerRef.current = setTimeout(() => {
        recover();
        video.play().catch(() => undefined);
      }, delay);
    };

    const handlePlaying = () => {
      resetRecovery();
    };

    if (Hls.isSupported()) {
      const hls = new Hls(hlsConfig);
      hlsRef.current = hls;
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);

      hls.on(Events.MANIFEST_PARSED, () => {
        const levels = hls.levels.map((level, index) => ({
          index,
          label: level.height ? `${level.height}p` : `L${index + 1}`,
        }));
        setQualities(levels);
        setSwitchingSource(false);
        video.play().catch((e) => console.error('Auto-play blocked', e));
        setLoading(false);
      });

      hls.on(Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case ErrorTypes.NETWORK_ERROR:
              scheduleRecover('network', () => hls.startLoad());
              return;
            case ErrorTypes.MEDIA_ERROR:
              scheduleRecover('media', () => hls.recoverMediaError());
              return;
            default:
              failOrFailover(`Stream Error: ${data.type}`);
              return;
          }
        }

        if (
          data.details === ErrorDetails.BUFFER_STALLED_ERROR ||
          data.details === ErrorDetails.FRAG_LOAD_ERROR ||
          data.details === ErrorDetails.LEVEL_LOAD_ERROR
        ) {
          scheduleRecover(data.details, () => {
            hls.recoverMediaError();
            hls.startLoad();
          });
        }
      });

      const handleWaiting = () => {
        if (stallTimerRef.current) return;
        stallTimerRef.current = setTimeout(() => {
          stallTimerRef.current = null;
          if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            return;
          }
          scheduleRecover('stall', () => {
            hls.recoverMediaError();
            hls.startLoad();
          });
        }, recoveryConfig.stallThresholdMs);
      };

      video.addEventListener('waiting', handleWaiting);
      video.addEventListener('playing', handlePlaying);

      return () => {
        video.removeEventListener('enterpictureinpicture', handleEnterPip);
        video.removeEventListener('leavepictureinpicture', handleLeavePip);
        video.removeEventListener('ended', handleEnded);
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('playing', handlePlaying);
        clearRecoveryTimers();
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playbackUrl;
      const onMetadata = () => {
        setSwitchingSource(false);
        video.play().catch(console.error);
        setLoading(false);
      };
      const onNativeError = () => {
        scheduleRecover('native playback', () => {
          const currentTime = video.currentTime;
          video.load();
          video.currentTime = currentTime;
        });
      };
      const handleWaitingNative = () => {
        if (stallTimerRef.current) return;
        stallTimerRef.current = setTimeout(() => {
          stallTimerRef.current = null;
          if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            return;
          }
          onNativeError();
        }, recoveryConfig.stallThresholdMs);
      };

      video.addEventListener('loadedmetadata', onMetadata);
      video.addEventListener('error', onNativeError);
      video.addEventListener('waiting', handleWaitingNative);
      video.addEventListener('playing', handlePlaying);
      return () => {
        video.removeEventListener('loadedmetadata', onMetadata);
        video.removeEventListener('error', onNativeError);
        video.removeEventListener('waiting', handleWaitingNative);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('enterpictureinpicture', handleEnterPip);
        video.removeEventListener('leavepictureinpicture', handleLeavePip);
        video.removeEventListener('ended', handleEnded);
        clearRecoveryTimers();
      };
    }

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPip);
      video.removeEventListener('leavepictureinpicture', handleLeavePip);
      video.removeEventListener('ended', handleEnded);
      clearRecoveryTimers();
    };
  }, [activeStream.id, activeStream.playbackUrl, activeStream.url, autoPlayNext, hlsConfig, profileKey, recoveryConfig, usesSeparateAudio]);

  const togglePip = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.error('PiP failed', err);
    }
  };

  const handleQualityChange = (index: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setCurrentQuality(index);
      setShowQualityMenu(false);
    }
  };

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
          <div className="text-right">
            <h2 className="text-lg font-black text-white leading-tight uppercase tracking-tight">{event.name}</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{event.categoryName}</p>
          </div>
        </div>
      )}

      {isMinimized && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40 pointer-events-none hover:pointer-events-auto">
          <div className="flex gap-3 pointer-events-auto">
            <button onClick={onPrevious} className="p-2 bg-white/20 rounded-full text-white backdrop-blur">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>
            <button onClick={onExpand} className="p-2 bg-white rounded-full text-black">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            <button onClick={onNext} className="p-2 bg-white/20 rounded-full text-white backdrop-blur">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6zM16 6v12h2V6z" />
              </svg>
            </button>
            <button onClick={onClose} className="p-2 bg-red-600 rounded-full text-white">
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

      <div className={`relative bg-black flex-1 min-h-0 ${isMinimized ? '' : 'group'}`}>
        {loading && !isPipActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-20 backdrop-blur-sm">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
            {switchingSource && (
              <p className="mt-3 text-xs font-bold uppercase tracking-widest text-slate-300">
                Switching source...
              </p>
            )}
          </div>
        )}

        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-center p-4 z-20">
            <div>
              <p className="text-red-500 text-sm font-bold mb-2">{error}</p>
              <div className="flex gap-2 justify-center">
                <button onClick={onPrevious} className="text-xs text-white bg-slate-800 px-3 py-1 rounded">
                  Prev source
                </button>
                <button onClick={onNext} className="text-xs text-white bg-slate-800 px-3 py-1 rounded">
                  Next source
                </button>
                <button onClick={onClose} className="text-xs text-white underline ml-2">
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className={`absolute inset-0 w-full h-full object-contain ${isPipActive ? 'opacity-50' : ''}`}
              autoPlay
              playsInline
              muted={usesSeparateAudio ? true : isMuted}
            />
            <audio ref={audioRef} className="hidden" playsInline />

            {!isMinimized && (
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
                <div className="flex items-center justify-between max-w-6xl mx-auto">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                      <span className="text-[10px] font-black text-white uppercase tracking-widest">Live</span>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={toggleMute}
                        className="text-white hover:text-emerald-400 transition-colors"
                        title={isMuted ? 'Unmute' : 'Mute'}
                      >
                        {isMuted || volume === 0 ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          </svg>
                        )}
                      </button>
                      <div className="w-20 h-1.5 bg-white/20 rounded-full overflow-hidden relative">
                        <div
                          className="absolute left-0 top-0 bottom-0 bg-emerald-500 transition-all duration-200"
                          style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                        />
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={isMuted ? 0 : volume}
                          onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                          className="absolute inset-0 w-full opacity-0 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 relative">
                    <button
                      onClick={togglePip}
                      className={`p-2 rounded-md transition-colors ${isPipActive ? 'text-emerald-400 bg-emerald-600/10' : 'text-white hover:bg-white/10'}`}
                      title="Picture in Picture"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2h-2m-6 0l-3-3m0 0l3-3m-3 3h8" />
                      </svg>
                    </button>

                    {qualities.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setShowQualityMenu(!showQualityMenu)}
                          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-md text-[11px] font-black text-white transition-colors border border-white/10"
                        >
                          {currentQuality === -1 ? 'AUTO' : qualities[currentQuality].label}
                        </button>

                        {showQualityMenu && (
                          <div className="absolute bottom-full right-0 mb-2 w-32 bg-slate-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden z-40">
                            <button
                              onClick={() => handleQualityChange(-1)}
                              className={`w-full text-left px-3 py-2 text-xs font-bold transition-colors hover:bg-emerald-600/20 ${currentQuality === -1 ? 'text-emerald-400 bg-emerald-600/10' : 'text-slate-300'}`}
                            >
                              Auto
                            </button>
                            {qualities.map((q) => (
                              <button
                                key={q.index}
                                onClick={() => handleQualityChange(q.index)}
                                className={`w-full text-left px-3 py-2 text-xs font-bold transition-colors hover:bg-emerald-600/20 ${currentQuality === q.index ? 'text-emerald-400 bg-emerald-600/10' : 'text-slate-300'}`}
                              >
                                {q.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
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
                  {activeStream.status?.latencyMs != null && (
                    <span className="text-slate-500"> · {activeStream.status.latencyMs}ms</span>
                  )}
                </p>
                <SourceSwitcher
                  event={event}
                  activeStream={activeStream}
                  onSelectSource={onSelectSource}
                />
                <AudioSwitcher
                  event={event}
                  activeTrackId={activeAudioTrack?.id ?? null}
                  onSelectTrack={(track: StreamAudioTrack) => {
                    if (track.id !== activeAudioTrack?.id) {
                      setActiveAudioTrackId(track.id);
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <button
                onClick={toggleAutoPlay}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-bold transition-all border ${autoPlayNext ? 'bg-blue-600/10 border-blue-600/50 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
              >
                <span>Auto-play Next Source</span>
                <div className={`w-8 h-4 rounded-full relative transition-colors ${autoPlayNext ? 'bg-blue-600' : 'bg-slate-600'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${autoPlayNext ? 'left-4.5' : 'left-0.5'}`} />
                </div>
              </button>
              <PlayerNavButtons onPrevious={onPrevious} onNext={onNext} variant="footer" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const VideoPlayer: React.FC<VideoPlayerProps> = (props) => {
  const { event, activeStream } = props;

  if (activeStream.type === 'youtube') {
    if (!activeStream.channelId || !activeStream.status?.reachable) {
      return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <p className="text-xl font-black text-white mb-2">Not live</p>
            <p className="text-slate-400 mb-6">
              {event.name} has no live YouTube source right now.
            </p>
            <button
              onClick={props.onClose}
              className="bg-white text-black px-6 py-2 rounded font-bold hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      );
    }
    return <YouTubePlayer {...props} />;
  }

  return <HlsVideoPlayer {...props} />;
};

export default VideoPlayer;
