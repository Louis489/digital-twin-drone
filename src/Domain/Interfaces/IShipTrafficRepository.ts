import type { Ship } from '../Entities/Ship';

export type ShipUpdateCallback = (ships: Map<string, Ship>) => void;

/**
 * Contrat pour un flux de données de trafic maritime (WebSocket AIS).
 * L'implémentation gère la connexion, le parsing et le batching des messages.
 */
export interface IShipTrafficRepository {
  /**
   * Ouvre la connexion au flux AIS.
   * @param apiKey - Clé API du fournisseur (ex: AISStream.io)
   * @param boundingBoxes - Zones géographiques à surveiller [[latMin, lonMin], [latMax, lonMax]]
   */
  connect(apiKey: string, boundingBoxes?: number[][][]): Promise<void>;

  /** Ferme proprement la connexion WebSocket. */
  disconnect(): void;

  /** Enregistre le callback appelé à chaque batch de mises à jour. */
  onUpdate(callback: ShipUpdateCallback): void;

  /** Indique si la connexion WebSocket est active. */
  isConnected(): boolean;
}
