import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import useMetrics from '../../hooks/useMetrics';
import './MetricsBar.css';

const MetricItem = ({ title, today, lifetime }) => (
  <div className="metric-item">
    <div className="metric-title">{title}</div>
    <div className="metric-values">
      <div className="metric-today">
        <span className="metric-label">Today</span>
        <span className="metric-value">{today}</span>
      </div>
      <div className="metric-lifetime">
        <span className="metric-label">All time</span>
        <span className="metric-value">{lifetime}</span>
      </div>
    </div>
  </div>
);

MetricItem.propTypes = {
  title: PropTypes.string.isRequired,
  today: PropTypes.number.isRequired,
  lifetime: PropTypes.number.isRequired
};

const MetricsBar = () => {
  const { metrics, isLoading, error, refreshMetrics } = useMetrics();
  const [isExpanded, setIsExpanded] = useState(false);

  // Debug: log the metrics state whenever it changes
  useEffect(() => {
    console.log('[MetricsBar] Rendered with:', { 
      hasMetrics: !!metrics, 
      isLoading, 
      error: error || 'none',
      data: metrics || 'null',
      isExpanded
    });
  }, [metrics, isLoading, error, isExpanded]);

  const expandStats = () => {
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  // Always show at least a placeholder
  if (isLoading) {
    return (
      <div className="metrics-bar metrics-loading">
        <div className="metrics-header discreet" onClick={expandStats}>
          View stats
        </div>
      </div>
    );
  }

  // If there's an error or no metrics, show minimal error state instead of nothing
  if (error || !metrics) {
    console.warn('[MetricsBar] Error or missing data:', error);
    return (
      <div className="metrics-bar metrics-error">
        <div className="metrics-header discreet" onClick={expandStats}>
          View stats
          {isExpanded && (
            <div className="metrics-container">
              <div className="metric-error-message">
                Stats temporarily unavailable
                <button className="metrics-refresh-btn" onClick={refreshMetrics}>Retry</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Guard against missing data structure
  const today = metrics.today || {
    batches_generated: 0,
    photos_generated: 0,
    photos_enhanced: 0,
    photos_taken_camera: 0,
    photos_uploaded_browse: 0,
    twitter_shares: 0
  };
  
  const lifetime = metrics.lifetime || {
    batches_generated: 0,
    photos_generated: 0,
    photos_enhanced: 0,
    photos_taken_camera: 0,
    photos_uploaded_browse: 0,
    twitter_shares: 0
  };

  return (
    <div className="metrics-bar">
      <div className="metrics-header discreet" onClick={expandStats}>
        View stats
      </div>
      
      {isExpanded && (
        <div className="metrics-container">
          <MetricItem 
            title="Batches Generated" 
            today={today.batches_generated || 0} 
            lifetime={lifetime.batches_generated || 0} 
          />
          <MetricItem 
            title="Photos Generated" 
            today={today.photos_generated || 0} 
            lifetime={lifetime.photos_generated || 0} 
          />
          <MetricItem 
            title="Photos Enhanced" 
            today={today.photos_enhanced || 0} 
            lifetime={lifetime.photos_enhanced || 0} 
          />
          <MetricItem 
            title="Camera Photos" 
            today={today.photos_taken_camera || 0} 
            lifetime={lifetime.photos_taken_camera || 0} 
          />
          <MetricItem 
            title="Photos Uploaded" 
            today={today.photos_uploaded_browse || 0} 
            lifetime={lifetime.photos_uploaded_browse || 0} 
          />
          <MetricItem 
            title="Twitter Shares" 
            today={today.twitter_shares || 0} 
            lifetime={lifetime.twitter_shares || 0} 
          />
        </div>
      )}
    </div>
  );
};

export default MetricsBar; 