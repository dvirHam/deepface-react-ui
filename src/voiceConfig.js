export const voiceServiceEndpoint =
  process.env.REACT_APP_VOICE_SERVICE_ENDPOINT || 'http://localhost:5006';
export const voiceLanguage = process.env.REACT_APP_VOICE_LANGUAGE || 'he';

export const UNVERIFIED_AUDIO_KEY = 'deepface_unverified_audio';

export function getVoiceAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = process.env.REACT_APP_VOICE_AUTH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function formatApiError(data) {
  const detail = data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || JSON.stringify(item)).join('; ');
  }
  return detail || data?.error || 'Request failed';
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
