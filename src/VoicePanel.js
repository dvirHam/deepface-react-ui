import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  voiceServiceEndpoint,
  voiceLanguage,
  UNVERIFIED_AUDIO_KEY,
  getVoiceAuthHeaders,
  blobToBase64,
  formatApiError,
} from './voiceConfig';

const IDENTITY_NAMES_KEY = 'deepface_registered_identities';

function VoicePanel({ registeredIdentities, onIdentityRegistered }) {
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [isVerified, setIsVerified] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [lastDecision, setLastDecision] = useState(null);

  const [registerName, setRegisterName] = useState('');
  const [registerStatus, setRegisterStatus] = useState(null);
  const [registerMessage, setRegisterMessage] = useState('');

  const [unverifiedAudio, setUnverifiedAudio] = useState([]);
  const [pendingRegisterNames, setPendingRegisterNames] = useState({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(UNVERIFIED_AUDIO_KEY);
      if (stored) {
        setUnverifiedAudio(JSON.parse(stored));
      }
    } catch (storageError) {
      console.error('Error loading unverified audio:', storageError);
    }
  }, []);

  const persistUnverifiedAudio = useCallback((itemsOrUpdater) => {
    setUnverifiedAudio((prev) => {
      const items =
        typeof itemsOrUpdater === 'function' ? itemsOrUpdater(prev) : itemsOrUpdater;
      localStorage.setItem(UNVERIFIED_AUDIO_KEY, JSON.stringify(items));
      return items;
    });
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    stopStream();
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
  }, [stopStream, recordedUrl]);

  const startRecording = async () => {
    setError('');
    setRegisterStatus(null);
    setRegisterMessage('');
    setIsVerified(null);
    setIdentity(null);
    setTranscript('');
    setLastDecision(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        if (recordedUrl) {
          URL.revokeObjectURL(recordedUrl);
        }
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        stopStream();
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone error:', err);
      setError('Could not access microphone. Check browser permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const addUnverifiedAudio = (blob, probeTranscript = '') => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      mimeType: blob.type || 'audio/webm',
      dataUrl: '',
      capturedAt: new Date().toISOString(),
      transcript: probeTranscript,
    };

    blobToBase64(blob).then((dataUrl) => {
      entry.dataUrl = dataUrl;
      persistUnverifiedAudio((prev) => [entry, ...prev]);
    });
  };

  const removeUnverifiedAudio = (id) => {
    persistUnverifiedAudio((prev) => prev.filter((item) => item.id !== id));
    setPendingRegisterNames((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const dataUrlToBlob = async (dataUrl) => {
    const response = await fetch(dataUrl);
    return response.blob();
  };

  const registerVoice = async (blob, identityName, unverifiedId = null) => {
    const name = identityName.trim();
    if (!name) {
      setRegisterStatus('error');
      setRegisterMessage('Enter an identity name');
      return false;
    }

    setLoading(true);
    setError('');
    try {
      const audio = await blobToBase64(blob);
      const response = await fetch(`${voiceServiceEndpoint}/voice/register`, {
        method: 'POST',
        headers: getVoiceAuthHeaders(),
        body: JSON.stringify({
          audio,
          identity_name: name,
          language: voiceLanguage,
        }),
      });
      const data = await response.json();

      if (response.status !== 200) {
        setRegisterStatus('error');
        setRegisterMessage(formatApiError(data));
        return false;
      }

      setTranscript(data.transcript || '');
      setRegisterStatus('success');
      setRegisterMessage('');
      setRegisterName(name);
      setIsVerified(null);

      const updated = [...new Set([...registeredIdentities, name])];
      localStorage.setItem(IDENTITY_NAMES_KEY, JSON.stringify(updated));
      onIdentityRegistered?.(updated);

      if (unverifiedId) {
        removeUnverifiedAudio(unverifiedId);
      }
      return true;
    } catch (err) {
      console.error('Voice register error:', err);
      setRegisterStatus('error');
      setRegisterMessage('Could not reach Voice API');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const verifyVoice = async (blob) => {
    setLoading(true);
    setError('');
    setIsVerified(null);
    setIdentity(null);
    setLastDecision(null);

    try {
      const audio = await blobToBase64(blob);
      const response = await fetch(`${voiceServiceEndpoint}/voice/search`, {
        method: 'POST',
        headers: getVoiceAuthHeaders(),
        body: JSON.stringify({
          audio,
          language: voiceLanguage,
          k: 1,
          distance_metric: 'cosine',
        }),
      });
      const data = await response.json();

      if (response.status !== 200) {
        setError(formatApiError(data));
        setIsVerified(false);
        addUnverifiedAudio(blob, data.probe_transcript || '');
        return;
      }

      const probeTranscript = data.probe_transcript || '';
      setTranscript(probeTranscript);
      const matches = data.results?.[0] || [];

      if (matches.length > 0) {
        const top = matches[0];
        setIsVerified(true);
        setIdentity(top.identity_name);
        setLastDecision({
          distance: top.distance,
          threshold: top.threshold,
          confidence: top.confidence,
        });
      } else {
        setIsVerified(false);
        setIdentity(null);
        setLastDecision({ reason: 'no_match_within_threshold' });
        addUnverifiedAudio(blob, probeTranscript);
      }
    } catch (err) {
      console.error('Voice verify error:', err);
      setError('Could not reach Voice API');
      setIsVerified(false);
      addUnverifiedAudio(blob);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = () => {
    if (!recordedBlob) {
      setError('Record audio first');
      return;
    }
    verifyVoice(recordedBlob);
  };

  const handleRegister = () => {
    if (!recordedBlob) {
      setError('Record audio first');
      return;
    }
    registerVoice(recordedBlob, registerName);
  };

  const registerUnverified = async (id) => {
    const item = unverifiedAudio.find((entry) => entry.id === id);
    const name = (pendingRegisterNames[id] || '').trim();
    if (!item?.dataUrl) {
      return;
    }
    const blob = await dataUrlToBlob(item.dataUrl);
    await registerVoice(blob, name, id);
  };

  return (
    <section className="voice-section">
      <h2>Voice (Hebrew)</h2>
      <p className="voice-hint">
        Record at least 2 seconds of Hebrew speech, then verify or register.
      </p>

      {error && <p className="voice-error">{error}</p>}
      {loading && <p className="voice-loading">Processing audio…</p>}

      {isVerified === true && (
        <p className="voice-verified">Verified. Welcome {identity}</p>
      )}
      {isVerified === false && <p className="voice-rejected">Not Verified</p>}
      {lastDecision?.distance !== undefined && (
        <p className="decision-detail">
          distance {lastDecision.distance.toFixed(4)} / threshold{' '}
          {lastDecision.threshold.toFixed(4)}
          {lastDecision.confidence !== undefined
            ? ` · confidence ${lastDecision.confidence.toFixed(1)}%`
            : ''}
        </p>
      )}
      {registerStatus === 'success' && (
        <p className="voice-verified">Registered {registerName.trim()} voice</p>
      )}
      {registerStatus === 'error' && (
        <p className="voice-rejected">{registerMessage || 'Could not register'}</p>
      )}

      <div className="voice-controls">
        {!isRecording ? (
          <button type="button" onClick={startRecording} disabled={loading}>
            Record
          </button>
        ) : (
          <button type="button" onClick={stopRecording} className="voice-recording-btn">
            Stop
          </button>
        )}
        <button type="button" onClick={handleVerify} disabled={!recordedBlob || loading}>
          Verify voice
        </button>
      </div>

      {recordedUrl && (
        <audio ref={audioRef} src={recordedUrl} controls className="voice-playback" />
      )}

      {transcript && (
        <p className="voice-transcript" dir="rtl">
          {transcript}
        </p>
      )}

      <div className="voice-register-row">
        <input
          type="text"
          placeholder="Identity name (shared with face)"
          value={registerName}
          onChange={(e) => {
            setRegisterName(e.target.value);
            setRegisterStatus(null);
            setRegisterMessage('');
          }}
          className="voice-name-input"
        />
        <button type="button" onClick={handleRegister} disabled={!recordedBlob || loading}>
          Register voice
        </button>
      </div>

      {unverifiedAudio.length > 0 && (
        <div className="voice-unverified">
          <h3>Unverified audio ({unverifiedAudio.length})</h3>
          <p className="unverified-hint">
            Failed voice verifications are saved here. Enter a name and register each clip.
          </p>
          <ul className="voice-unverified-list">
            {unverifiedAudio.map((item) => (
              <li key={item.id} className="voice-unverified-card">
                {item.dataUrl ? (
                  <audio src={item.dataUrl} controls className="voice-playback" />
                ) : (
                  <p className="unverified-analysis-muted">Loading audio…</p>
                )}
                {item.transcript && (
                  <p className="voice-transcript-small" dir="rtl">
                    {item.transcript}
                  </p>
                )}
                <input
                  type="text"
                  placeholder="Identity name"
                  value={pendingRegisterNames[item.id] || ''}
                  onChange={(e) =>
                    setPendingRegisterNames((prev) => ({
                      ...prev,
                      [item.id]: e.target.value,
                    }))
                  }
                  className="unverified-name-input"
                />
                <div className="unverified-actions">
                  <button type="button" onClick={() => registerUnverified(item.id)}>
                    Register
                  </button>
                  <button type="button" onClick={() => removeUnverifiedAudio(item.id)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default VoicePanel;
