import type { IAISService, Vessel } from '../../Domain';

type ShippingRoute = {
  name: string;
  destination: string;
  points: { latitude: number; longitude: number }[];
};

export class MockAISService implements IAISService {
  private readonly vessels: Vessel[];
  private readonly routeIndexes: number[];
  private readonly routeProgress: number[];

  constructor() {
    this.routeIndexes = [];
    this.routeProgress = [];
    this.vessels = Array.from({ length: 300 }, (_, index) => this.createVessel(index));
  }

  public async getVessels(): Promise<Vessel[]> {
    for (let index = 0; index < this.vessels.length; index += 1) {
      this.advanceVessel(index);
    }

    return this.vessels;
  }

  private createVessel(index: number): Vessel {
    const routeIndex = index % SHIPPING_ROUTES.length;
    const route = SHIPPING_ROUTES[routeIndex];
    const progress = Math.random() * (route.points.length - 1);
    const vessel = this.interpolateRoute(route, progress);
    const speed = this.randomBetween(8, 26);

    this.routeIndexes[index] = routeIndex;
    this.routeProgress[index] = progress;

    return {
      id: `sitaw-vessel-${index + 1}`,
      name: `ORION ${String(index + 1).padStart(3, '0')}`,
      latitude: vessel.latitude,
      longitude: vessel.longitude,
      heading: vessel.heading,
      speed,
      status: 'En route',
      destination: route.destination,
      eta: this.createEta(index),
    };
  }

  private advanceVessel(index: number): void {
    const vessel = this.vessels[index];
    const route = SHIPPING_ROUTES[this.routeIndexes[index]];
    const routeLength = route.points.length - 1;
    this.routeProgress[index] += vessel.speed * 0.0008;

    if (this.routeProgress[index] >= routeLength) {
      this.routeProgress[index] = 0;
    }

    const nextPosition = this.interpolateRoute(route, this.routeProgress[index]);
    vessel.latitude = nextPosition.latitude;
    vessel.longitude = nextPosition.longitude;
    vessel.heading = nextPosition.heading;
  }

  private interpolateRoute(route: ShippingRoute, progress: number): { latitude: number; longitude: number; heading: number } {
    const segmentIndex = Math.min(Math.floor(progress), route.points.length - 2);
    const segmentProgress = progress - segmentIndex;
    const start = route.points[segmentIndex];
    const end = route.points[segmentIndex + 1];
    const latitude = this.lerp(start.latitude, end.latitude, segmentProgress) + this.randomBetween(-0.15, 0.15);
    const longitude = this.lerp(start.longitude, end.longitude, segmentProgress) + this.randomBetween(-0.15, 0.15);
    const heading = this.computeHeading(start.latitude, start.longitude, end.latitude, end.longitude);

    return { latitude, longitude, heading };
  }

  private computeHeading(startLatitude: number, startLongitude: number, endLatitude: number, endLongitude: number): number {
    const startLat = startLatitude * DEGREES_TO_RADIANS;
    const endLat = endLatitude * DEGREES_TO_RADIANS;
    const deltaLongitude = (endLongitude - startLongitude) * DEGREES_TO_RADIANS;
    const y = Math.sin(deltaLongitude) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLongitude);

    return (Math.atan2(y, x) / DEGREES_TO_RADIANS + 360) % 360;
  }

  private createEta(index: number): string {
    const eta = new Date(Date.now() + this.randomBetween(2, 96) * 60 * 60 * 1000 + index * 60000);

    return eta.toISOString().slice(11, 16);
  }

  private lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * progress;
  }

  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}

const DEGREES_TO_RADIANS = Math.PI / 180;

const SHIPPING_ROUTES: ShippingRoute[] = [
  {
    name: 'North Atlantic Corridor',
    destination: 'Rotterdam',
    points: [
      { latitude: 40.7, longitude: -74.0 },
      { latitude: 43.0, longitude: -50.0 },
      { latitude: 49.0, longitude: -20.0 },
      { latitude: 51.9, longitude: 4.5 },
    ],
  },
  {
    name: 'Suez Asia-Europe Corridor',
    destination: 'Singapore',
    points: [
      { latitude: 31.2, longitude: 32.3 },
      { latitude: 18.0, longitude: 40.0 },
      { latitude: 12.0, longitude: 58.0 },
      { latitude: 7.0, longitude: 80.0 },
      { latitude: 1.3, longitude: 103.8 },
    ],
  },
  {
    name: 'Panama Transpacific Corridor',
    destination: 'Los Angeles',
    points: [
      { latitude: 9.0, longitude: -79.6 },
      { latitude: 13.0, longitude: -100.0 },
      { latitude: 22.0, longitude: -120.0 },
      { latitude: 33.7, longitude: -118.2 },
    ],
  },
  {
    name: 'English Channel Corridor',
    destination: 'Le Havre',
    points: [
      { latitude: 51.0, longitude: 1.5 },
      { latitude: 50.6, longitude: 0.0 },
      { latitude: 50.2, longitude: -2.0 },
      { latitude: 49.5, longitude: -5.0 },
    ],
  },
  {
    name: 'South Atlantic Corridor',
    destination: 'Cape Town',
    points: [
      { latitude: -23.9, longitude: -46.3 },
      { latitude: -30.0, longitude: -20.0 },
      { latitude: -34.0, longitude: 18.4 },
    ],
  },
];
