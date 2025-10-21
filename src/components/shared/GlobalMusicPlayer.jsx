import React from 'react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import '../../styles/events/HalloweenMusicPlayer.css';

const GlobalMusicPlayer = () => {
  const {
    isEnabled,
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
    totalTracks
  } = useMusicPlayer();

  if (!isEnabled) {
    return null;
  }

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
    <div className="halloween-music-section">
      <div className={`halloween-music-player ${isExpanded ? 'expanded' : 'minimized'}`}>
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
              <div className="track-number">Track {currentTrackIndex + 1} of {totalTracks}</div>
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
    </div>
  );
};

export default GlobalMusicPlayer;

