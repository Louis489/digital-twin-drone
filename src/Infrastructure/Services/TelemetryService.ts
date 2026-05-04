export interface TelemetryPoint {
  time: number;
  x: number;
  y: number;
  z: number;
  heading: number;
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
      if (parts.length >= 5) {
        data.push({
          time: parseFloat(parts[0]),
          x: parseFloat(parts[1]),
          y: parseFloat(parts[2]),
          z: parseFloat(parts[3]),
          heading: parseFloat(parts[4]),
        });
      }
    }

    return data;
  }
}
