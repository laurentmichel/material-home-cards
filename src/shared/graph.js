// Courbes d'historique : lissage et regroupement par tranches, communs aux cartes graphiques.

const GRAPH_BUCKETS = 60;

// Courbe monotone (Fritsch-Carlson) : lisse sans dépasser les valeurs réelles entre deux points.
function monotonePath(points) {
  const n = points.length;
  if (n < 2) return '';
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1][0] - points[i][0]);
    m.push((points[i + 1][1] - points[i][1]) / (dx[i] || 1));
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1], h = dx[i] / 3;
    d += ` C${x0 + h},${y0 + t[i] * h} ${x1 - h},${y1 - t[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

// Moyenne par tranche de temps ; une tranche sans mesure reprend la dernière valeur connue.
function bucketize(samples, start, end) {
  const size = (end - start) / GRAPH_BUCKETS;
  const sums = new Array(GRAPH_BUCKETS).fill(0), counts = new Array(GRAPH_BUCKETS).fill(0);
  let before;
  for (const { t, v } of samples) {
    if (t < start) { before = v; continue; }
    const i = Math.min(GRAPH_BUCKETS - 1, Math.floor((t - start) / size));
    sums[i] += v; counts[i]++;
  }
  const out = [];
  let last = before;
  for (let i = 0; i < GRAPH_BUCKETS; i++) {
    if (counts[i]) last = sums[i] / counts[i];
    out.push(last);
  }
  return out;
}
