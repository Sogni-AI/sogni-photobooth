import React, { useState, useEffect } from 'react';
import { getAnalyticsDashboard, getCurrentUTCDate } from '../../services/analyticsService';
import '../../styles/components/AnalyticsDashboard.css';

const AnalyticsDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await getAnalyticsDashboard();
      
      if (data) {
        setDashboardData(data);
        setLastRefresh(new Date());
      } else {
        setError('No analytics data available');
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchDashboardData, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num?.toString() || '0';
  };

  const formatPromptName = (promptId) => {
    // Convert camelCase to readable format
    return promptId
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  if (loading && !dashboardData) {
    return (
      <div className="analytics-dashboard">
        <div className="dashboard-header">
          <h1>📊 Photobooth Analytics Dashboard</h1>
        </div>
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading analytics data...</p>
        </div>
      </div>
    );
  }

  if (error && !dashboardData) {
    return (
      <div className="analytics-dashboard">
        <div className="dashboard-header">
          <h1>📊 Photobooth Analytics Dashboard</h1>
        </div>
        <div className="error-state">
          <p>❌ {error}</p>
          <button onClick={fetchDashboardData} className="retry-btn">
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  const { today, yesterday, lifetime } = dashboardData || {};

  return (
    <div className="analytics-dashboard">
      <div className="dashboard-header">
        <h1>📊 Photobooth Analytics Dashboard</h1>
        <div className="dashboard-controls">
          <button 
            onClick={fetchDashboardData} 
            className="refresh-btn"
            disabled={loading}
          >
            {loading ? '🔄' : '↻'} Refresh
          </button>
          {lastRefresh && (
            <span className="last-refresh">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card today">
          <h3>📅 Today ({today?.date})</h3>
          <div className="metrics">
            <div className="metric">
              <span className="value">{formatNumber(today?.summary?.totalDownloads)}</span>
              <span className="label">Downloads</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(today?.summary?.totalShares)}</span>
              <span className="label">Shares</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(today?.summary?.totalCombined)}</span>
              <span className="label">Total</span>
            </div>
            <div className="metric">
              <span className="value">{today?.summary?.totalPrompts || 0}</span>
              <span className="label">Active Prompts</span>
            </div>
          </div>
        </div>

        <div className="summary-card yesterday">
          <h3>📊 Yesterday ({yesterday?.date})</h3>
          <div className="metrics">
            <div className="metric">
              <span className="value">{formatNumber(yesterday?.summary?.totalDownloads)}</span>
              <span className="label">Downloads</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(yesterday?.summary?.totalShares)}</span>
              <span className="label">Shares</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(yesterday?.summary?.totalCombined)}</span>
              <span className="label">Total</span>
            </div>
            <div className="metric">
              <span className="value">{yesterday?.summary?.totalPrompts || 0}</span>
              <span className="label">Active Prompts</span>
            </div>
          </div>
        </div>

        <div className="summary-card lifetime">
          <h3>🏆 All Time</h3>
          <div className="metrics">
            <div className="metric">
              <span className="value">{formatNumber(lifetime?.summary?.totalDownloads)}</span>
              <span className="label">Downloads</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(lifetime?.summary?.totalShares)}</span>
              <span className="label">Shares</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(lifetime?.summary?.totalCombined)}</span>
              <span className="label">Total</span>
            </div>
            <div className="metric">
              <span className="value">{lifetime?.summary?.totalPrompts || 0}</span>
              <span className="label">Total Prompts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboards */}
      <div className="leaderboards">
        {/* Today's Top Prompts */}
        <div className="leaderboard-section">
          <h3>🔥 Today's Most Popular Prompts</h3>
          <div className="leaderboard-tabs">
            <div className="leaderboard combined">
              <h4>Combined (Downloads + Shares)</h4>
              <div className="leaderboard-list">
                {today?.topPrompts?.combined?.slice(0, 10).map((item, index) => (
                  <div key={item.promptId} className="leaderboard-item">
                    <span className="rank">#{index + 1}</span>
                    <span className="prompt-name">{formatPromptName(item.promptId)}</span>
                    <span className="count">{formatNumber(item.count)}</span>
                  </div>
                )) || <p className="no-data">No data available</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Lifetime Top Prompts */}
        <div className="leaderboard-section">
          <h3>👑 All-Time Most Popular Prompts</h3>
          <div className="leaderboard-tabs">
            <div className="leaderboard combined">
              <h4>Combined (Downloads + Shares)</h4>
              <div className="leaderboard-list">
                {lifetime?.topPrompts?.combined?.slice(0, 20).map((item, index) => (
                  <div key={item.promptId} className="leaderboard-item">
                    <span className="rank">#{index + 1}</span>
                    <span className="prompt-name">{formatPromptName(item.promptId)}</span>
                    <span className="count">{formatNumber(item.count)}</span>
                  </div>
                )) || <p className="no-data">No data available</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Separate Downloads and Shares for Lifetime */}
        <div className="leaderboard-section split">
          <div className="leaderboard downloads">
            <h4>💾 Top Downloads (All-Time)</h4>
            <div className="leaderboard-list">
              {lifetime?.topPrompts?.downloads?.slice(0, 10).map((item, index) => (
                <div key={item.promptId} className="leaderboard-item">
                  <span className="rank">#{index + 1}</span>
                  <span className="prompt-name">{formatPromptName(item.promptId)}</span>
                  <span className="count">{formatNumber(item.count)}</span>
                </div>
              )) || <p className="no-data">No data available</p>}
            </div>
          </div>

          <div className="leaderboard shares">
            <h4>📤 Top Shares (All-Time)</h4>
            <div className="leaderboard-list">
              {lifetime?.topPrompts?.shares?.slice(0, 10).map((item, index) => (
                <div key={item.promptId} className="leaderboard-item">
                  <span className="rank">#{index + 1}</span>
                  <span className="prompt-name">{formatPromptName(item.promptId)}</span>
                  <span className="count">{formatNumber(item.count)}</span>
                </div>
              )) || <p className="no-data">No data available</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="dashboard-footer">
        <p>
          📈 Analytics are tracked in real-time. Data is stored in Redis and automatically expires after 30 days for daily metrics.
        </p>
        <p>
          🔒 This dashboard is for internal use only. All tracking respects user privacy and only captures prompt usage patterns.
        </p>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
