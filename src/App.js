import React, { useRef, useEffect, useState } from 'react';

const IDENTITY_NAMES_KEY = 'deepface_registered_identities';

function App() {
  const facialRecognitionModel = process.env.REACT_APP_FACE_RECOGNITION_MODEL || "Facenet";
  const faceDetector = process.env.REACT_APP_DETECTOR_BACKEND || "opencv";
  const distanceMetric = process.env.REACT_APP_DISTANCE_METRIC || "cosine";

  const serviceEndpoint = process.env.REACT_APP_SERVICE_ENDPOINT;
  const antiSpoofing = process.env.REACT_APP_ANTI_SPOOFING === "1";

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [base64Image, setBase64Image] = useState('');

  const [isVerified, setIsVerified] = useState(null);
  const [identity, setIdentity] = useState(null);

  const [isAnalyzed, setIsAnalyzed] = useState(null);
  const [analysis, setAnalysis] = useState([]);

  const [registeredIdentities, setRegisteredIdentities] = useState([]);

  const [registerName, setRegisterName] = useState('');
  const [registerStatus, setRegisterStatus] = useState(null);
  const [registerMessage, setRegisterMessage] = useState('');

  const getAuthHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    const token = process.env.REACT_APP_AUTH_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(IDENTITY_NAMES_KEY);
      if (stored) {
        setRegisteredIdentities(JSON.parse(stored));
      }
    } catch (storageError) {
      console.error('Error loading registered identity names:', storageError);
    }
  }, []);

  useEffect(() => {
    let video = videoRef.current;
    if (video) {
      const getVideo = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          video.srcObject = stream;
          await video.play();
        } catch (err) {
          console.error("Error accessing webcam: ", err);
        }
      };
      getVideo();
    }
  }, []);

  const captureImage = (task) => {
    setIsVerified(null);
    setIdentity(null);
    if (task !== 'register') {
      setRegisterStatus(null);
      setRegisterMessage('');
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64Img = canvas.toDataURL('image/png');
    setBase64Image(base64Img);

    if (!base64Img) {
      return;
    }

    if (task === "verify") {
      verify(base64Img);
    } else if (task === "analyze") {
      analyze(base64Img);
    } else if (task === "register") {
      register(base64Img);
    }
  };

  const register = async (base64Image) => {
    const identityName = registerName.trim();
    if (!identityName) {
      setRegisterStatus('error');
      setRegisterMessage('Enter an identity name');
      return;
    }

    try {
      const response = await fetch(`${serviceEndpoint}/register`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          model_name: facialRecognitionModel,
          detector_backend: faceDetector,
          img: base64Image,
          img_name: identityName,
          enforce_detection: false,
          align: true,
          anti_spoofing: antiSpoofing,
        }),
      });

      const data = await response.json();

      if (response.status !== 200) {
        console.error(data.error || data);
        setRegisterStatus('error');
        setRegisterMessage(
          data.error || 'Registration failed. Is Postgres running and configured on the API?'
        );
        return;
      }

      const updated = [...new Set([...registeredIdentities, identityName])];
      setRegisteredIdentities(updated);
      localStorage.setItem(IDENTITY_NAMES_KEY, JSON.stringify(updated));

      setIsVerified(null);
      setIsAnalyzed(null);
      setRegisterStatus('success');
      setRegisterMessage('');
    } catch (error) {
      console.error('Exception while registering image:', error);
      setRegisterStatus('error');
      setRegisterMessage('Could not reach DeepFace API');
    }
  };

  const verify = async (base64Image) => {
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
          k: 1,
        }),
      });

      const data = await response.json();

      if (response.status !== 200) {
        console.error(data.error || data);
        setIsVerified(false);
        return;
      }

      const matches = data.results?.[0] || [];
      if (matches.length > 0) {
        setIsVerified(true);
        setIsAnalyzed(false);
        setIdentity(matches[0].img_name);
      } else {
        setIsVerified(false);
      }
    } catch (error) {
      console.error('Exception while verifying image:', error);
      setIsVerified(false);
    }
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
        }),
      });

      const data = await response.json();

      if (response.status !== 200) {
        console.log(data.error);
        return;
      }

      for (const instance of data.results) {
        const summary = `${instance.age} years old ${instance.dominant_race} ${instance.dominant_gender} with ${instance.dominant_emotion} mood.`;
        console.log(summary);
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
        color: 'white'
      }}
    >
      <header className="App-header">
        <h1>DeepFace React App</h1>
        {isVerified === true && <p style={{ color: 'green' }}>Verified. Welcome {identity}</p>}
        {isVerified === false && <p style={{ color: 'red' }}>Not Verified</p>}
        {isAnalyzed === true && <p style={{ color: 'green' }}>{analysis.join()}</p>}
        {registerStatus === 'success' && (
          <p style={{ color: 'green' }}>Registered {registerName.trim()} in database</p>
        )}
        {registerStatus === 'error' && (
          <p style={{ color: 'red' }}>{registerMessage || 'Could not register'}</p>
        )}
        <video ref={videoRef} style={{ width: '100%', maxWidth: '500px' }} />
        <br></br><br></br>
        <button onClick={() => captureImage('verify')}>Verify</button>
        <button onClick={() => captureImage('analyze')}>Analyze</button>
        <br></br><br></br>
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
        <br></br><br></br>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {base64Image && <img src={base64Image} alt="Captured frame" style={{ maxWidth: '200px' }} />}
      </header>
    </div>
  );
}

export default App;
