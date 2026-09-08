export function suggestNameFromAnalysis(image) {
  const face = Array.isArray(image.analysis) ? image.analysis[0] : null;
  if (!face) {
    return `person_${image.id}`;
  }

  const gender = (face.dominant_gender || 'person').toLowerCase().replace(/\s+/g, '_');
  const age = face.age != null ? Math.round(face.age) : 'unknown';
  const emotion = (face.dominant_emotion || 'neutral').toLowerCase();
  return `${gender}_${age}_${emotion}`;
}

export function formatNearestMatchHint(verifyContext) {
  const matches = verifyContext?.nearest_matches;
  if (!Array.isArray(matches) || matches.length === 0) {
    return null;
  }

  const top = matches[0];
  if (!top?.identity && top?.img_name == null) {
    return 'No close match in database';
  }

  const name = top.identity || top.img_name;
  const distance =
    top.distance != null ? ` (distance ${Number(top.distance).toFixed(3)})` : '';
  const confidence =
    top.confidence != null ? ` · ${Number(top.confidence).toFixed(0)}% confidence` : '';

  return `Nearest: ${name}${distance}${confidence}`;
}
