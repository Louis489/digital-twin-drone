import { LodLevel } from '../../Domain';

/** Seuil au-delà duquel on affiche des clusters (5 000 km) */
const LOD_THRESHOLD_CLUSTER = 5_000_000;
/** Seuil en-dessous duquel on affiche des modèles 3D (500 km) */
const LOD_THRESHOLD_MODEL = 500_000;

/**
 * Use Case pur (sans effet de bord) calculant le niveau de détail
 * à partir de la hauteur ellipsoïdale de la caméra.
 */
export class ComputeLodLevelUseCase {
  public execute(cameraHeightMeters: number): LodLevel {
    if (cameraHeightMeters > LOD_THRESHOLD_CLUSTER) {
      return LodLevel.CLUSTER;
    }
    if (cameraHeightMeters > LOD_THRESHOLD_MODEL) {
      return LodLevel.BILLBOARD;
    }
    return LodLevel.MODEL_3D;
  }
}
