import React, { useState, useEffect } from 'react';
import { getAnalyticsDashboard, getHistoricalAnalytics } from '../../services/analyticsService';
import '../../styles/components/AnalyticsDashboard.css';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const AnalyticsDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [historicalData, setHistoricalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [chartType, setChartType] = useState('line');
  const [chartDays, setChartDays] = useState(30);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Ensure proper scrolling on mobile when analytics dashboard is active
  useEffect(() => {
    document.body.classList.add('analytics-active');
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
    
    return () => {
      document.body.classList.remove('analytics-active');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [dashboardResponse, historicalResponse] = await Promise.all([
        getAnalyticsDashboard(),
        getHistoricalAnalytics(chartDays)
      ]);
      
      if (dashboardResponse) {
        setDashboardData(dashboardResponse);
        setLastRefresh(new Date());
      } else {
        setError('No analytics data available');
      }
      
      if (historicalResponse) {
        setHistoricalData(historicalResponse);
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

  // Refetch data when chart settings change
  useEffect(() => {
    if (dashboardData) { // Only refetch if we already have data
      fetchDashboardData();
    }
  }, [chartDays]);

  // Handle window resize for responsive chart options
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

  // Generate chart data for historical analytics
  const generateChartData = () => {
    if (!historicalData || !historicalData.data) return null;

    const data = historicalData.data;
    const labels = data.map(item => {
      const date = new Date(item.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return {
      labels,
      datasets: [
        {
          label: 'Downloads',
          data: data.map(item => item.downloads),
          borderColor: 'rgb(39, 174, 96)',
          backgroundColor: 'rgba(39, 174, 96, 0.1)',
          tension: 0.1,
        },
        {
          label: 'Shares',
          data: data.map(item => item.shares),
          borderColor: 'rgb(52, 152, 219)',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          tension: 0.1,
        },
        {
          label: 'Batches Generated',
          data: data.map(item => item.batches_generated),
          borderColor: 'rgb(155, 89, 182)',
          backgroundColor: 'rgba(155, 89, 182, 0.1)',
          tension: 0.1,
        },
        {
          label: 'Photos Generated',
          data: data.map(item => item.photos_generated),
          borderColor: 'rgb(230, 126, 34)',
          backgroundColor: 'rgba(230, 126, 34, 0.1)',
          tension: 0.1,
        },
        {
          label: 'Photos Enhanced',
          data: data.map(item => item.photos_enhanced),
          borderColor: 'rgb(231, 76, 60)',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          tension: 0.1,
        },
        {
          label: 'Camera Photos',
          data: data.map(item => item.photos_taken_camera),
          borderColor: 'rgb(46, 204, 113)',
          backgroundColor: 'rgba(46, 204, 113, 0.1)',
          tension: 0.1,
        },
        {
          label: 'Uploaded Photos',
          data: data.map(item => item.photos_uploaded_browse),
          borderColor: 'rgb(52, 73, 94)',
          backgroundColor: 'rgba(52, 73, 94, 0.1)',
          tension: 0.1,
        },
        {
          label: 'Twitter Shares',
          data: data.map(item => item.twitter_shares),
          borderColor: 'rgb(29, 161, 242)',
          backgroundColor: 'rgba(29, 161, 242, 0.1)',
          tension: 0.1,
        }
      ]
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: windowWidth < 768 ? 'bottom' : 'top',
        labels: {
          boxWidth: windowWidth < 480 ? 12 : 20,
          font: {
            size: windowWidth < 480 ? 10 : 12,
          },
          padding: windowWidth < 480 ? 8 : 20,
        },
      },
      title: {
        display: true,
        text: `Analytics Trends - Last ${chartDays} Days`,
        font: {
          size: windowWidth < 480 ? 14 : 16,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          font: {
            size: windowWidth < 480 ? 10 : 12,
          },
        },
      },
      x: {
        ticks: {
          font: {
            size: windowWidth < 480 ? 10 : 12,
          },
          maxRotation: windowWidth < 480 ? 45 : 0,
        },
      },
    },
    elements: {
      point: {
        radius: windowWidth < 480 ? 2 : 3,
      },
      line: {
        borderWidth: windowWidth < 480 ? 1.5 : 2,
      },
    },
  };

  if (loading && !dashboardData) {
    return (
      <div className="analytics-dashboard">
        <div className="dashboard-header">
          <h1>📊 Photobooth Analytics</h1>
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
          <h1>📊 Photobooth Analytics</h1>
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

  const { daily, lifetime, topPrompts, date } = dashboardData || {};
  const chartData = generateChartData();

  return (
    <div className="analytics-dashboard">
      <div className="dashboard-header">
        <h1>📊 Photobooth Analytics</h1>
        <div className="dashboard-controls">
          <button 
            onClick={() => window.location.hash = ''}
            className="back-btn"
          >
            ← Back to Photobooth
          </button>
          <div className="chart-controls">
            <select 
              value={chartDays} 
              onChange={(e) => setChartDays(Number(e.target.value))}
              className="chart-select"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <select 
              value={chartType} 
              onChange={(e) => setChartType(e.target.value)}
              className="chart-select"
            >
              <option value="line">Line Chart</option>
              <option value="bar">Bar Chart</option>
            </select>
          </div>
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

      {/* Historical Chart */}
      {chartData && (
        <div className="chart-section">
          <div className="chart-container">
            {chartType === 'line' ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <Bar data={chartData} options={chartOptions} />
            )}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card today">
          <h3>📅 Today ({date})</h3>
          <div className="metrics">
            <div className="metric">
              <span className="value">{formatNumber(daily?.downloads)}</span>
              <span className="label">Downloads</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(daily?.shares)}</span>
              <span className="label">Shares</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(daily?.batches_generated)}</span>
              <span className="label">Batches</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(daily?.photos_generated)}</span>
              <span className="label">Photos</span>
            </div>
          </div>
        </div>

        <div className="summary-card today">
          <h3>📸 Today - Photo Sources</h3>
          <div className="metrics">
            <div className="metric">
              <span className="value">{formatNumber(daily?.photos_taken_camera)}</span>
              <span className="label">Camera</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(daily?.photos_uploaded_browse)}</span>
              <span className="label">Uploaded</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(daily?.photos_enhanced)}</span>
              <span className="label">Enhanced</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(daily?.twitter_shares)}</span>
              <span className="label">X/Twitter</span>
            </div>
          </div>
        </div>

        <div className="summary-card lifetime">
          <h3>🏆 All Time</h3>
          <div className="metrics">
            <div className="metric">
              <span className="value">{formatNumber(lifetime?.downloads)}</span>
              <span className="label">Downloads</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(lifetime?.shares)}</span>
              <span className="label">Shares</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(lifetime?.batches_generated)}</span>
              <span className="label">Batches</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(lifetime?.photos_generated)}</span>
              <span className="label">Photos</span>
            </div>
          </div>
        </div>

        <div className="summary-card lifetime">
          <h3>📸 All Time - Photo Sources</h3>
          <div className="metrics">
            <div className="metric">
              <span className="value">{formatNumber(lifetime?.photos_taken_camera)}</span>
              <span className="label">Camera</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(lifetime?.photos_uploaded_browse)}</span>
              <span className="label">Uploaded</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(lifetime?.photos_enhanced)}</span>
              <span className="label">Enhanced</span>
            </div>
            <div className="metric">
              <span className="value">{formatNumber(lifetime?.twitter_shares)}</span>
              <span className="label">X/Twitter</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Prompts */}
      <div className="leaderboards">
        <div className="leaderboard-section">
          <h3>🔥 Most Popular Prompts</h3>
          <div className="leaderboard-tabs">
            <div className="leaderboard combined">
              <h4>Combined (Downloads + Shares)</h4>
              <div className="leaderboard-list">
                {topPrompts?.slice(0, 20).map((item, index) => (
                  <div key={item.promptId} className="leaderboard-item">
                    <span className="rank">#{index + 1}</span>
                    <span className="prompt-name">{formatPromptName(item.promptId)}</span>
                    <div className="counts">
                      <span className="count total">{formatNumber(item.combined)} total</span>
                      <span className="count downloads">{formatNumber(item.downloads)} downloads</span>
                      <span className="count shares">{formatNumber(item.shares)} shares</span>
                    </div>
                  </div>
                )) || <p className="no-data">No data available</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="dashboard-footer">
        <p>
          📈 Analytics are tracked in real-time. Historical data is preserved permanently for trend analysis and reporting.
        </p>
        <p>
          🔒 This dashboard is for internal use only. All tracking respects user privacy and only captures usage patterns and prompt popularity.
        </p>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
