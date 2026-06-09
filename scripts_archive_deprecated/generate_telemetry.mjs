import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'telemetry.csv');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`Dossier créé: ${DATA_DIR}`);
}

const ROWS = 1000;
const DURATION_SECONDS = 300;
const AREA_SIZE = 40;

function generateTelemetry() {
  const rows = [];
  rows.push('time,x,y,z,heading');

  let prevX = 0;
  let prevZ = 0;

  for (let i = 0; i < ROWS; i++) {
    const t = i / (ROWS - 1);
    const time = (t * DURATION_SECONDS).toFixed(2);

    const mainPath = t * AREA_SIZE - AREA_SIZE / 2;
    const zigzag = Math.sin(t * Math.PI * 8) * 6;
    const x = mainPath + zigzag * 0.3;
    const z = zigzag + Math.cos(t * Math.PI * 3) * 3;

    const y = 0.5 + (1.5 + Math.sin(t * Math.PI * 6) * 0.5) * (Math.sin(t * Math.PI * 2) * 0.3 + 0.7);
    const yClamped = Math.max(0.5, Math.min(2.5, y));

    const dx = x - prevX;
    const dz = z - prevZ;
    let heading = 0;
    if (i > 0) {
      heading = Math.atan2(dx, dz);
    }
    prevX = x;
    prevZ = z;

    rows.push(`${time},${x.toFixed(3)},${yClamped.toFixed(3)},${z.toFixed(3)},${heading.toFixed(4)}`);
  }

  return rows.join('\n');
}

const csvContent = generateTelemetry();
fs.writeFileSync(OUTPUT_FILE, csvContent);

console.log(`Fichier généré: ${OUTPUT_FILE}`);
console.log(`Lignes: ${ROWS}`);
console.log(`Aperçu (5 premières lignes):`);
console.log(csvContent.split('\n').slice(0, 6).join('\n'));
