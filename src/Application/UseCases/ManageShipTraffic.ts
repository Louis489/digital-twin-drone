import { LodLevel } from '../../Domain';
import type { Ship, IShipTrafficRepository } from '../../Domain';
import { ComputeLodLevelUseCase } from './ComputeLodLevel';

export type ShipTrafficRenderCallback = (ships: Map<string, Ship>, lodLevel: LodLevel) => void;
export type ShipTrafficCountCallback = (count: number) => void;

/**
 * Orchestrateur principal du trafic maritime en temps réel.
 * - Gère le registre de navires (Map<mmsi, Ship>)
 * - Écoute les mises à jour du repository (WebSocket)
 * - Calcule le LOD courant à partir de la hauteur caméra
 * - Émet les données de rendu vers la couche Presentation
 */
export class ManageShipTrafficUseCase {
  private readonly shipRegistry: Map<string, Ship> = new Map();
  private readonly computeLod: ComputeLodLevelUseCase;
  private currentLodLevel: LodLevel = LodLevel.CLUSTER;
  private renderCallback: ShipTrafficRenderCallback | null = null;
  private countCallback: ShipTrafficCountCallback | null = null;
  private staleCheckId: number | null = null;

  /** Durée au-delà de laquelle un navire est considéré comme obsolète (5 min) */
  private static readonly STALE_THRESHOLD_MS = 5 * 60 * 1000;

  constructor(private readonly repository: IShipTrafficRepository) {
    this.computeLod = new ComputeLodLevelUseCase();
  }

  /**
   * Démarre le flux temps réel.
   * @param apiKey Clé API AISStream
   * @param onRender Callback de rendu appelé à chaque batch
   * @param onCount Callback optionnel pour le compteur UI
   */
  public async start(
    apiKey: string,
    onRender: ShipTrafficRenderCallback,
    onCount?: ShipTrafficCountCallback,
  ): Promise<void> {
    this.renderCallback = onRender;
    this.countCallback = onCount ?? null;

    this.repository.onUpdate((ships) => {
      for (const [mmsi, ship] of ships) {
        this.shipRegistry.set(mmsi, ship);
      }
      this.emitRender();
      this.countCallback?.(this.shipRegistry.size);
    });

    await this.repository.connect(apiKey);

    // Nettoyage périodique des navires obsolètes (toutes les 30s)
    this.staleCheckId = window.setInterval(() => this.pruneStaleShips(), 30_000);
  }

  /** Arrête le flux et nettoie les ressources. */
  public stop(): void {
    this.repository.disconnect();
    if (this.staleCheckId !== null) {
      window.clearInterval(this.staleCheckId);
      this.staleCheckId = null;
    }
  }

  /**
   * Appelé par la couche Presentation à chaque changement de hauteur caméra.
   * Ne déclenche un re-render que si le LOD change effectivement.
   */
  public updateCameraHeight(heightMeters: number): void {
    const newLod = this.computeLod.execute(heightMeters);
    if (newLod !== this.currentLodLevel) {
      this.currentLodLevel = newLod;
      this.emitRender();
    }
  }

  public getCurrentLodLevel(): LodLevel {
    return this.currentLodLevel;
  }

  public getShipCount(): number {
    return this.shipRegistry.size;
  }

  public isConnected(): boolean {
    return this.repository.isConnected();
  }

  private emitRender(): void {
    this.renderCallback?.(this.shipRegistry, this.currentLodLevel);
  }

  private pruneStaleShips(): void {
    const now = Date.now();
    let pruned = false;
    for (const [mmsi, ship] of this.shipRegistry) {
      if (now - ship.lastUpdate > ManageShipTrafficUseCase.STALE_THRESHOLD_MS) {
        this.shipRegistry.delete(mmsi);
        pruned = true;
      }
    }
    if (pruned) {
      this.emitRender();
      this.countCallback?.(this.shipRegistry.size);
    }
  }
}
