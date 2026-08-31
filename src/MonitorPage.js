import React, { useCallback, useEffect, useState } from 'react';
import {
  serviceEndpoint,
  getAuthHeaders,
  getRunId,
  MAX_UNVERIFIED_PER_RUN,
} from './config';

const EVENT_FILTERS = ['', 'verify', 'analyze', 'register', 'unverified_saved'];

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return Number(value).toFixed(digits);
}

function MonitorPage() {
  const runId = getRunId();
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventFilter, setEventFilter] = useState('');
  const [scope, setScope] = useState('run');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const loadMonitorData = useCallback(async () => {
    setLoading(true);
    const queryRunId = scope === 'run' ? runId : '';
    const params = new URLSearchParams({ limit: '100' });
    if (queryRunId) {
      params.set('run_id', queryRunId);
    }
    if (eventFilter) {
      params.set('event_type', eventFilter);
    }

    try {
      const statsParams = queryRunId ? `?run_id=${encodeURIComponent(queryRunId)}` : '';
      const [statsResponse, eventsResponse] = await Promise.all([
        fetch(`${serviceEndpoint}/monitor/stats${statsParams}`, {
          headers: getAuthHeaders(),
        }),
        fetch(`${serviceEndpoint}/monitor/events?${params.toString()}`, {
          headers: getAuthHeaders(),
        }),
      ]);

      const statsData = await statsResponse.json();
      const eventsData = await eventsResponse.json();

      if (statsResponse.status === 200) {
        setStats(statsData);
      }
      if (eventsResponse.status === 200) {
        setEvents(eventsData.results || []);
      }
    } catch (error) {
      console.error('Exception while loading monitor data:', error);
    } finally {
      setLoading(false);
    }
  }, [eventFilter, runId, scope]);

  useEffect(() => {
    loadMonitorData();
    const interval = setInterval(loadMonitorData, 5000);
    return () => clearInterval(interval);
  }, [loadMonitorData]);

  return (
    <div className="monitor-page">
      <nav className="app-nav">
        <a href="#">Camera</a>
        <a href="#/monitor" className="active">
          Monitor
        </a>
      </nav>

      <header className="monitor-header">
        <h1>Decision Monitor</h1>
        <p className="monitor-subtitle">
          How verify / analyze / register decisions were made — distance vs threshold, confidence,
          and model metadata.
        </p>
      </header>

      <div className="monitor-controls">
        <label>
          Scope
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="run">This run ({runId.slice(0, 8)}…)</option>
            <option value="all">All runs</option>
          </select>
        </label>
        <label>
          Event type
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
            {EVENT_FILTERS.map((value) => (
              <option key={value || 'all'} value={value}>
                {value || 'All events'}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={loadMonitorData}>
          Refresh
        </button>
      </div>

      {loading && !stats && <p className="monitor-hint">Loading monitor data…</p>}

      {stats && (
        <section className="monitor-stats">
          <div className="stat-card">
            <span className="stat-label">Total events</span>
            <strong>{stats.total_events}</strong>
          </div>
          <div className="stat-card verified">
            <span className="stat-label">Verified</span>
            <strong>{stats.verified}</strong>
          </div>
          <div className="stat-card rejected">
            <span className="stat-label">Not verified</span>
            <strong>{stats.not_verified}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Registered</span>
            <strong>{stats.registered}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Unverified saved</span>
            <strong>
              {stats.unverified_in_queue ?? stats.unverified_saved} / {stats.limit || MAX_UNVERIFIED_PER_RUN}
            </strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Avg confidence</span>
            <strong>{formatNumber(stats.avg_confidence, 1)}%</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Avg distance</span>
            <strong>{formatNumber(stats.avg_distance, 4)}</strong>
          </div>
        </section>
      )}

      <section className="monitor-events">
        <h2>Recent decisions</h2>
        {events.length === 0 && !loading && (
          <p className="monitor-hint">No events yet. Use the camera page to verify faces.</p>
        )}
        <ul className="event-list">
          {events.map((event) => (
            <li key={event.id} className={`event-row decision-${event.decision}`}>
              <div className="event-main">
                <span className="event-type">{event.event_type}</span>
                <span className="event-decision">{event.decision}</span>
                {event.identity && <span className="event-identity">{event.identity}</span>}
                <span className="event-time">{event.created_at}</span>
              </div>
              {(event.distance !== null && event.distance !== undefined) && (
                <div className="event-metrics">
                  <span>
                    distance {formatNumber(event.distance, 4)} / threshold{' '}
                    {formatNumber(event.threshold, 4)}
                  </span>
                  {event.confidence !== null && event.confidence !== undefined && (
                    <span>confidence {formatNumber(event.confidence, 1)}%</span>
                  )}
                  {event.threshold && event.distance !== null && (
                    <div className="threshold-bar">
                      <div
                        className="threshold-fill"
                        style={{
                          width: `${Math.min(100, (event.distance / event.threshold) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
              {event.metadata && (
                <button
                  type="button"
                  className="event-details-toggle"
                  onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                >
                  {expandedId === event.id ? 'Hide details' : 'Show details'}
                </button>
              )}
              {expandedId === event.id && event.metadata && (
                <pre className="event-metadata">{JSON.stringify(event.metadata, null, 2)}</pre>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="monitor-suggestions">
        <h2>Other ways to monitor</h2>
        <ul>
          <li>
            <strong>SQL / pgAdmin</strong> — query <code>decision_events</code> and{' '}
            <code>unverified_images</code> directly in Postgres.
          </li>
          <li>
            <strong>Grafana</strong> — connect a Postgres datasource and chart verify rate,
            confidence, and distance over time.
          </li>
          <li>
            <strong>Structured API logs</strong> — export <code>GET /monitor/events</code> to JSON
            and ship to ELK / Loki.
          </li>
          <li>
            <strong>Alerts</strong> — webhook or email when avg confidence drops or unverified
            queue hits the 20/run cap.
          </li>
          <li>
            <strong>Prometheus</strong> — expose counters from the API for ops dashboards.
          </li>
        </ul>
      </section>
    </div>
  );
}

export default MonitorPage;
