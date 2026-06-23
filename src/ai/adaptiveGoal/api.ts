import { buildAuthenticatedJsonHeaders } from '../../lib/apiAuth';
import { publicEnv } from '../../config/env';

export async function postAdaptiveGoalApi<T>(path: string, body: unknown): Promise<T> {
  const apiUrl = publicEnv.plannerApiUrl;
  if (!apiUrl) {
    throw new Error('Planner API URL missing');
  }

  const res = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: await buildAuthenticatedJsonHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Adaptive Goal API failed ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}
