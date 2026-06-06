import React, { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import GoalDetailScreen from '../../src/psyche/GoalDetailScreen';

export default function GoalDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();

  const goalId = useMemo(() => {
    if (Array.isArray(params.id)) return params.id[0] ?? undefined;
    return params.id;
  }, [params.id]);

  return (
    <GoalDetailScreen
      route={{ params: { goalId } }}
      navigation={{ goBack: () => router.back() }}
    />
  );
}
