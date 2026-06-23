import { supabase } from '../lib/supabase';

type UserAppStateRow<T> = {
  state: T;
  updated_at: string;
};

export async function loadCloudState<T>(stateKey: string): Promise<T | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) return null;

  const { data, error } = await supabase
    .from('user_app_state')
    .select('state, updated_at')
    .eq('state_key', stateKey)
    .maybeSingle<UserAppStateRow<T>>();

  if (error || !data) return null;
  return data.state;
}

export async function saveCloudState<T>(stateKey: string, state: T): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;

  const { error } = await supabase.from('user_app_state').upsert({
    user_id: userId,
    state_key: stateKey,
    state,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    if (__DEV__) console.warn(`Cloud sync failed for ${stateKey}:`, error.message);
  }
}
