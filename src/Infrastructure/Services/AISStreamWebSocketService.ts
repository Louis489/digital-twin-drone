import type { IShipTrafficRepository, ShipUpdateCallback, Ship } from '../../Domain';
import { ShipType } from '../../Domain';

const AIS_STREAM_URL = 'wss://stream.aisstream.io/v0/stream';
// Zone par défaut : La Manche (à fort trafic, compatible API gratuite)
const DEFAULT_BOUNDING_BOX = [[[48.0, -5.0], [52.0, 3.0]]];
const BATCH_INTERVAL_MS = 2000;
const RECONNECT_DELAY_MS = 5000;

/**
 * DTO brut reçu du WebSocket AISStream.io.
 * Seul le type PositionReport est traité.
 */
interface AISStreamMessage {
  MessageType: string;
  MetaData: {
    MMSI: number;
    MMSI_String: string;
    ShipName: string;
    ShipType?: unknown;
    latitude: number;
    longitude: number;
    time_utc: string;
  };
  Message: {
    PositionReport?: {
      Sog: number;
      Cog: number;
      TrueHeading: number;
      Latitude: number;
      Longitude: number;
      NavigationalStatus: number;
      ShipType?: unknown;
    };
    ShipStaticData?: {
      Type?: unknown;
      ShipType?: unknown;
      Name?: string;
    };
  };
}

/**
 * Implémentation du IShipTrafficRepository via le WebSocket AISStream.io.
 *
 * Fonctionnement :
 * 1. Ouvre une connexion WebSocket vers AISStream.
 * 2. Envoie le message d'abonnement (APIKey + BoundingBoxes).
 * 3. Parse chaque message entrant de type PositionReport.
 * 4. Accumule les mises à jour dans un batch (Map<mmsi, Ship>).
 * 5. Émet le batch toutes les BATCH_INTERVAL_MS via le callback.
 */
export class AISStreamWebSocketService implements IShipTrafficRepository {
  private socket: WebSocket | null = null;
  private callback: ShipUpdateCallback | null = null;
  private connected = false;
  private batch: Map<string, Ship> = new Map();
  private batchIntervalId: number | null = null;
  private apiKey: string | null = null;
  private boundingBoxes: number[][][] = DEFAULT_BOUNDING_BOX;
  private shouldReconnect = false;
  private shipTypesByMmsi: Map<string, ShipType> = new Map();

  public async connect(apiKey: string, boundingBoxes?: number[][][]): Promise<void> {
    this.apiKey = apiKey;
    this.boundingBoxes = boundingBoxes ?? DEFAULT_BOUNDING_BOX;
    this.shouldReconnect = true;

    return this.openSocket();
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.cleanup();
  }

  public onUpdate(callback: ShipUpdateCallback): void {
    this.callback = callback;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  // ─── Private ───────────────────────────────────────────────

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(AIS_STREAM_URL);

      this.socket.onopen = () => {
        const subscription = {
          APIKey: this.apiKey,
          BoundingBoxes: this.boundingBoxes,
          FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
        };
        this.socket!.send(JSON.stringify(subscription));
        this.connected = true;
        console.log('✅ AISStream WebSocket connecté');

        this.batchIntervalId = window.setInterval(() => this.flushBatch(), BATCH_INTERVAL_MS);
        resolve();
      };

      this.socket.onmessage = async (event: MessageEvent) => {
        try {
          let textData: string;
          if (event.data instanceof Blob) {
            textData = await event.data.text();
          } else {
            textData = event.data as string;
          }
          console.log('[AIS] 📩 Message reçu, taille:', textData.length);
          const data: AISStreamMessage = JSON.parse(textData);
          console.log('[AIS] ✅ JSON parsé — MessageType:', data.MessageType);
          this.processMessage(data);
        } catch (err) {
          console.warn('[AIS] ⚠️ Message malformé ignoré :', err);
        }
      };

      this.socket.onerror = () => {
        console.error('❌ AISStream WebSocket erreur');
        reject(new Error('AISStream WebSocket connection failed'));
      };

      this.socket.onclose = () => {
        this.connected = false;
        this.clearBatchInterval();

        if (this.shouldReconnect) {
          console.warn(`⏳ Reconnexion AISStream dans ${RECONNECT_DELAY_MS / 1000}s…`);
          window.setTimeout(() => {
            if (this.shouldReconnect) {
              this.openSocket().catch(() => {
                // La reconnexion sera retentée au prochain cycle
              });
            }
          }, RECONNECT_DELAY_MS);
        }
      };
    });
  }

  private processMessage(data: AISStreamMessage): void {
    if (data.MessageType === 'ShipStaticData' && data.Message.ShipStaticData) {
      this.processShipStaticData(data);
      return;
    }

    if (data.MessageType !== 'PositionReport' || !data.Message.PositionReport) {
      console.log('[AIS] ⏭️ MessageType ignoré :', data.MessageType);
      return;
    }
    console.log('[AIS] 🚢 PositionReport reçu — MMSI:', data.MetaData.MMSI_String, 'Batch:', this.batch.size + 1);

    const report = data.Message.PositionReport;
    const meta = data.MetaData;

    if (!AISStreamWebSocketService.isValidCoordinate(report.Latitude, report.Longitude)) {
      return;
    }

    const heading = report.TrueHeading === 511 ? report.Cog : report.TrueHeading;
    const shipName = meta.ShipName.trim() || `MMSI-${meta.MMSI_String}`;

    const ship: Ship = {
      mmsi: meta.MMSI_String,
      name: shipName,
      latitude: report.Latitude,
      longitude: report.Longitude,
      trueHeading: heading,
      cog: report.Cog,
      sog: report.Sog,
      shipType: this.resolveShipType(meta.MMSI_String, shipName, report.ShipType ?? meta.ShipType),
      navigationalStatus: report.NavigationalStatus,
      lastUpdate: Date.now(),
    };

    this.batch.set(ship.mmsi, ship);
  }

  private processShipStaticData(data: AISStreamMessage): void {
    const staticData = data.Message.ShipStaticData;
    if (!staticData) {
      return;
    }

    const mmsi = data.MetaData.MMSI_String;
    const shipType = AISStreamWebSocketService.mapAisShipType(staticData.Type ?? staticData.ShipType ?? data.MetaData.ShipType);
    this.shipTypesByMmsi.set(mmsi, shipType);
  }

  private resolveShipType(mmsi: string, shipName: string, aisType?: unknown): ShipType {
    const mappedType = AISStreamWebSocketService.mapAisShipType(aisType);
    if (mappedType !== ShipType.UNKNOWN) {
      this.shipTypesByMmsi.set(mmsi, mappedType);
      return mappedType;
    }
    const knownType = this.shipTypesByMmsi.get(mmsi);
    if (knownType) {
      return knownType;
    }
    return AISStreamWebSocketService.inferShipTypeFromName(shipName);
  }

  private flushBatch(): void {
    if (this.batch.size > 0 && this.callback) {
      console.log(`[AIS] 📤 Flush batch : ${this.batch.size} navires envoyés au UseCase`);
      this.callback(new Map(this.batch));
      this.batch.clear();
    }
  }

  private cleanup(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
    this.clearBatchInterval();
  }

  private clearBatchInterval(): void {
    if (this.batchIntervalId !== null) {
      window.clearInterval(this.batchIntervalId);
      this.batchIntervalId = null;
    }
  }

  private static isValidCoordinate(lat: number, lon: number): boolean {
    return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && lat !== 91 && lon !== 181;
  }

  private static mapAisShipType(aisType?: unknown): ShipType {
    if (aisType === undefined || aisType === null) {
      return ShipType.UNKNOWN;
    }
    if (typeof aisType === 'string') {
      const normalized = aisType.toUpperCase();
      if (normalized.includes('CARGO')) return ShipType.CARGO;
      if (normalized.includes('TANKER')) return ShipType.TANKER;
      if (normalized.includes('PASSENGER') || normalized.includes('CRUISE') || normalized.includes('FERRY')) return ShipType.PASSENGER;
      if (normalized.includes('FISH')) return ShipType.FISHING;
      if (normalized.includes('TUG')) return ShipType.TUG;
      if (normalized.includes('MILITARY') || normalized.includes('NAVAL')) return ShipType.MILITARY;
      if (normalized.includes('SAIL')) return ShipType.SAILING;
      if (normalized.includes('PLEASURE') || normalized.includes('YACHT')) return ShipType.PLEASURE;
      if (normalized.includes('HIGH') && normalized.includes('SPEED')) return ShipType.HIGH_SPEED_CRAFT;
    }
    const numericType = Number(aisType);
    if (!Number.isFinite(numericType)) {
      return ShipType.UNKNOWN;
    }
    if (numericType >= 70 && numericType <= 79) {
      return ShipType.CARGO;
    }
    if (numericType >= 80 && numericType <= 89) {
      return ShipType.TANKER;
    }
    if (numericType >= 60 && numericType <= 69) {
      return ShipType.PASSENGER;
    }
    if (numericType === 30) {
      return ShipType.FISHING;
    }
    if (numericType === 31 || numericType === 32 || numericType === 52) {
      return ShipType.TUG;
    }
    if (numericType === 35) {
      return ShipType.MILITARY;
    }
    if (numericType === 36) {
      return ShipType.SAILING;
    }
    if (numericType === 37) {
      return ShipType.PLEASURE;
    }
    if (numericType >= 40 && numericType <= 49) {
      return ShipType.HIGH_SPEED_CRAFT;
    }
    return ShipType.UNKNOWN;
  }

  private static inferShipTypeFromName(shipName: string): ShipType {
    const normalized = shipName.toUpperCase();
    if (/\b(MAERSK|MSC|CMA CGM|COSCO|EVER|HAPAG|OOCL|CONTAINER|CARGO)\b/.test(normalized)) return ShipType.CARGO;
    if (/\b(TANKER|OIL|CHEM|LNG|LPG|PETROL|CRUDE)\b/.test(normalized)) return ShipType.TANKER;
    if (/\b(FERRY|CRUISE|PRINCESS|PASSENGER)\b/.test(normalized)) return ShipType.PASSENGER;
    if (/\b(FV|FISH|PESC|TRAWLER)\b/.test(normalized)) return ShipType.FISHING;
    if (/\b(TUG|PILOT|REMORQUEUR)\b/.test(normalized)) return ShipType.TUG;
    if (/\b(HMS|NAVY|NAVAL|WARSHIP)\b/.test(normalized)) return ShipType.MILITARY;
    if (/\b(SAIL|YACHT)\b/.test(normalized)) return ShipType.SAILING;
    return ShipType.UNKNOWN;
  }
}
