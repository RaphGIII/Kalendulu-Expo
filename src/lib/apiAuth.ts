import { supabase } from './supabase';

export async function buildAuthenticatedJsonHeaders() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error('Bitte melde dich erneut an, bevor du die KI nutzt.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}
