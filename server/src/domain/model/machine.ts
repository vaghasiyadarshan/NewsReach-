export type MachineStatus = 'AVAILABLE' | 'UNAVAILABLE';

export interface Machine {
  id: string;
  name: string;
  status: MachineStatus;
}
