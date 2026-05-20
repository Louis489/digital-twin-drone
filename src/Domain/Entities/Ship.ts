export enum ShipType {
  CARGO = 'CARGO',
  TANKER = 'TANKER',
  PASSENGER = 'PASSENGER',
  FISHING = 'FISHING',
  TUG = 'TUG',
  MILITARY = 'MILITARY',
  SAILING = 'SAILING',
  PLEASURE = 'PLEASURE',
  HIGH_SPEED_CRAFT = 'HIGH_SPEED_CRAFT',
  UNKNOWN = 'UNKNOWN',
}

export enum LodLevel {
  /** Vue globale (dézoomé) : points simples + clustering géométrique */
  CLUSTER = 'CLUSTER',
  /** Zoom intermédiaire : billboards 2D orientés selon le cap */
  BILLBOARD = 'BILLBOARD',
  /** Zoom rapproché : modèle 3D glTF orienté */
  MODEL_3D = 'MODEL_3D',
}

export interface Ship {
  mmsi: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Cap réel du navire (0-359°, 511 = indisponible) */
  trueHeading: number;
  /** Course Over Ground en degrés */
  cog: number;
  /** Speed Over Ground en nœuds */
  sog: number;
  shipType: ShipType;
  /** IMO Navigational Status (0 = under way using engine, etc.) */
  navigationalStatus: number;
  /** Timestamp de la dernière mise à jour (ms epoch) */
  lastUpdate: number;
}
