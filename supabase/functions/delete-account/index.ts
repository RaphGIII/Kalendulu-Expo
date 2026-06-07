import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type DeleteResult = {
  table: string;
  ok: boolean;
  optional?: boolean;
  error?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { error: 'Method not allowed. Use POST.' },
      405
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse(
        {
          error:
            'Server is not configured. Missing SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.',
        },
        500
      );
    }

    const authHeader = req.headers.get('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse(
        { error: 'Not authenticated. Missing bearer token.' },
        401
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        { error: 'Invalid or expired session.' },
        401
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const results: DeleteResult[] = [];

    async function deleteRows(
      table: string,
      column: string,
      value: string,
      optional = false
    ) {
      const { error } = await adminClient
        .from(table)
        .delete()
        .eq(column, value);

      if (error) {
        results.push({
          table,
          ok: false,
          optional,
          error: error.message,
        });

        if (!optional) {
          throw new Error(`Failed to delete from ${table}: ${error.message}`);
        }

        return;
      }

      results.push({
        table,
        ok: true,
        optional,
      });
    }

    // Core Kalendulu tables from current migration.
    await deleteRows('user_app_state', 'user_id', user.id, false);
    await deleteRows('profiles', 'id', user.id, false);

    // Optional future tables. These are allowed to fail if they do not exist yet.
    await deleteRows('goals', 'user_id', user.id, true);
    await deleteRows('todos', 'user_id', user.id, true);
    await deleteRows('tasks', 'user_id', user.id, true);
    await deleteRows('habits', 'user_id', user.id, true);
    await deleteRows('events', 'user_id', user.id, true);
    await deleteRows('calendar_events', 'user_id', user.id, true);
    await deleteRows('reflections', 'user_id', user.id, true);
    await deleteRows('progress_entries', 'user_id', user.id, true);
    await deleteRows('push_tokens', 'user_id', user.id, true);
    await deleteRows('goal_feedback_events', 'user_id', user.id, true);
    await deleteRows('goal_learning_profiles', 'user_id', user.id, true);

    const { error: deleteUserError } =
      await adminClient.auth.admin.deleteUser(user.id);

    if (deleteUserError) {
      return jsonResponse(
        {
          error: `Account could not be deleted: ${deleteUserError.message}`,
          partialResults: results,
        },
        500
      );
    }

    return jsonResponse({
      success: true,
      deletedUserId: user.id,
      results,
    });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unknown account deletion error.',
      },
      500
    );
  }
});