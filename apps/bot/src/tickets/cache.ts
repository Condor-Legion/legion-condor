/**
 * Cache en memoria para datos de encuesta entre paso 1 y paso 2 del modal.
 */
export interface SurveyCacheEntry {
  userId: string;
  platform: string;
  username: string;
  playerId: string;
  availability: string;
  discovery: string;
}

export const surveyCache = new Map<string, SurveyCacheEntry>();
