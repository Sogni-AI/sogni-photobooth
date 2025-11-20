import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { WINTER_PLAYLIST } from '../constants/winterMusicPlaylist';
import { trackEvent } from '../utils/analytics';

const WinterMusicPlayerContext = createContext();

export const useWinterMusicPlayer = () => {
  const context = useContext(WinterMusicPlayerContext);
  if (!context) {
    throw new Error('useWinterMusicPlayer must be used within WinterMusicPlayerProvider');
  }
  return context;
};

export const WinterMusicPlayerProvider = ({ children }) => {
  // isEnabled should NOT persist - only enable when coming from Winter page
  const [isEnabled, setIsEnabled] = useState(false);

  // Other state persists across navigation within the session
  const [currentTrackIndex, setCurrentTrackIndex] = useState(() => {
    const saved = sessionStorage.getItem('winterMusicPlayerTrackIndex');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [isPlaying, setIsPlaying] = useState(() => {
    return sessionStorage.getItem('winterMusicPlayerPlaying') === 'true';
  });
  const [isExpanded, setIsExpanded] = useState(() => {
    return sessionStorage.getItem('winterMusicPlayerExpanded') === 'true';
  });
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showClickPrompt, setShowClickPrompt] = useState(() => {
    const saved = sessionStorage.getItem('winterMusicPlayerShowPrompt');
    return saved === null ? true : saved === 'true';
  });
  const audioRef = useRef(null);
  const shouldAutoPlayNextRef = useRef(false);
  const savePositionIntervalRef = useRef(null);

  // Persist state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('winterMusicPlayerTrackIndex', currentTrackIndex.toString());
  }, [currentTrackIndex]);

  useEffect(() => {
    sessionStorage.setItem('winterMusicPlayerExpanded', isExpanded.toString());
  }, [isExpanded]);

  useEffect(() => {
    sessionStorage.setItem('winterMusicPlayerShowPrompt', showClickPrompt.toString());
  }, [showClickPrompt]);

  // Save playback position every 5 seconds while playing
  useEffect(() => {
    if (isPlaying && audioRef.current) {
      const savePosition = () => {
        const audio = audioRef.current;
        if (audio && !isNaN(audio.currentTime) && audio.currentTime > 0.5) {
          const positionData = {
            trackIndex: currentTrackIndex,
            position: audio.currentTime
          };
          sessionStorage.setItem('winterMusicPlayerPosition', JSON.stringify(positionData));
        }
      };

      savePositionIntervalRef.current = setInterval(savePosition, 5000);

      return () => {
        if (savePositionIntervalRef.current) {
          clearInterval(savePositionIntervalRef.current);
          savePositionIntervalRef.current = null;
        }
      };
    } else {
      if (savePositionIntervalRef.current) {
        clearInterval(savePositionIntervalRef.current);
        savePositionIntervalRef.current = null;
      }
    }
  }, [isPlaying, currentTrackIndex]);

  // Monitor audio element to sync play/pause state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, []);

  const currentTrack = WINTER_PLAYLIST[currentTrackIndex];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);

      if (audio.paused && isPlaying) {
        setIsPlaying(false);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      shouldAutoPlayNextRef.current = true;
      console.log('❄️ Track ended, will auto-play next track');
      sessionStorage.removeItem('winterMusicPlayerPosition');
      const nextIndex = (currentTrackIndex + 1) % WINTER_PLAYLIST.length;
      setCurrentTrackIndex(nextIndex);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentTrackIndex, isEnabled, isPlaying]);

  // Auto-play new track when track changes if auto-play flag is set
  useEffect(() => {
    if (shouldAutoPlayNextRef.current && audioRef.current) {
      setTimeout(() => {
        audioRef.current?.play().then(() => {
          setIsPlaying(true);
          trackEvent('Winter Music Player', 'play_song', WINTER_PLAYLIST[currentTrackIndex].title);
        }).catch(() => {
          setIsPlaying(false);
        });
        shouldAutoPlayNextRef.current = false;
      }, 100);
    }
  }, [currentTrackIndex]);

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        const savedPositionData = sessionStorage.getItem('winterMusicPlayerPosition');

        if (savedPositionData && audio.currentTime === 0) {
          try {
            const { trackIndex, position } = JSON.parse(savedPositionData);
            if (trackIndex === currentTrackIndex && !isNaN(position) && position > 0) {
              audio.currentTime = position;
              console.log('❄️ Resumed from:', position.toFixed(1) + 's');
            }
          } catch (e) {
            console.log('❄️ Failed to parse saved position');
          }
        }

        await audio.play();
        setIsPlaying(true);
        trackEvent('Winter Music Player', 'play_song', currentTrack.title);
      }
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  const handleNext = () => {
    const wasPlaying = isPlaying;
    sessionStorage.removeItem('winterMusicPlayerPosition');
    const nextIndex = (currentTrackIndex + 1) % WINTER_PLAYLIST.length;
    setCurrentTrackIndex(nextIndex);
    if (wasPlaying) {
      setTimeout(() => {
        audioRef.current?.play().then(() => {
          setIsPlaying(true);
          trackEvent('Winter Music Player', 'play_song', WINTER_PLAYLIST[nextIndex].title);
        }).catch(() => setIsPlaying(false));
      }, 100);
    }
  };

  const handlePrevious = () => {
    const wasPlaying = isPlaying;
    sessionStorage.removeItem('winterMusicPlayerPosition');
    const prevIndex = (currentTrackIndex - 1 + WINTER_PLAYLIST.length) % WINTER_PLAYLIST.length;
    setCurrentTrackIndex(prevIndex);
    if (wasPlaying) {
      setTimeout(() => {
        audioRef.current?.play().then(() => {
          setIsPlaying(true);
          trackEvent('Winter Music Player', 'play_song', WINTER_PLAYLIST[prevIndex].title);
        }).catch(() => setIsPlaying(false));
      }, 100);
    }
  };

  const handleProgressClick = (e) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const enable = () => {
    setIsEnabled(true);
    const audio = audioRef.current;
    if (audio) {
      const savedPositionData = sessionStorage.getItem('winterMusicPlayerPosition');
      if (savedPositionData) {
        try {
          const { trackIndex, position } = JSON.parse(savedPositionData);
          if (trackIndex === currentTrackIndex && !isNaN(position) && position > 0) {
            audio.currentTime = position;
          }
        } catch (e) {
          console.log('❄️ Failed to restore position on enable');
        }
      }
    }
  };

  const disable = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    setIsEnabled(false);
    setIsPlaying(false);
    if (savePositionIntervalRef.current) {
      clearInterval(savePositionIntervalRef.current);
      savePositionIntervalRef.current = null;
    }
    // Clear all session storage when disabling
    sessionStorage.removeItem('winterMusicPlayerTrackIndex');
    sessionStorage.removeItem('winterMusicPlayerPlaying');
    sessionStorage.removeItem('winterMusicPlayerExpanded');
    sessionStorage.removeItem('winterMusicPlayerShowPrompt');
    sessionStorage.removeItem('winterMusicPlayerPosition');
  };

  const value = {
    isEnabled,
    enable,
    disable,
    currentTrack,
    currentTrackIndex,
    isPlaying,
    isExpanded,
    setIsExpanded,
    duration,
    currentTime,
    showClickPrompt,
    setShowClickPrompt,
    handlePlayPause,
    handleNext,
    handlePrevious,
    handleProgressClick,
    audioRef,
    totalTracks: WINTER_PLAYLIST.length
  };

  return (
    <WinterMusicPlayerContext.Provider value={value}>
      {/* Global audio element */}
      <audio ref={audioRef} src={currentTrack.url} preload="metadata" />
      {children}
    </WinterMusicPlayerContext.Provider>
  );
};

WinterMusicPlayerProvider.propTypes = {
  children: PropTypes.node.isRequired
};

