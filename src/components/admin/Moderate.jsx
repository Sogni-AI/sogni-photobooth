import React, { useState, useEffect } from 'react';
import { useSogniAuth } from '../../services/sogniAuth';
import LoginModal from '../auth/LoginModal';
import { AuthStatus } from '../auth/AuthStatus';
import { isModerationEnabled } from '../../config/env';
import '../../styles/admin/Moderate.css';

const CORRECT_PASSWORD = import.meta.env.VITE_MODERATION_PASSWORD || '';
const AUTH_KEY = 'moderation_auth';

const Moderate = () => {
  const { isAuthenticated: isSogniAuthenticated, user } = useSogniAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState('login');
  
  // Check if moderation is enabled
  const moderationEnabled = isModerationEnabled();

  const [contestId, setContestId] = useState('gallery-submissions');
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedPrompts, setExpandedPrompts] = useState(new Set());
  const limit = 20;

  // Check if already authenticated on mount
  useEffect(() => {
    const authData = localStorage.getItem(AUTH_KEY);
    if (authData) {
      try {
        const { timestamp } = JSON.parse(authData);
        // Session expires after 24 hours
        const hoursSinceAuth = (Date.now() - timestamp) / (1000 * 60 * 60);
        if (hoursSinceAuth < 24) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem(AUTH_KEY);
        }
      } catch (e) {
        localStorage.removeItem(AUTH_KEY);
      }
    }
  }, []);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordInput === CORRECT_PASSWORD) {
      setIsAuthenticated(true);
      setPasswordError('');
      localStorage.setItem(AUTH_KEY, JSON.stringify({ timestamp: Date.now() }));
    } else {
      setPasswordError('Incorrect password. Try again.');
      setPasswordInput('');
    }
  };

  // Fetch contest entries
  const fetchEntries = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/contest/${contestId}/entries?page=${page}&limit=${limit}&sortBy=timestamp&order=desc`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch contest entries');
      }

      const data = await response.json();

      if (data.success) {
        setEntries(data.entries || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error('Error fetching entries:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch contest stats
  const fetchStats = async () => {
    try {
      const response = await fetch(`/api/contest/${contestId}/stats`);

      if (!response.ok) {
        throw new Error('Failed to fetch contest stats');
      }

      const data = await response.json();

      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  // Load entries and stats (only when authenticated)
  useEffect(() => {
    if (isAuthenticated) {
      fetchEntries();
      fetchStats();
    }
  }, [contestId, page, isAuthenticated]);

  // Close login modal when user successfully authenticates
  useEffect(() => {
    if (isSogniAuthenticated && showLoginModal) {
      console.log('User authenticated for moderation, closing login modal');
      setShowLoginModal(false);
    }
  }, [isSogniAuthenticated, showLoginModal]);

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const togglePromptExpansion = (entryId) => {
    setExpandedPrompts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  };

  const handleRefresh = () => {
    fetchEntries();
    fetchStats();
  };

  const handleDelete = async (entryId) => {
    if (!confirm('Are you sure you want to delete this contest entry?')) {
      return;
    }

    try {
      const response = await fetch(`/api/contest/${contestId}/entry/${entryId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete entry');
      }

      const data = await response.json();

      if (data.success) {
        // Refresh the list
        fetchEntries();
        fetchStats();
      }
    } catch (err) {
      console.error('Error deleting entry:', err);
      alert('Failed to delete entry: ' + err.message);
    }
  };

  const handleModerationChange = async (entryId, newStatus) => {
    // Check if user is logged in via Sogni auth
    if (!isSogniAuthenticated || !user?.username) {
      console.log('User not authenticated for moderation, showing login modal');
      setShowLoginModal(true);
      return;
    }

    console.log(`Moderating entry ${entryId} to ${newStatus} by ${user.username}`);

    try {
      const response = await fetch(`/api/contest/${contestId}/entry/${entryId}/moderation`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          moderationStatus: newStatus,
          moderatedBy: user.username
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update moderation status');
      }

      const data = await response.json();

      if (data.success) {
        // Update the local state
        setEntries(prevEntries =>
          prevEntries.map(entry =>
            entry.id === entryId ? { ...entry, moderationStatus: newStatus } : entry
          )
        );
      }
    } catch (err) {
      console.error('Error updating moderation status:', err);
      alert('Failed to update moderation status: ' + err.message);
    }
  };

  // Show password modal if not authenticated
  if (!isAuthenticated) {
  return (
    <div className="moderation-page">
      <div className="password-modal-overlay">
        <div className="password-modal">
          <h2>🔐 Access Restricted</h2>
          <p>Please enter the password to view moderation panel.</p>
            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter password"
                className="password-input"
                autoFocus
              />
              {passwordError && (
                <div className="password-error">{passwordError}</div>
              )}
              <button type="submit" className="password-submit-btn">
                Submit
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="moderation-page">
      {/* Auth Status Widget */}
      <div className="moderation-page-auth-status">
        <AuthStatus />
      </div>

      <header className="contest-results-header">
        <h1>{contestId === 'gallery-submissions' ? '🖼️ Gallery Submissions' : '🎃 Contest Results'}</h1>
        <div className="header-controls">
          {!moderationEnabled && (
            <div style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              background: 'rgba(254, 202, 87, 0.2)',
              border: '2px solid #feca57',
              color: '#feca57',
              fontSize: '0.9rem',
              fontWeight: '600'
            }}>
              ⚠️ Moderation Disabled
            </div>
          )}
          <select
            value={contestId}
            onChange={(e) => {
              setContestId(e.target.value);
              setPage(1);
            }}
            className="contest-select"
          >
            <option value="halloween">Halloween Contest</option>
            <option value="gallery-submissions">Gallery Submissions</option>
          </select>
          <button onClick={handleRefresh} className="refresh-btn">
            🔄 Refresh
          </button>
        </div>
      </header>

      {/* Stats Section */}
      {stats && (
        <div className="contest-stats">
          <div className="stat-card">
            <div className="stat-label">Total Entries</div>
            <div className="stat-value">{stats.totalEntries}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Unique Users</div>
            <div className="stat-value">{stats.uniqueUsers}</div>
          </div>
          {stats.oldestEntry && (
            <div className="stat-card">
              <div className="stat-label">First Entry</div>
              <div className="stat-value-small">
                {formatDate(stats.oldestEntry)}
              </div>
            </div>
          )}
          {stats.newestEntry && (
            <div className="stat-card">
              <div className="stat-label">Latest Entry</div>
              <div className="stat-value-small">
                {formatDate(stats.newestEntry)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-message">
          Loading contest entries...
        </div>
      )}

      {/* Entries List */}
      {!loading && entries.length > 0 && (
        <div className="entries-container">
          <div className="entries-header">
            <h2>Entries ({total} total)</h2>
            <div className="pagination-info">
              Page {page} of {totalPages}
            </div>
          </div>

          <div className="entries-grid">
            {entries.map((entry) => (
              <div key={entry.id} className="entry-card">
                {(entry.videoUrl || entry.imageUrl) && (
                  <div className="entry-image">
                    {entry.videoUrl ? (
                      <video 
                        src={entry.videoUrl} 
                        controls 
                        loop 
                        muted 
                        playsInline
                        poster={entry.imageUrl}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          background: '#000'
                        }}
                      />
                    ) : (
                      <img src={entry.imageUrl} alt="Contest entry" />
                    )}
                  </div>
                )}
                <div className="entry-details">
                  {/* For gallery submissions, show the style name. For other contests, show prompt */}
                  {contestId === 'gallery-submissions' ? (
                    <div className="entry-style">
                      <strong>Style:</strong> {entry.prompt}
                    </div>
                  ) : (
                    <div 
                      className={`entry-prompt ${expandedPrompts.has(entry.id) ? 'expanded' : 'collapsed'}`}
                      onClick={() => togglePromptExpansion(entry.id)}
                      title="Click to expand/collapse"
                    >
                      <strong>Prompt:</strong>
                      <span 
                        className="prompt-text selectable"
                        onClick={(e) => {
                          if (expandedPrompts.has(entry.id)) {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {entry.prompt}
                      </span>
                    </div>
                  )}
                  {moderationEnabled && (
                    <div className="entry-moderation">
                      <div className="moderation-info">
                        <strong>Moderation Status:</strong>
                        <span className={`status-badge status-${(entry.moderationStatus || 'PENDING').toLowerCase()}`}>
                          {entry.moderationStatus || 'PENDING'}
                        </span>
                      </div>
                      <div className="moderation-actions">
                        <button
                          onClick={() => handleModerationChange(entry.id, 'APPROVED')}
                          className="quick-action-btn approve-btn"
                          disabled={entry.moderationStatus === 'APPROVED'}
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => handleModerationChange(entry.id, 'REJECTED')}
                          className="quick-action-btn reject-btn"
                          disabled={entry.moderationStatus === 'REJECTED'}
                        >
                          ✗ Reject
                        </button>
                        <button
                          onClick={() => handleModerationChange(entry.id, 'PENDING')}
                          className="quick-action-btn pending-btn"
                          disabled={entry.moderationStatus === 'PENDING'}
                        >
                          ⟲ Reset
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="entry-meta selectable">
                    <div className="entry-user">
                      <strong>User:</strong> {entry.username || 'Anonymous'}
                    </div>
                    <div className="entry-timestamp">
                      <strong>Submitted:</strong> {formatDate(entry.timestamp)}
                    </div>
                    {entry.metadata?.model && (
                      <div className="entry-model">
                        <strong>Model:</strong> {entry.metadata.model.replace('coreml-', '').replace('flux1-dev-kontext_fp8_scaled', 'Flux.1 Kontext')}
                      </div>
                    )}
                    {entry.metadata?.inferenceSteps && (
                      <div className="entry-steps">
                        <strong>Steps:</strong> {entry.metadata.inferenceSteps}
                      </div>
                    )}
                    {entry.metadata?.guidance && (
                      <div className="entry-guidance">
                        <strong>Guidance:</strong> {entry.metadata.guidance}
                      </div>
                    )}
                    {(entry.metadata?.seed !== undefined && entry.metadata?.seed !== null) && (
                      <div className="entry-seed">
                        <strong>Seed:</strong> {entry.metadata.seed}
                      </div>
                    )}
                    {/* Video-specific metadata */}
                    {entry.isVideo && (
                      <>
                        {entry.metadata?.videoMotionPrompt && (
                          <div className="entry-motion-prompt">
                            <strong>Motion:</strong> {entry.metadata.videoMotionPrompt}
                          </div>
                        )}
                        {entry.metadata?.videoResolution && (
                          <div className="entry-resolution">
                            <strong>Resolution:</strong> {entry.metadata.videoResolution}
                          </div>
                        )}
                        {entry.metadata?.videoFramerate && (
                          <div className="entry-fps">
                            <strong>FPS:</strong> {entry.metadata.videoFramerate}
                          </div>
                        )}
                        {entry.metadata?.videoDuration && (
                          <div className="entry-duration">
                            <strong>Duration:</strong> {entry.metadata.videoDuration}s
                          </div>
                        )}
                      </>
                    )}
                    {entry.tweetUrl && (
                      <div className="entry-tweet">
                        <a
                          href={entry.tweetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tweet-link"
                        >
                          View Tweet →
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="entry-actions">
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="delete-btn"
                      title="Delete this entry"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          <div className="pagination-controls">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="pagination-btn"
            >
              ← Previous
            </button>
            <span className="pagination-current">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="pagination-btn"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && entries.length === 0 && (
        <div className="empty-state">
          <p>No contest entries found.</p>
        </div>
      )}

      {/* Login Modal */}
      <LoginModal
        open={showLoginModal}
        mode={loginModalMode}
        onModeChange={setLoginModalMode}
        onClose={() => setShowLoginModal(false)}
        onSignupComplete={() => {
          setShowLoginModal(false);
          // Refresh entries after signup
          fetchEntries();
          fetchStats();
        }}
      />
    </div>
  );
};

export default Moderate;

