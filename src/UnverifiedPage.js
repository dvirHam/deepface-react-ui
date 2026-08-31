import React, { useEffect, useState } from 'react';
import UnverifiedList from './components/UnverifiedList';
import {
  serviceEndpoint,
  getAuthHeaders,
  getRunId,
  MAX_UNVERIFIED_PER_RUN,
} from './config';

function UnverifiedPage({
  pendingRegisterNames,
  setPendingRegisterNames,
  onRegister,
  onRemove,
}) {
  const runId = getRunId();
  const [scope, setScope] = useState('run');
  const [images, setImages] = useState([]);
  const [runSaveCount, setRunSaveCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadImages = async () => {
    setLoading(true);
    try {
      const query = scope === 'run' ? `?run_id=${encodeURIComponent(runId)}` : '';
      const response = await fetch(`${serviceEndpoint}/unverified${query}`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();

      if (response.status !== 200) {
        console.error(data.error || data);
        return;
      }

      setImages(data.results || []);
      setRunSaveCount(
        scope === 'run'
          ? data.run_count ?? (data.results || []).length
          : (data.results || []).length
      );
    } catch (error) {
      console.error('Exception while loading unverified images:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadImages();
    const interval = setInterval(loadImages, 5000);
    return () => clearInterval(interval);
  }, [scope, runId]);

  return (
    <div className="unverified-page">
      <nav className="app-nav">
        <a href="#">Camera</a>
        <a href="#/unverified" className="active">
          Unverified
        </a>
        <a href="#/monitor">Monitor</a>
      </nav>

      <header className="unverified-page-header">
        <h1>Unverified Queue</h1>
        <p className="unverified-hint">
          Review and register faces that failed verification. Limit: {MAX_UNVERIFIED_PER_RUN} per
          run.
        </p>
      </header>

      <div className="unverified-scope-controls">
        <label>
          Show
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="run">This run only ({runId.slice(0, 8)}…)</option>
            <option value="all">All runs</option>
          </select>
        </label>
        <button type="button" onClick={loadImages}>
          Refresh
        </button>
      </div>

      <UnverifiedList
        images={images}
        loading={loading}
        runSaveCount={runSaveCount}
        pendingRegisterNames={pendingRegisterNames}
        setPendingRegisterNames={setPendingRegisterNames}
        onRegister={onRegister}
        onRemove={onRemove}
        emptyMessage={
          scope === 'run'
            ? 'No unverified screenshots in this run yet.'
            : 'No unverified screenshots in the database.'
        }
      />
    </div>
  );
}

export default UnverifiedPage;
