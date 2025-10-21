import React, { useState, useRef, useEffect } from 'react';
import '../../styles/events/HalloweenMusicPlayer.css';
import { PLAYLIST } from '../../constants/musicPlaylist';

const HalloweenMusicPlayer = () => {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showClickPrompt, setShowClickPrompt] = useState(true);
  const audioRef = useRef(null);

  const currentTrack = PLAYLIST[currentTrackIndex];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      handleNext();
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentTrackIndex]);

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  const handleNext = () => {
    const wasPlaying = isPlaying;
    setCurrentTrackIndex((prev) => (prev + 1) % PLAYLIST.length);
    // Auto-play next track if currently playing
    if (wasPlaying) {
      setTimeout(() => {
        audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }, 100);
    }
  };

  const handlePrevious = () => {
    const wasPlaying = isPlaying;
    setCurrentTrackIndex((prev) => (prev - 1 + PLAYLIST.length) % PLAYLIST.length);
    // Auto-play previous track if currently playing
    if (wasPlaying) {
      setTimeout(() => {
        audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
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
      } catch (error) {
        console.log('Auto-play prevented:', error);
      }
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
            <h3>Sogni Halloween Beats</h3>
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
              ⏮️
            </button>
            
            <button 
              className="control-btn play-pause-btn"
              onClick={handlePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸️' : '▶️'}
            </button>
            
            <button 
              className="control-btn next-btn"
              onClick={handleNext}
              aria-label="Next track"
            >
              ⏭️
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HalloweenMusicPlayer;

