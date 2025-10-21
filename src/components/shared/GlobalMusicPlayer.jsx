import React from 'react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { trackEvent } from '../../utils/analytics';
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
    if (!isPlaying) {
      handlePlayPause();
    }
  };

  const handleDismissPrompt = (e) => {
    e.stopPropagation();
    setShowClickPrompt(false);
  };

  const handleDownload = () => {
    console.log('💾 Download button clicked!', currentTrack.title);
    try {
      // Track download event
      trackEvent('Music Player', 'download_song', currentTrack.title);

      const filename = `${currentTrack.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp3`;
      
      // Use XMLHttpRequest - works better for cross-origin downloads than fetch
      const xhr = new XMLHttpRequest();
      xhr.open('GET', currentTrack.url, true);
      xhr.responseType = 'blob';
      
      xhr.onload = function() {
        if (xhr.status === 200) {
          const blob = xhr.response;
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          console.log('✅ Download initiated via XHR!');
        } else {
          console.warn('XHR failed, trying direct link');
          // Fallback to direct link
          const link = document.createElement('a');
          link.href = currentTrack.url;
          link.download = filename;
          link.click();
        }
      };
      
      xhr.onerror = function() {
        console.warn('XHR error, trying direct link');
        // Final fallback
        const link = document.createElement('a');
        link.href = currentTrack.url;
        link.download = filename;
        link.click();
      };
      
      xhr.send();
    } catch (error) {
      console.error('❌ Error downloading track:', error);
      alert('Failed to download track. Please try again.');
    }
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

            <div className="download-section">
              <button 
                className="download-btn"
                onClick={handleDownload}
                aria-label="Download current track"
                title="Download this track"
              >
                💾
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalMusicPlayer;

