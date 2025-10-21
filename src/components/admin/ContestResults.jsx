import React, { useState, useEffect } from 'react';
import '../../styles/admin/ContestResults.css';

const ContestResults = () => {
  const [contestId, setContestId] = useState('halloween');
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

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

  // Load entries and stats
  useEffect(() => {
    fetchEntries();
    fetchStats();
  }, [contestId, page]);

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
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

  return (
    <div className="contest-results">
      <header className="contest-results-header">
        <h1>🎃 Contest Results</h1>
        <div className="header-controls">
          <select
            value={contestId}
            onChange={(e) => {
              setContestId(e.target.value);
              setPage(1);
            }}
            className="contest-select"
          >
            <option value="halloween">Halloween Contest</option>
            {/* Add more contests as needed */}
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
                {entry.imageUrl && (
                  <div className="entry-image">
                    <img src={entry.imageUrl} alt="Contest entry" />
                  </div>
                )}
                <div className="entry-details">
                  <div className="entry-prompt">
                    <strong>Prompt:</strong> {entry.prompt}
                  </div>
                  <div className="entry-meta">
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
                    {entry.metadata?.seed && (
                      <div className="entry-seed">
                        <strong>Seed:</strong> {entry.metadata.seed}
                      </div>
                    )}
                    {entry.metadata?.guidance && (
                      <div className="entry-guidance">
                        <strong>Guidance:</strong> {entry.metadata.guidance}
                      </div>
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
                    {entry.address && (
                      <div className="entry-address">
                        <strong>Email:</strong> {entry.address}
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
    </div>
  );
};

export default ContestResults;

