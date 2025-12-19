import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { PLAYLIST } from '../constants/musicPlaylist';
import { trackEvent } from '../utils/analytics';

const MusicPlayerContext = createContext();

export const useMusicPlayer = () => {
  const context = useContext(MusicPlayerContext);
  if (!context) {
    throw new Error('useMusicPlayer must be used within MusicPlayerProvider');
  }
  return context;
};

export const MusicPlayerProvider = ({ children }) => {
  // isEnabled should NOT persist - only enable when coming from Halloween page
  const [isEnabled, setIsEnabled] = useState(false);
  
  // Other state persists across navigation within the session
  const [currentTrackIndex, setCurrentTrackIndex] = useState(() => {
    const saved = sessionStorage.getItem('musicPlayerTrackIndex');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [isPlaying, setIsPlaying] = useState(() => {
    return sessionStorage.getItem('musicPlayerPlaying') === 'true';
  });
  const [isExpanded, setIsExpanded] = useState(() => {
    return sessionStorage.getItem('musicPlayerExpanded') === 'true';
  });
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showClickPrompt, setShowClickPrompt] = useState(() => {
    const saved = sessionStorage.getItem('musicPlayerShowPrompt');
    return saved === null ? true : saved === 'true';
  });
  const audioRef = useRef(null);
  const shouldAutoPlayNextRef = useRef(false); // Track if next track should auto-play
  const savePositionIntervalRef = useRef(null); // Track interval for saving playback position

  // Persist state to sessionStorage (except isEnabled)
  // Don't persist isEnabled - it should only be true during Halloween session

  useEffect(() => {
    sessionStorage.setItem('musicPlayerTrackIndex', currentTrackIndex.toString());
  }, [currentTrackIndex]);

  useEffect(() => {
    sessionStorage.setItem('musicPlayerPlaying', isPlaying.toString());
  }, [isPlaying]);

  useEffect(() => {
    sessionStorage.setItem('musicPlayerExpanded', isExpanded.toString());
  }, [isExpanded]);

  useEffect(() => {
    sessionStorage.setItem('musicPlayerShowPrompt', showClickPrompt.toString());
  }, [showClickPrompt]);

  // Save playback position every 5 seconds while playing
  useEffect(() => {
    if (isPlaying && audioRef.current) {
      const savePosition = () => {
        const audio = audioRef.current;
        // Only save if position is greater than 0 (don't save at start)
        if (audio && !isNaN(audio.currentTime) && audio.currentTime > 0.5) {
          const positionData = {
            trackIndex: currentTrackIndex,
            position: audio.currentTime
          };
          sessionStorage.setItem('musicPlayerPosition', JSON.stringify(positionData));
        }
      };

      // Start interval to save every 5 seconds (don't save immediately to avoid saving position 0)
      savePositionIntervalRef.current = setInterval(savePosition, 5000);

      return () => {
        if (savePositionIntervalRef.current) {
          clearInterval(savePositionIntervalRef.current);
          savePositionIntervalRef.current = null;
        }
      };
    } else {
      // Clear interval when not playing
      if (savePositionIntervalRef.current) {
        clearInterval(savePositionIntervalRef.current);
        savePositionIntervalRef.current = null;
      }
    }
  }, [isPlaying, currentTrackIndex]);

  // Monitor audio element to sync play/pause state with actual playback
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

  const currentTrack = PLAYLIST[currentTrackIndex];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      
      // Reset playing state on page load since browser will block auto-play
      // Position will be restored when user clicks play
      if (audio.paused && isPlaying) {
        setIsPlaying(false);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      // When track ends, mark that we should auto-play the next track
      shouldAutoPlayNextRef.current = true;
      console.log('🎵 Track ended, will auto-play next track');
      // Clear saved position when track ends
      sessionStorage.removeItem('musicPlayerPosition');
      const nextIndex = (currentTrackIndex + 1) % PLAYLIST.length;
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
      console.log('🎵 Track changed, auto-playing next track');
      shouldAutoPlayNextRef.current = false; // Reset flag
      
      // Small delay to ensure audio element is ready with new source
      setTimeout(() => {
        audioRef.current?.play()
          .then(() => {
            console.log('🎵 Next track auto-play succeeded');
            setIsPlaying(true);
            // Track song play when auto-playing after track ends
            trackEvent('Music Player', 'play_song', PLAYLIST[currentTrackIndex].title);
          })
          .catch((err) => {
            console.log('🎵 Failed to auto-play next track:', err);
            setIsPlaying(false);
          });
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
        // Before playing, check if we need to restore position
        const savedPositionData = sessionStorage.getItem('musicPlayerPosition');
        
        if (savedPositionData && audio.currentTime === 0) {
          try {
            const { trackIndex, position } = JSON.parse(savedPositionData);
            // Only restore if it's for the current track and position is valid
            if (trackIndex === currentTrackIndex && !isNaN(position) && position > 0) {
              audio.currentTime = position;
              console.log('🎵 Resumed from:', position.toFixed(1) + 's');
            }
          } catch (e) {
            console.log('🎵 Failed to parse saved position');
          }
        }
        
        await audio.play();
        setIsPlaying(true);
        // Track song play in analytics
        trackEvent('Music Player', 'play_song', currentTrack.title);
      }
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  const handleNext = () => {
    const wasPlaying = isPlaying;
    // Clear saved position when manually changing tracks
    sessionStorage.removeItem('musicPlayerPosition');
    const nextIndex = (currentTrackIndex + 1) % PLAYLIST.length;
    setCurrentTrackIndex(nextIndex);
    if (wasPlaying) {
      setTimeout(() => {
        audioRef.current?.play().then(() => {
          setIsPlaying(true);
          // Track song play when skipping to next
          trackEvent('Music Player', 'play_song', PLAYLIST[nextIndex].title);
        }).catch(() => setIsPlaying(false));
      }, 100);
    }
  };

  const handlePrevious = () => {
    const wasPlaying = isPlaying;
    // Clear saved position when manually changing tracks
    sessionStorage.removeItem('musicPlayerPosition');
    const prevIndex = (currentTrackIndex - 1 + PLAYLIST.length) % PLAYLIST.length;
    setCurrentTrackIndex(prevIndex);
    if (wasPlaying) {
      setTimeout(() => {
        audioRef.current?.play().then(() => {
          setIsPlaying(true);
          // Track song play when skipping to previous
          trackEvent('Music Player', 'play_song', PLAYLIST[prevIndex].title);
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

  const enable = async (options = {}) => {
    const { autoPlay = false, expand = false } = options;
    
    setIsEnabled(true);
    
    if (expand) {
      setIsExpanded(true);
      setShowClickPrompt(false);
    }
    
    // Auto-play when enabled and requested
    if (autoPlay) {
      const audio = audioRef.current;
      if (audio && !isPlaying) {
        try {
          await audio.play();
          setIsPlaying(true);
          setShowClickPrompt(false);
          // Track song play when enabling player
          trackEvent('Music Player', 'play_song', currentTrack.title);
        } catch (error) {
          console.log('Auto-play prevented:', error);
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
    // Clear interval if running
    if (savePositionIntervalRef.current) {
      clearInterval(savePositionIntervalRef.current);
      savePositionIntervalRef.current = null;
    }
    // Clear all session storage when disabling
    sessionStorage.removeItem('musicPlayerTrackIndex');
    sessionStorage.removeItem('musicPlayerPlaying');
    sessionStorage.removeItem('musicPlayerExpanded');
    sessionStorage.removeItem('musicPlayerShowPrompt');
    sessionStorage.removeItem('musicPlayerPosition');
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
    totalTracks: PLAYLIST.length
  };

  return (
    <MusicPlayerContext.Provider value={value}>
      {/* Global audio element - only render when enabled to avoid preloading when not in use */}
      {isEnabled && <audio ref={audioRef} src={currentTrack.url} preload="metadata" />}
      {children}
    </MusicPlayerContext.Provider>
  );
};

MusicPlayerProvider.propTypes = {
  children: PropTypes.node.isRequired
};

