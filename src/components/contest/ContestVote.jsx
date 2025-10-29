import React, { useState, useEffect } from 'react';
import { useSogniAuth } from '../../services/sogniAuth';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import LoginModal from '../auth/LoginModal';
import { AuthStatus } from '../auth/AuthStatus';
import '../../styles/contest/ContestVote.css';

const ContestVote = () => {
  const { isAuthenticated, user } = useSogniAuth();
  const { isEnabled, enable: enableMusic } = useMusicPlayer();
  const [contestId] = useState('halloween');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('timestamp'); // 'timestamp' or 'votes'
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState('login');
  const [expandedPrompts, setExpandedPrompts] = useState(new Set());
  const limit = 20;

  // Fetch approved contest entries
  const fetchEntries = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/contest/${contestId}/entries?page=${page}&limit=${limit}&sortBy=${sortBy}&order=desc&moderationStatus=APPROVED`
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

  useEffect(() => {
    fetchEntries();
  }, [contestId, page, sortBy]);

  // Close login modal when user successfully authenticates
  useEffect(() => {
    if (isAuthenticated && showLoginModal) {
      console.log('User authenticated, closing login modal');
      setShowLoginModal(false);
    }
  }, [isAuthenticated, showLoginModal]);

  // Enable music player when component mounts
  useEffect(() => {
    if (!isEnabled) {
      enableMusic();
    }
  }, [isEnabled, enableMusic]);

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

  const handleVote = async (entryId, currentlyVoted) => {
    // Check if user is logged in
    console.log('Auth state check:', {
      isAuthenticated,
      username: user?.username
    });
    
    if (!isAuthenticated || !user?.username) {
      console.log('User not authenticated, showing login modal');
      setShowLoginModal(true);
      return;
    }

    console.log(`Voting for entry ${entryId}, currently voted: ${currentlyVoted}, username: ${user.username}`);

    try {
      const method = currentlyVoted ? 'DELETE' : 'POST';
      const url = `/api/contest/${contestId}/entry/${entryId}/vote`;
      
      console.log(`Sending ${method} request to ${url}`);
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: user.username }),
      });

      console.log(`Response status: ${response.status}`);

      if (!response.ok) {
        const data = await response.json();
        console.error('Vote failed:', data);
        throw new Error(data.message || 'Failed to update vote');
      }

      const data = await response.json();
      console.log('Vote response:', data);

      if (data.success) {
        // Update the local state
        setEntries(prevEntries =>
          prevEntries.map(entry =>
            entry.id === entryId
              ? { ...entry, votes: data.votes || [] }
              : entry
          )
        );
        console.log('Local state updated');
      }
    } catch (err) {
      console.error('Error updating vote:', err);
      alert('Failed to update vote: ' + err.message);
    }
  };

  const hasUserVoted = (entry) => {
    if (!user?.username) return false;
    return (entry.votes || []).some(vote => vote.username === user.username);
  };

  const getVoteCount = (entry) => {
    return (entry.votes || []).length;
  };

  const getVotersList = (entry) => {
    const votes = entry.votes || [];
    const voters = votes.map(vote => vote.username);
    
    if (voters.length === 0) return 'No votes yet';
    
    if (voters.length <= 100) {
      return voters.join(', ');
    }
    
    const displayVoters = voters.slice(0, 100);
    const remaining = voters.length - 100;
    return `${displayVoters.join(', ')} and ${remaining} more`;
  };

  return (
    <div className="contest-vote">
      {/* Auth Status Widget */}
      <div className="contest-vote-auth-status">
        <AuthStatus />
      </div>

      <header className="contest-vote-header">
        <h1>🎃 Halloween Contest - Vote for Your Favorites!</h1>
        <div className="header-info">
          <p>Vote for your favorite entries by clicking the heart icon.</p>
          {!isAuthenticated && (
            <p className="login-hint">💡 Login required to vote</p>
          )}
        </div>
      </header>

      {/* Sort Controls */}
      <div className="sort-controls">
        <label>Sort by:</label>
        <div className="sort-buttons">
          <button
            onClick={() => setSortBy('timestamp')}
            className={`sort-btn ${sortBy === 'timestamp' ? 'active' : ''}`}
          >
            📅 Newest First
          </button>
          <button
            onClick={() => setSortBy('votes')}
            className={`sort-btn ${sortBy === 'votes' ? 'active' : ''}`}
          >
            🔥 Most Popular
          </button>
        </div>
      </div>

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

      {/* Entries Grid */}
      {!loading && entries.length > 0 && (
        <div className="entries-container">
          <div className="entries-header">
            <h2>Approved Entries ({total} total)</h2>
            <div className="pagination-info">
              Page {page} of {totalPages}
            </div>
          </div>

          <div className="entries-grid">
            {entries.map((entry) => {
              const voteCount = getVoteCount(entry);
              const userVoted = hasUserVoted(entry);
              
              return (
                <div key={entry.id} className="entry-card">
                  {entry.imageUrl && (
                    <div className="entry-image">
                      <img src={entry.imageUrl} alt="Contest entry" />
                    </div>
                  )}
                  <div className="entry-details">
                    <div 
                      className={`entry-prompt ${expandedPrompts.has(entry.id) ? 'expanded' : 'collapsed'}`}
                      onClick={() => togglePromptExpansion(entry.id)}
                      title="Click to expand/collapse"
                    >
                      <strong>Prompt:</strong> 
                      <span 
                        className="prompt-text"
                        onClick={(e) => {
                          if (expandedPrompts.has(entry.id)) {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {entry.prompt}
                      </span>
                    </div>
                    <div className="entry-meta">
                      <div className="entry-user">
                        <strong>By:</strong> {entry.username || 'Anonymous'}
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
                    </div>
                    
                    {/* Vote Section */}
                    <div className="entry-vote-section">
                      <button
                        onClick={() => handleVote(entry.id, userVoted)}
                        className={`vote-btn ${userVoted ? 'voted' : ''}`}
                        title={userVoted ? 'Click to remove your vote' : 'Click to vote'}
                      >
                        <span className="heart-icon">{userVoted ? '❤️' : '🤍'}</span>
                        <span className="vote-count">{voteCount}</span>
                      </button>
                    </div>

                    {/* Voters List */}
                    {voteCount > 0 && (
                      <div className="voters-list">
                        <strong>Voted by:</strong>
                        <div className="voters-box">
                          {getVotersList(entry)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
          <p>No approved contest entries yet. Check back soon!</p>
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
          // Refresh entries after signup to update voting state
          fetchEntries();
        }}
      />
    </div>
  );
};

export default ContestVote;

