export const serviceEndpoint = import.meta.env.REACT_APP_SERVICE_ENDPOINT;
export const facialRecognitionModel =
  import.meta.env.REACT_APP_FACE_RECOGNITION_MODEL || 'Facenet';
export const faceDetector = import.meta.env.REACT_APP_DETECTOR_BACKEND || 'opencv';
export const distanceMetric = import.meta.env.REACT_APP_DISTANCE_METRIC || 'cosine';
export const antiSpoofing = import.meta.env.REACT_APP_ANTI_SPOOFING === '1';

export const MAX_UNVERIFIED_PER_RUN = 20;
export const AUTO_VERIFY_INTERVAL_MS = parseInt(
  import.meta.env.REACT_APP_AUTO_VERIFY_INTERVAL_MS || '3000',
  10
);

export const RUN_ID_KEY = 'deepface_run_id';

export function getRunId() {
  let runId = sessionStorage.getItem(RUN_ID_KEY);
  if (!runId) {
    runId = crypto.randomUUID();
    sessionStorage.setItem(RUN_ID_KEY, runId);
  }
  return runId;
}

export function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = import.meta.env.REACT_APP_AUTH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
