import React, { useEffect, useMemo, useState } from 'react';
import { MAX_UNVERIFIED_PER_RUN } from '../config';
import { formatNearestMatchHint, suggestNameFromAnalysis } from '../utils/unverifiedHelpers';

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
    formatNearestMatchHint(image.verify_context),
    ...(Array.isArray(image.analysis)
      ? image.analysis.map((face) =>
          [face.summary, face.dominant_emotion, face.dominant_gender].join(' ')
        )
      : []),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

function PreviewLightbox({ previewSrc, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!previewSrc) {
    return null;
  }

  return (
    <div className="preview-lightbox" onClick={onClose} role="presentation">
      <div className="preview-lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="preview-lightbox-close" onClick={onClose}>
          Close
        </button>
        <img src={previewSrc} alt="Enlarged unverified screenshot" />
      </div>
    </div>
  );
}

function UnverifiedList({
  images,
  loading,
  runSaveCount,
  pendingRegisterNames,
  setPendingRegisterNames,
  onRegister,
  onRemove,
  onBulkRegister,
  showFilters = true,
  emptyMessage = 'No unverified screenshots yet.',
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [emotionFilter, setEmotionFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBaseName, setBulkBaseName] = useState('');
  const [enlargedPreview, setEnlargedPreview] = useState(null);
  const [bulkStatus, setBulkStatus] = useState('');

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

  const filteredIds = filteredImages.map((image) => image.id);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => images.some((image) => image.id === id)));
  }, [images]);

  const applySuggestion = (imageId, image) => {
    setPendingRegisterNames((prev) => ({
      ...prev,
      [imageId]: suggestNameFromAnalysis(image),
    }));
  };

  const applyAllSuggestions = () => {
    const next = { ...pendingRegisterNames };
    filteredImages.forEach((image) => {
      if (!next[image.id]?.trim()) {
        next[image.id] = suggestNameFromAnalysis(image);
      }
    });
    setPendingRegisterNames(next);
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...filteredIds])]);
    }
  };

  const handleBulkRegister = async () => {
    const ids = selectedIds.filter((id) => filteredIds.includes(id));
    if (ids.length === 0) {
      setBulkStatus('Select at least one screenshot.');
      return;
    }

    setBulkStatus('Registering…');
    const result = await onBulkRegister(ids, bulkBaseName.trim());
    setBulkStatus(
      result.failed > 0
        ? `Registered ${result.success}, failed ${result.failed}.`
        : `Registered ${result.success} face(s).`
    );
    setSelectedIds([]);
  };

  if (loading) {
    return <p className="unverified-hint">Loading unverified images...</p>;
  }

  return (
    <section className="unverified-section">
      {enlargedPreview && (
        <PreviewLightbox previewSrc={enlargedPreview} onClose={() => setEnlargedPreview(null)} />
      )}

      <div className="unverified-section-header">
        <h2>
          Unverified ({filteredImages.length}
          {filteredImages.length !== images.length ? ` of ${images.length}` : ''})
        </h2>
        <p className="unverified-hint">
          Queue: {runSaveCount}/{MAX_UNVERIFIED_PER_RUN} saved this run. Click a preview to enlarge.
        </p>
      </div>

      {showFilters && (
        <div className="unverified-filters">
          <label>
            Search
            <input
              type="search"
              placeholder="Age, emotion, nearest match…"
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
          <button type="button" className="unverified-filter-clear" onClick={applyAllSuggestions}>
            Suggest all names
          </button>
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

      {filteredImages.length > 0 && (
        <div className="unverified-bulk-bar">
          <label className="bulk-select-all">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleSelectAllFiltered}
            />
            Select all shown ({filteredIds.length})
          </label>
          <input
            type="text"
            placeholder="Bulk name prefix (optional)"
            value={bulkBaseName}
            onChange={(e) => setBulkBaseName(e.target.value)}
            className="unverified-filter-input"
          />
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={handleBulkRegister}
          >
            Register selected ({selectedIds.length})
          </button>
          {bulkStatus && <span className="bulk-status">{bulkStatus}</span>}
        </div>
      )}

      {filteredImages.length === 0 ? (
        <p className="unverified-hint">
          {images.length === 0 ? emptyMessage : 'No matches for current filters.'}
        </p>
      ) : (
        <ul className="unverified-grid">
          {filteredImages.map((image) => {
            const previewSrc = image.preview || image.img;
            const nearestHint = formatNearestMatchHint(image.verify_context);
            const suggestion = suggestNameFromAnalysis(image);
            const isSelected = selectedIds.includes(image.id);

            return (
              <li
                key={image.id}
                className={`unverified-card${isSelected ? ' unverified-card-selected' : ''}`}
              >
                <label className="unverified-select-row">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(image.id)}
                  />
                  Select for bulk register
                </label>
                <div className="unverified-preview">
                  <span className="unverified-preview-label">Screenshot preview</span>
                  {previewSrc ? (
                    <button
                      type="button"
                      className="unverified-thumbnail-button"
                      onClick={() => setEnlargedPreview(previewSrc)}
                    >
                      <img
                        src={previewSrc}
                        alt={`Unverified screenshot ${image.id}`}
                        className="unverified-thumbnail"
                      />
                      <span className="unverified-enlarge-hint">Click to enlarge</span>
                    </button>
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
                {nearestHint && <p className="unverified-nearest-match">{nearestHint}</p>}
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
                <div className="unverified-name-row">
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
                  <button
                    type="button"
                    className="suggest-name-btn"
                    title={suggestion}
                    onClick={() => applySuggestion(image.id, image)}
                  >
                    Suggest
                  </button>
                </div>
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
