import React, { useRef, useEffect, useState, useCallback } from 'react';
import './App.css';
import MonitorPage from './MonitorPage';
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

function App() {
  const runId = getRunId();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const verifyInFlightRef = useRef(false);
  const autoSaveLimitReachedRef = useRef(false);

  const [page, setPage] = useState(window.location.hash === '#/monitor' ? 'monitor' : 'home');

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
      setPage(window.location.hash === '#/monitor' ? 'monitor' : 'home');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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
  }, []);

  const fetchUnverifiedImages = async () => {
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
  };

  const addUnverifiedImage = async (dataUrl) => {
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
          await addUnverifiedImage(base64Img);
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
        await addUnverifiedImage(base64Img);
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
    const name = (pendingRegisterNames[id] || '').trim();
    if (!image) {
      return;
    }
    await register(image.img, name, id);
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

  return (
    <div
      className="App"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        textAlign: 'center',
        backgroundColor: '#282c34',
        color: 'white',
      }}
    >
      <header className="App-header">
        <nav className="app-nav">
          <a href="#" className="active">
            Camera
          </a>
          <a href="#/monitor">Monitor</a>
        </nav>

        <h1>DeepFace React App</h1>
        <p className="run-info">
          Run {runId.slice(0, 8)}… · auto-saved unverified {runSaveCount}/{MAX_UNVERIFIED_PER_RUN}
        </p>

        {autoSaveLimitReached && (
          <p className="limit-notice">
            Unverified screenshot limit reached for this run. Register or remove images to continue.
          </p>
        )}

        {isVerified === true && <p style={{ color: 'green' }}>Verified. Welcome {identity}</p>}
        {isVerified === false && <p style={{ color: 'red' }}>Not Verified</p>}
        {lastDecision && lastDecision.distance !== null && lastDecision.distance !== undefined && (
          <p className="decision-detail">
            distance {lastDecision.distance.toFixed(4)} / threshold{' '}
            {lastDecision.threshold.toFixed(4)}
            {lastDecision.confidence !== null && lastDecision.confidence !== undefined
              ? ` · confidence ${lastDecision.confidence.toFixed(1)}%`
              : ''}
          </p>
        )}
        {isAnalyzed === true && <p style={{ color: 'green' }}>{analysis.join()}</p>}
        {registerStatus === 'success' && (
          <p style={{ color: 'green' }}>Registered {registerName.trim()} in database</p>
        )}
        {registerStatus === 'error' && (
          <p style={{ color: 'red' }}>{registerMessage || 'Could not register'}</p>
        )}

        <video ref={videoRef} style={{ width: '100%', maxWidth: '500px' }} />
        <br />
        <br />
        <label className="auto-toggle">
          <input
            type="checkbox"
            checked={autoMonitoring}
            onChange={(e) => setAutoMonitoring(e.target.checked)}
          />
          Auto-verify every {AUTO_VERIFY_INTERVAL_MS / 1000}s (saves unverified on failure)
        </label>
        <br />
        <br />
        <button onClick={() => captureImage('verify')}>Verify now</button>
        <button onClick={() => captureImage('analyze')}>Analyze</button>
        <br />
        <br />
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="Identity name"
            value={registerName}
            onChange={(e) => {
              setRegisterName(e.target.value);
              setRegisterStatus(null);
              setRegisterMessage('');
            }}
            style={{ padding: '0.5rem', marginRight: '0.5rem' }}
          />
          <button onClick={() => captureImage('register')}>Register</button>
        </div>
        {registeredIdentities.length > 0 && (
          <p style={{ fontSize: '0.9rem', color: '#aaa' }}>
            Registered identities: {registeredIdentities.join(', ')}
          </p>
        )}
        <br />
        <br />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {base64Image && (
          <img src={base64Image} alt="Captured frame" style={{ maxWidth: '200px' }} />
        )}

        {unverifiedLoading && <p className="unverified-hint">Loading unverified images...</p>}

        {!unverifiedLoading && (unverifiedImages.length > 0 || runSaveCount > 0) && (
          <section className="unverified-section">
            <h2>Unverified Images ({unverifiedImages.length || runSaveCount})</h2>
            <p className="unverified-hint">
              Failed auto-verifications are saved automatically (max {MAX_UNVERIFIED_PER_RUN} per
              run). Each entry shows a screenshot preview plus age/gender/emotion analysis.
            </p>
            <ul className="unverified-grid">
              {unverifiedImages.map((image) => {
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
                    <button type="button" onClick={() => registerUnverified(image.id)}>
                      Register
                    </button>
                    <button type="button" onClick={() => removeUnverifiedImage(image.id)}>
                      Remove
                    </button>
                  </div>
                </li>
                );
              })}
            </ul>
          </section>
        )}
      </header>
    </div>
  );
}

export default App;
