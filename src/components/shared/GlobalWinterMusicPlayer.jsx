import React, { useState } from 'react';
import { useWinterMusicPlayer } from '../../context/WinterMusicPlayerContext';
import { trackEvent } from '../../utils/analytics';
import '../../styles/events/WinterMusicPlayer.css';

const GlobalWinterMusicPlayer = () => {
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
    totalTracks,
    audioRef
  } = useWinterMusicPlayer();

  const [playerDismissed, setPlayerDismissed] = useState(false);

  if (!isEnabled || playerDismissed) {
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
    if (!isPlaying) {
      handlePlayPause();
    }
  };

  const handleDismissPlayer = (e) => {
    e.stopPropagation();
    setPlayerDismissed(true);
    // Pause music if playing
    if (isPlaying && audioRef?.current) {
      audioRef.current.pause();
    }
  };

  const handleDownload = async () => {
    console.log('💾 Download button clicked!', currentTrack.title);
    try {
      // Track download event
      trackEvent('Winter Music Player', 'download_song', currentTrack.title);

      const filename = `${currentTrack.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp3`;

      // Try using fetch first
      try {
        const response = await fetch(currentTrack.url);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        console.log('✅ Download initiated via fetch!');
      } catch (fetchError) {
        console.warn('Fetch failed, trying direct download with target:', fetchError);
        // If fetch fails, try opening in new tab with download attribute
        const link = document.createElement('a');
        link.href = currentTrack.url;
        link.download = filename;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('❌ Error downloading track:', error);
      // Last resort - open in new window
      window.open(currentTrack.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="winter-music-section">
      <div className={`winter-music-player ${isExpanded ? 'expanded' : 'minimized'}`}>
        {!isExpanded ? (
          // Minimized state
          <div className="minimized-container">
            <div
              className="music-player-minimized"
              onClick={handleMinimizedClick}
              title="Click to expand music player"
            >
              <button
                className="music-player-dismiss-btn"
                onClick={handleDismissPlayer}
                aria-label="Dismiss music player"
              >
                ✕
              </button>
              <span className="mini-icon">{isPlaying ? '🎵' : '❄️'}</span>
            </div>
            {showClickPrompt && (
              <div
                className="click-me-prompt"
                onClick={handleMinimizedClick}
              >
                <span className="prompt-text">Click me!</span>
              </div>
            )}
          </div>
        ) : (
          // Expanded state
          <div className="music-player-card">
            <div className="player-header">
              <span className="music-icon">🎵</span>
              <h3>Winter Beats</h3>
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
    </div>
  );
};

export default GlobalWinterMusicPlayer;

