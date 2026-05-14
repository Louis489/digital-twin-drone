export interface TelemetryPoint {
  time: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  depth?: number;  // Profondeur pour le ROV
  temp?: number;   // Température pour l'UI
}

export class TelemetryService {
  async loadTelemetryData(url: string = './data/telemetry.csv'): Promise<TelemetryPoint[]> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load telemetry: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const lines = text.trim().split('\n');

    const data: TelemetryPoint[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length < 5) continue; // Ligne invalide

      // On s'assure de bien mapper les colonnes du CSV généré
      const depthValue = parts[5] ? parseFloat(parts[5]) : parseFloat(parts[3]); // Utilise Z si Depth absent
      const tempValue = parts[6] ? parseFloat(parts[6]) : 20.0 + Math.random(); // Fallback temp

      data.push({
        time: parseFloat(parts[0]),
        x: parseFloat(parts[1]),
        y: parseFloat(parts[2]),
        z: parseFloat(parts[3]),
        heading: parseFloat(parts[4]),
        depth: isNaN(depthValue) ? 0 : depthValue,
        temp: isNaN(tempValue) ? 20 : tempValue
      });
    }

    return data;
  }
}
