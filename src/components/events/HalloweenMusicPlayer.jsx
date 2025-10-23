import React, { useState, useRef, useEffect } from 'react';
import '../../styles/events/HalloweenMusicPlayer.css';
import { PLAYLIST } from '../../constants/musicPlaylist';
import { trackEvent } from '../../utils/analytics';

const HalloweenMusicPlayer = () => {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(() => {
    const saved = sessionStorage.getItem('halloweenMusicPlayerTrackIndex');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [isPlaying, setIsPlaying] = useState(() => {
    return sessionStorage.getItem('halloweenMusicPlayerPlaying') === 'true';
  });
  const [isExpanded, setIsExpanded] = useState(() => {
    return sessionStorage.getItem('halloweenMusicPlayerExpanded') === 'true';
  });
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showClickPrompt, setShowClickPrompt] = useState(() => {
    const saved = sessionStorage.getItem('halloweenMusicPlayerShowPrompt');
    return saved === null ? true : saved === 'true';
  });
  const audioRef = useRef(null);
  const savePositionIntervalRef = useRef(null); // Track interval for saving playback position

  const currentTrack = PLAYLIST[currentTrackIndex];

  // Persist state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('halloweenMusicPlayerTrackIndex', currentTrackIndex.toString());
  }, [currentTrackIndex]);

  useEffect(() => {
    sessionStorage.setItem('halloweenMusicPlayerPlaying', isPlaying.toString());
  }, [isPlaying]);

  useEffect(() => {
    sessionStorage.setItem('halloweenMusicPlayerExpanded', isExpanded.toString());
  }, [isExpanded]);

  useEffect(() => {
    sessionStorage.setItem('halloweenMusicPlayerShowPrompt', showClickPrompt.toString());
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
          sessionStorage.setItem('halloweenMusicPlayerPosition', JSON.stringify(positionData));
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (savePositionIntervalRef.current) {
        clearInterval(savePositionIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      
      // Reset playing state on page load since browser will block auto-play
      // Position will be restored when user clicks play
      if (audio.paused && isPlaying) {
        console.log('🎃 Audio is paused on load - resetting UI to show play button');
        setIsPlaying(false);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      // Clear saved position when track ends
      sessionStorage.removeItem('halloweenMusicPlayerPosition');
      const nextIndex = (currentTrackIndex + 1) % PLAYLIST.length;
      setCurrentTrackIndex(nextIndex);
      // Auto-play next track and track it
      setTimeout(() => {
        audioRef.current?.play().then(() => {
          setIsPlaying(true);
          // Track song play when auto-playing next track
          trackEvent('Music Player', 'play_song', PLAYLIST[nextIndex].title);
        }).catch(() => setIsPlaying(false));
      }, 100);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentTrackIndex, isPlaying]);

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        // Before playing, check if we need to restore position
        const savedPositionData = sessionStorage.getItem('halloweenMusicPlayerPosition');
        if (savedPositionData && audio.currentTime === 0) {
          try {
            const { trackIndex, position } = JSON.parse(savedPositionData);
            // Only restore if it's for the current track and position is valid
            if (trackIndex === currentTrackIndex && !isNaN(position) && position > 0) {
              // Duration might not be loaded yet, so don't check it here
              audio.currentTime = position;
              console.log('🎃 Restored playback position on play:', position.toFixed(2), 'for track', trackIndex);
            }
          } catch (e) {
            console.log('🎃 Failed to parse saved position data:', e);
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
    sessionStorage.removeItem('halloweenMusicPlayerPosition');
    const nextIndex = (currentTrackIndex + 1) % PLAYLIST.length;
    setCurrentTrackIndex(nextIndex);
    // Auto-play next track if currently playing
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
    sessionStorage.removeItem('halloweenMusicPlayerPosition');
    const prevIndex = (currentTrackIndex - 1 + PLAYLIST.length) % PLAYLIST.length;
    setCurrentTrackIndex(prevIndex);
    // Auto-play previous track if currently playing
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

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

  const handleMinimizedClick = async () => {
    setIsExpanded(true);
    setShowClickPrompt(false);
    
    // Auto-play when clicked
    const audio = audioRef.current;
    if (audio && !isPlaying) {
      try {
        await audio.play();
        setIsPlaying(true);
        // Track song play when expanding player
        trackEvent('Music Player', 'play_song', currentTrack.title);
      } catch (error) {
        console.log('Auto-play prevented:', error);
      }
    }
  };

  const handleDownload = async () => {
    try {
      // Track download event
      trackEvent('Music Player', 'download_song', currentTrack.title);

      // Fetch the audio file
      const response = await fetch(currentTrack.url);
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentTrack.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading track:', error);
    }
  };

  const handleDismissPrompt = (e) => {
    e.stopPropagation();
    setShowClickPrompt(false);
  };

  return (
    <div className={`halloween-music-player ${isExpanded ? 'expanded' : 'minimized'}`}>
      <audio ref={audioRef} src={currentTrack.url} preload="metadata" />
      
      {!isExpanded ? (
        // Minimized state
        <div className="minimized-container">
          <div 
            className="music-player-minimized"
            onClick={handleMinimizedClick}
            title="Click to expand music player"
          >
            <span className="mini-icon">{isPlaying ? '🎵' : '🎃'}</span>
          </div>
          {showClickPrompt && (
            <div 
              className="click-me-prompt"
              onClick={handleMinimizedClick}
            >
              <span className="prompt-text">Click me!</span>
              <button 
                className="dismiss-prompt-btn"
                onClick={handleDismissPrompt}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}
        </div>
      ) : (
        // Expanded state
        <div className="music-player-card">
          <div className="player-header">
            <span className="music-icon">🎵</span>
            <h3>Halloween Beats</h3>
            <button 
              className="minimize-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
              aria-label="Minimize"
            >
              −
            </button>
          </div>

          <div className="track-info">
            <div className="track-number">Track {currentTrackIndex + 1} of {PLAYLIST.length}</div>
            <div className="track-title">{currentTrack.title}</div>
          </div>

          <div className="progress-bar-container" onClick={handleProgressClick}>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
            <div className="time-display">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="player-controls">
            <button 
              className="control-btn previous-btn"
              onClick={handlePrevious}
              aria-label="Previous track"
            >
              ◄
            </button>
            
            <button 
              className="control-btn play-pause-btn"
              onClick={handlePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '❚❚' : '►'}
            </button>
            
            <button 
              className="control-btn next-btn"
              onClick={handleNext}
              aria-label="Next track"
            >
              ►
            </button>
          </div>

          <div className="download-section">
            <button 
              className="download-btn"
              onClick={handleDownload}
              aria-label="Download current track"
              title="Download this track"
            >
              💾 Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HalloweenMusicPlayer;

