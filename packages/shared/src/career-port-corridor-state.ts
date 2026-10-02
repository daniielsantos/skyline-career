/**
 * Lookup slots for the port corridor.
 * No imports: career-ports binds these while career-port-corridor is still evaluating.
 */

export type PortCorridorDesk = {
  id: string;
  pickupHubs: readonly string[];
};

export const portCorridorLookups: {
  portPickups: ((portId: string) => readonly string[] | undefined) | null;
  portIdForHub: ((icao: string) => string | undefined) | null;
  listPorts: (() => readonly PortCorridorDesk[]) | null;
} = {
  portPickups: null,
  portIdForHub: null,
  listPorts: null,
};
