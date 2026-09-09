import React, { useRef, useEffect, useState, useCallback } from 'react';
import './App.css';
import MonitorPage from './MonitorPage';
import UnverifiedPage from './UnverifiedPage';
import UnverifiedList from './components/UnverifiedList';
import VoicePanel from './VoicePanel';
import { suggestNameFromAnalysis } from './utils/unverifiedHelpers';
import {
  serviceEndpoint,
  facialRecognitionModel,
  faceDetector,
  distanceMetric,
  antiSpoofing,
  getAuthHeaders,
  getRunId,
  MAX_UNVERIFIED_PER_RUN,
  AUTO_VERIFY_INTERVAL_MS,
} from './config';

const IDENTITY_NAMES_KEY = 'deepface_registered_identities';

function getPageFromHash() {
  if (window.location.hash === '#/monitor') {
    return 'monitor';
  }
  if (window.location.hash === '#/unverified') {
    return 'unverified';
  }
  return 'home';
}

function App() {
  const runId = getRunId();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const verifyInFlightRef = useRef(false);
  const autoSaveLimitReachedRef = useRef(false);

  const [page, setPage] = useState(getPageFromHash());
  const [showOnlyUnverified, setShowOnlyUnverified] = useState(false);

  const [base64Image, setBase64Image] = useState('');
  const [isVerified, setIsVerified] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [lastDecision, setLastDecision] = useState(null);

  const [isAnalyzed, setIsAnalyzed] = useState(null);
  const [analysis, setAnalysis] = useState([]);

  const [registeredIdentities, setRegisteredIdentities] = useState([]);
  const [registerName, setRegisterName] = useState('');
  const [registerStatus, setRegisterStatus] = useState(null);
  const [registerMessage, setRegisterMessage] = useState('');

  const [unverifiedImages, setUnverifiedImages] = useState([]);
  const [pendingRegisterNames, setPendingRegisterNames] = useState({});
  const [unverifiedLoading, setUnverifiedLoading] = useState(false);
  const [runSaveCount, setRunSaveCount] = useState(0);
  const [autoSaveLimitReached, setAutoSaveLimitReached] = useState(false);
  const [autoMonitoring, setAutoMonitoring] = useState(AUTO_VERIFY_INTERVAL_MS > 0);

  useEffect(() => {
    const onHashChange = () => {
      setPage(getPageFromHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const fetchUnverifiedImages = useCallback(async () => {
    setUnverifiedLoading(true);
    try {
      const response = await fetch(
        `${serviceEndpoint}/unverified?run_id=${encodeURIComponent(runId)}`,
        { headers: getAuthHeaders() }
      );
      const data = await response.json();

      if (response.status !== 200) {
        console.error(data.error || data);
        return;
      }

      setUnverifiedImages(data.results || []);
      setRunSaveCount(data.run_count ?? (data.results || []).length);
      const limitReached =
        (data.run_count ?? (data.results || []).length) >= MAX_UNVERIFIED_PER_RUN;
      setAutoSaveLimitReached(limitReached);
      autoSaveLimitReachedRef.current = limitReached;
    } catch (error) {
      console.error('Exception while loading unverified images:', error);
    } finally {
      setUnverifiedLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(IDENTITY_NAMES_KEY);
      if (stored) {
        setRegisteredIdentities(JSON.parse(stored));
      }
    } catch (storageError) {
      console.error('Error loading registered identity names:', storageError);
    }

    fetchUnverifiedImages();
  }, [fetchUnverifiedImages]);

  const addUnverifiedImage = async (dataUrl, verifyContext = null) => {
    if (autoSaveLimitReachedRef.current) {
      return { limitReached: true };
    }

    try {
      const response = await fetch(`${serviceEndpoint}/unverified`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          img: dataUrl,
          run_id: runId,
          detector_backend: faceDetector,
          anti_spoofing: antiSpoofing,
          verify_context: verifyContext,
        }),
      });
      const data = await response.json();

      if (response.status === 429 || data.limit_reached) {
        autoSaveLimitReachedRef.current = true;
        setAutoSaveLimitReached(true);
        setRunSaveCount(MAX_UNVERIFIED_PER_RUN);
        return { limitReached: true };
      }

      if (response.status !== 200) {
        console.error(data.error || data);
        return { limitReached: false };
      }

      setRunSaveCount(data.run_count ?? runSaveCount + 1);
      const nextCount = data.run_count ?? runSaveCount + 1;
      if (nextCount >= MAX_UNVERIFIED_PER_RUN) {
        autoSaveLimitReachedRef.current = true;
        setAutoSaveLimitReached(true);
      }

      const preview = data.preview || data.img || dataUrl;
      setUnverifiedImages((prev) => {
        const withoutDuplicate = prev.filter((item) => item.id !== data.id);
        return [
          {
            id: data.id,
            img: preview,
            preview,
            analysis: data.analysis,
            created_at: data.created_at || new Date().toISOString(),
            run_id: runId,
            verify_context: data.verify_context || verifyContext,
          },
          ...withoutDuplicate,
        ];
      });

      await fetchUnverifiedImages();
      return { limitReached: false };
    } catch (error) {
      console.error('Exception while saving unverified image:', error);
      return { limitReached: false };
    }
  };

  const removeUnverifiedImage = async (id) => {
    try {
      const response = await fetch(`${serviceEndpoint}/unverified/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (response.status !== 200) {
        const data = await response.json();
        console.error(data.error || data);
        return;
      }

      setUnverifiedImages((prev) => prev.filter((img) => img.id !== id));
      setRunSaveCount((prev) => {
        const next = Math.max(0, prev - 1);
        const limitReached = next >= MAX_UNVERIFIED_PER_RUN;
        autoSaveLimitReachedRef.current = limitReached;
        setAutoSaveLimitReached(limitReached);
        return next;
      });
      setPendingRegisterNames((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (error) {
      console.error('Exception while deleting unverified image:', error);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return undefined;
    }

    const getVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        await video.play();
      } catch (err) {
        console.error('Error accessing webcam: ', err);
      }
    };
    getVideo();
  }, [page]);

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video?.videoWidth || !canvas) {
      return '';
    }

    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  };

  const applyVerifyResult = useCallback(
    async (base64Img, data, { autoSave = false, updateStatus = true } = {}) => {
      const matches = data.results?.[0] || [];

      if (matches.length > 0) {
        const top = matches[0];
        const verified = top.distance <= top.threshold;
        const decision = {
          decision: verified ? 'verified' : 'not_verified',
          identity: top.img_name,
          distance: top.distance,
          threshold: top.threshold,
          confidence: top.confidence,
          distanceMetric: top.distance_metric || distanceMetric,
        };

        if (updateStatus) {
          setIsVerified(verified);
          setIsAnalyzed(false);
          setIdentity(verified ? top.img_name : null);
          setLastDecision(decision);
        }

        if (!verified && autoSave && !autoSaveLimitReachedRef.current) {
          await addUnverifiedImage(base64Img, {
            nearest_matches: matches.slice(0, 3).map((match) => ({
              identity: match.img_name,
              distance: match.distance,
              threshold: match.threshold,
              confidence: match.confidence,
            })),
            decision: 'not_verified',
          });
        }
        return decision;
      }

      const decision = {
        decision: 'not_verified',
        identity: null,
        distance: null,
        threshold: null,
        confidence: null,
        reason: 'no_match_within_threshold',
      };

      if (updateStatus) {
        setIsVerified(false);
        setIdentity(null);
        setLastDecision(decision);
      }

      if (autoSave && !autoSaveLimitReachedRef.current) {
        await addUnverifiedImage(base64Img, {
          nearest_matches: [],
          decision: 'not_verified',
          reason: 'no_match_within_threshold',
        });
      }
      return decision;
    },
    [runId, runSaveCount]
  );

  const verify = async (base64Image, { autoSave = false, updateStatus = true } = {}) => {
    try {
      const response = await fetch(`${serviceEndpoint}/search`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          model_name: facialRecognitionModel,
          detector_backend: faceDetector,
          distance_metric: distanceMetric,
          img: base64Image,
          enforce_detection: false,
          align: true,
          anti_spoofing: antiSpoofing,
          k: 3,
          run_id: runId,
        }),
      });

      const data = await response.json();

      if (response.status !== 200) {
        console.error(data.error || data);
        if (updateStatus) {
          setIsVerified(false);
        }
        if (autoSave && !autoSaveLimitReachedRef.current) {
          await addUnverifiedImage(base64Image);
        }
        return null;
      }

      return applyVerifyResult(base64Image, data, { autoSave, updateStatus });
    } catch (error) {
      console.error('Exception while verifying image:', error);
      if (updateStatus) {
        setIsVerified(false);
      }
      if (autoSave && !autoSaveLimitReachedRef.current) {
        await addUnverifiedImage(base64Image);
      }
      return null;
    }
  };

  const runAutoVerify = useCallback(async () => {
    if (!autoMonitoring || verifyInFlightRef.current || autoSaveLimitReachedRef.current) {
      return;
    }

    const frame = captureFrame();
    if (!frame) {
      return;
    }

    verifyInFlightRef.current = true;
    setBase64Image(frame);
    await verify(frame, { autoSave: true, updateStatus: true });
    verifyInFlightRef.current = false;
  }, [autoMonitoring]);

  useEffect(() => {
    if (page !== 'home' || !autoMonitoring || AUTO_VERIFY_INTERVAL_MS <= 0) {
      return undefined;
    }

    const interval = setInterval(runAutoVerify, AUTO_VERIFY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [page, autoMonitoring, runAutoVerify]);

  const captureImage = (task) => {
    setIsVerified(null);
    setIdentity(null);
    setLastDecision(null);
    if (task !== 'register') {
      setRegisterStatus(null);
      setRegisterMessage('');
    }

    const base64Img = captureFrame();
    setBase64Image(base64Img);

    if (!base64Img) {
      return;
    }

    if (task === 'verify') {
      verify(base64Img, { autoSave: true, updateStatus: true });
    } else if (task === 'analyze') {
      analyze(base64Img);
    } else if (task === 'register') {
      register(base64Img, registerName.trim());
    }
  };

  const register = async (imageData, identityName, unverifiedId = null) => {
    const name = identityName.trim();
    if (!name) {
      setRegisterStatus('error');
      setRegisterMessage('Enter an identity name');
      return false;
    }

    try {
      const response = await fetch(`${serviceEndpoint}/register`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          model_name: facialRecognitionModel,
          detector_backend: faceDetector,
          img: imageData,
          img_name: name,
          enforce_detection: false,
          align: true,
          anti_spoofing: antiSpoofing,
          run_id: runId,
        }),
      });

      const data = await response.json();

      if (response.status !== 200) {
        console.error(data.error || data);
        setRegisterStatus('error');
        setRegisterMessage(
          data.error || 'Registration failed. Is Postgres running and configured on the API?'
        );
        return false;
      }

      const updated = [...new Set([...registeredIdentities, name])];
      setRegisteredIdentities(updated);
      localStorage.setItem(IDENTITY_NAMES_KEY, JSON.stringify(updated));

      if (unverifiedId) {
        await removeUnverifiedImage(unverifiedId);
      }

      setIsVerified(null);
      setIsAnalyzed(null);
      setRegisterStatus('success');
      setRegisterMessage('');
      setRegisterName(name);
      return true;
    } catch (error) {
      console.error('Exception while registering image:', error);
      setRegisterStatus('error');
      setRegisterMessage('Could not reach DeepFace API');
      return false;
    }
  };

  const registerUnverified = async (id) => {
    const image = unverifiedImages.find((img) => img.id === id);
    let name = (pendingRegisterNames[id] || '').trim();
    if (!name && image) {
      name = suggestNameFromAnalysis(image);
    }
    if (!image) {
      return;
    }
    await register(image.img, name, id);
  };

  const registerUnverifiedBulk = async (ids, bulkBaseName) => {
    let success = 0;
    let failed = 0;

    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const image = unverifiedImages.find((img) => img.id === id);
      if (!image) {
        failed += 1;
        continue;
      }

      let name = (pendingRegisterNames[id] || '').trim();
      if (!name) {
        name = suggestNameFromAnalysis(image);
      }
      if (bulkBaseName) {
        name = ids.length > 1 ? `${bulkBaseName}_${index + 1}` : bulkBaseName;
      }

      const ok = await register(image.img, name, id);
      if (ok) {
        success += 1;
      } else {
        failed += 1;
      }
    }

    return { success, failed };
  };

  const analyze = async (base64Image) => {
    const result = [];
    setIsAnalyzed(false);
    try {
      const response = await fetch(`${serviceEndpoint}/analyze`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          detector_backend: faceDetector,
          align: true,
          img: base64Image,
          enforce_detection: false,
          anti_spoofing: antiSpoofing,
          run_id: runId,
        }),
      });

      const data = await response.json();

      if (response.status !== 200) {
        console.log(data.error);
        return;
      }

      for (const instance of data.results) {
        const summary = `${instance.age} years old ${instance.dominant_race} ${instance.dominant_gender} with ${instance.dominant_emotion} mood.`;
        result.push(summary);
      }

      if (result.length > 0) {
        setIsAnalyzed(true);
        setIsVerified(null);
        setAnalysis(result);
      }
    } catch (error) {
      console.error('Exception while analyzing image:', error);
    }
    return result;
  };

  if (page === 'monitor') {
    return <MonitorPage />;
  }

  if (page === 'unverified') {
    return (
      <UnverifiedPage
        pendingRegisterNames={pendingRegisterNames}
        setPendingRegisterNames={setPendingRegisterNames}
        onRegister={registerUnverified}
        onRemove={removeUnverifiedImage}
        onBulkRegister={registerUnverifiedBulk}
      />
    );
  }

  const cameraVisible = !showOnlyUnverified;

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <a href="#" className={!showOnlyUnverified ? 'active' : ''}>
          Camera
        </a>
        <a href="#/unverified">
          Unverified <span className="nav-badge">{runSaveCount}</span>
        </a>
        <a href="#/monitor">Monitor</a>
      </nav>

      <header className="app-hero">
        <h1>DeepFace</h1>
        <p className="app-subtitle">Facial recognition &amp; attribute analysis</p>
        <p className="run-info">
          Run {runId.slice(0, 8)}… · auto-saved unverified {runSaveCount}/{MAX_UNVERIFIED_PER_RUN}
        </p>
      </header>

      <div className="view-toggle">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={showOnlyUnverified}
            onChange={(e) => setShowOnlyUnverified(e.target.checked)}
          />
          Show unverified only
        </label>
      </div>

      {autoSaveLimitReached && (
        <p className="limit-notice">
          Unverified screenshot limit reached for this run. Register or remove images to continue.
        </p>
      )}

      {cameraVisible && isVerified === true && (
        <p className="status-banner status-banner--success">Verified. Welcome {identity}</p>
      )}
      {cameraVisible && isVerified === false && (
        <p className="status-banner status-banner--error">Not verified</p>
      )}
      {cameraVisible &&
        lastDecision &&
        lastDecision.distance !== null &&
        lastDecision.distance !== undefined && (
        <p className="decision-detail">
          distance {lastDecision.distance.toFixed(4)} / threshold{' '}
          {lastDecision.threshold.toFixed(4)}
          {lastDecision.confidence !== null && lastDecision.confidence !== undefined
            ? ` · confidence ${lastDecision.confidence.toFixed(1)}%`
            : ''}
        </p>
      )}
      {cameraVisible && isAnalyzed === true && (
        <p className="status-banner status-banner--info">{analysis.join(' · ')}</p>
      )}
      {registerStatus === 'success' && (
        <p className="status-banner status-banner--success">
          Registered {registerName.trim()} in database
        </p>
      )}
      {registerStatus === 'error' && (
        <p className="status-banner status-banner--error">
          {registerMessage || 'Could not register'}
        </p>
      )}

      <div className={`home-layout${showOnlyUnverified ? ' home-layout--full' : ''}`}>
        {cameraVisible && (
          <section className="camera-panel card">
            <div className="panel-body camera-controls">
              <div className="video-frame">
                <video ref={videoRef} muted playsInline />
              </div>

              <div className="toggle-row">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={autoMonitoring}
                    onChange={(e) => setAutoMonitoring(e.target.checked)}
                  />
                  Auto-verify every {AUTO_VERIFY_INTERVAL_MS / 1000}s
                </label>
              </div>

              <div className="control-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => captureImage('verify')}
                >
                  Verify now
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => captureImage('analyze')}
                >
                  Analyze
                </button>
              </div>

              <div className="register-row">
                <input
                  type="text"
                  placeholder="Identity name"
                  value={registerName}
                  onChange={(e) => {
                    setRegisterName(e.target.value);
                    setRegisterStatus(null);
                    setRegisterMessage('');
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => captureImage('register')}
                >
                  Register
                </button>
              </div>

              {registeredIdentities.length > 0 && (
                <div className="identity-tags">
                  {registeredIdentities.map((name) => (
                    <span key={name} className="identity-tag">
                      {name}
                    </span>
                  ))}
                </div>
              )}

              <canvas ref={canvasRef} style={{ display: 'none' }} />
              {base64Image && (
                <div className="captured-preview">
                  <img src={base64Image} alt="Captured frame" />
                </div>
              )}
            </div>
          </section>
        )}

        {!cameraVisible && <canvas ref={canvasRef} style={{ display: 'none' }} />}

        {(showOnlyUnverified || unverifiedImages.length > 0 || runSaveCount > 0) && (
          <UnverifiedList
            images={unverifiedImages}
            loading={unverifiedLoading}
            runSaveCount={runSaveCount}
            pendingRegisterNames={pendingRegisterNames}
            setPendingRegisterNames={setPendingRegisterNames}
            onRegister={registerUnverified}
            onRemove={removeUnverifiedImage}
            onBulkRegister={registerUnverifiedBulk}
            emptyMessage="No unverified screenshots in this run yet."
          />
        )}
      </div>

      <VoicePanel
        registeredIdentities={registeredIdentities}
        onIdentityRegistered={setRegisteredIdentities}
      />
    </div>
  );
}

export default App;
