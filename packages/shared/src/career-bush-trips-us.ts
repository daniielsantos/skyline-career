/**
 * US Activities bush trips (from profiles/career/bush_PLN).
 * One-way K**** arcs; msfsValidated enabled for board play.
 */
import type { BushTripDef } from './career-bush-trips.js';
import usData from './career-bush-trips-us-data.json' with { type: 'json' };

export const US_BUSH_TRIP_STUBS: readonly BushTripDef[] =
  usData as BushTripDef[];
