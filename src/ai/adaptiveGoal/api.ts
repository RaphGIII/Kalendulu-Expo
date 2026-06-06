import { buildAuthenticatedJsonHeaders } from '../../lib/apiAuth';

const API_URL = process.env.EXPO_PUBLIC_PLANNER_API_URL;

export async function postAdaptiveGoalApi<T>(path: string, body: unknown): Promise<T> {
  if (!API_URL) {
    throw new Error('Planner API URL missing');
  }

  const res = await fetch(`${API_URL}${path}`, {
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
