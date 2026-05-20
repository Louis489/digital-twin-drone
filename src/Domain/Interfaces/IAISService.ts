import type { Vessel } from '../Entities/Vessel';

export interface IAISService {
  getVessels(): Promise<Vessel[]>;
}
