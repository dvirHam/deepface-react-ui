import React, { useMemo, useState } from 'react';
import { MAX_UNVERIFIED_PER_RUN } from '../config';

const EMOTION_OPTIONS = ['', 'angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral'];

function getDominantEmotion(image) {
  if (!Array.isArray(image.analysis) || image.analysis.length === 0) {
    return '';
  }
  return image.analysis[0].dominant_emotion || '';
}

function matchesSearch(image, query) {
  if (!query.trim()) {
    return true;
  }
  const needle = query.trim().toLowerCase();
  const haystack = [
    String(image.id),
    image.created_at,
    ...(Array.isArray(image.analysis)
      ? image.analysis.map((face) => [face.summary, face.dominant_emotion, face.dominant_gender].join(' '))
      : []),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

function UnverifiedList({
  images,
  loading,
  runSaveCount,
  pendingRegisterNames,
  setPendingRegisterNames,
  onRegister,
  onRemove,
  showFilters = true,
  emptyMessage = 'No unverified screenshots yet.',
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [emotionFilter, setEmotionFilter] = useState('');

  const filteredImages = useMemo(() => {
    let result = images.filter((image) => matchesSearch(image, searchQuery));

    if (emotionFilter) {
      result = result.filter((image) => getDominantEmotion(image) === emotionFilter);
    }

    result.sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });

    return result;
  }, [images, searchQuery, sortOrder, emotionFilter]);

  if (loading) {
    return <p className="unverified-hint">Loading unverified images...</p>;
  }

  return (
    <section className="unverified-section">
      <div className="unverified-section-header">
        <h2>
          Unverified ({filteredImages.length}
          {filteredImages.length !== images.length ? ` of ${images.length}` : ''})
        </h2>
        <p className="unverified-hint">
          Queue: {runSaveCount}/{MAX_UNVERIFIED_PER_RUN} saved this run. Register or remove to
          clear slots.
        </p>
      </div>

      {showFilters && (
        <div className="unverified-filters">
          <label>
            Search
            <input
              type="search"
              placeholder="Age, emotion, gender…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="unverified-filter-input"
            />
          </label>
          <label>
            Emotion
            <select
              value={emotionFilter}
              onChange={(e) => setEmotionFilter(e.target.value)}
              className="unverified-filter-input"
            >
              <option value="">All emotions</option>
              {EMOTION_OPTIONS.filter(Boolean).map((emotion) => (
                <option key={emotion} value={emotion}>
                  {emotion}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="unverified-filter-input"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          {(searchQuery || emotionFilter || sortOrder !== 'newest') && (
            <button
              type="button"
              className="unverified-filter-clear"
              onClick={() => {
                setSearchQuery('');
                setEmotionFilter('');
                setSortOrder('newest');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {filteredImages.length === 0 ? (
        <p className="unverified-hint">{images.length === 0 ? emptyMessage : 'No matches for current filters.'}</p>
      ) : (
        <ul className="unverified-grid">
          {filteredImages.map((image) => {
            const previewSrc = image.preview || image.img;
            return (
              <li key={image.id} className="unverified-card">
                <div className="unverified-preview">
                  <span className="unverified-preview-label">Screenshot preview</span>
                  {previewSrc ? (
                    <img
                      src={previewSrc}
                      alt={`Unverified screenshot ${image.id}`}
                      className="unverified-thumbnail"
                    />
                  ) : (
                    <div className="unverified-thumbnail unverified-preview-placeholder">
                      Preview unavailable
                    </div>
                  )}
                  {image.created_at && (
                    <span className="unverified-captured-at">
                      {new Date(image.created_at).toLocaleString()}
                    </span>
                  )}
                </div>
                {Array.isArray(image.analysis) && image.analysis.length > 0 ? (
                  image.analysis.map((face, faceIndex) => (
                    <div key={faceIndex} className="unverified-analysis">
                      <p className="unverified-analysis-summary">{face.summary}</p>
                      {face.emotion_scores && (
                        <p className="unverified-analysis-detail">
                          Emotion:{' '}
                          {Object.entries(face.emotion_scores)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 3)
                            .map(([name, score]) => `${name} ${Math.round(score)}%`)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="unverified-analysis-muted">Analysis unavailable</p>
                )}
                <input
                  type="text"
                  placeholder="Identity name"
                  value={pendingRegisterNames[image.id] || ''}
                  onChange={(e) =>
                    setPendingRegisterNames((prev) => ({
                      ...prev,
                      [image.id]: e.target.value,
                    }))
                  }
                  className="unverified-name-input"
                />
                <div className="unverified-actions">
                  <button type="button" onClick={() => onRegister(image.id)}>
                    Register
                  </button>
                  <button type="button" onClick={() => onRemove(image.id)}>
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default UnverifiedList;
