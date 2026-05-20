import { ShipType } from '../../Domain';
import type { Ship } from '../../Domain';

const SHIP_TYPE_COLORS: Record<ShipType, string> = {
  [ShipType.CARGO]: '#00c853',
  [ShipType.TANKER]: '#ff1744',
  [ShipType.PASSENGER]: '#2979ff',
  [ShipType.FISHING]: '#ffd600',
  [ShipType.TUG]: '#ff9100',
  [ShipType.MILITARY]: '#263238',
  [ShipType.SAILING]: '#00e5ff',
  [ShipType.PLEASURE]: '#d500f9',
  [ShipType.HIGH_SPEED_CRAFT]: '#ffff00',
  [ShipType.UNKNOWN]: '#cfd8dc',
};

const arrowSvgCache = new Map<ShipType, string>();

export function getColorForType(shipType: ShipType): string {
  return SHIP_TYPE_COLORS[shipType] ?? SHIP_TYPE_COLORS[ShipType.UNKNOWN];
}

export function getArrowSvgDataUri(ship: Pick<Ship, 'shipType'>): string {
  const cached = arrowSvgCache.get(ship.shipType);
  if (cached) return cached;

  const fill = getColorForType(ship.shipType);
  const svg = [
    '<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">',
    `  <path d="M32 4 L54 58 L32 48 L10 58 Z" fill="${fill}" stroke="#07131f" stroke-width="2" stroke-linejoin="round"/>`,
    '</svg>',
  ].join('');

  const dataUri = 'data:image/svg+xml;base64,' + btoa(svg);
  arrowSvgCache.set(ship.shipType, dataUri);
  return dataUri;
}
