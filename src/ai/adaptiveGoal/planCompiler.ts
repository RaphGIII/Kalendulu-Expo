import type { GoalBlueprint } from './types';

export function compileBlueprintToTodos(blueprint: GoalBlueprint): unknown[] {
  return [
    {
      id: blueprint.firstAction.title,
      title: blueprint.firstAction.title,
      note: blueprint.firstAction.description,
      priority: 'high',
      reason: blueprint.firstAction.reason,
    },
    ...blueprint.steps.map((step) => ({
      id: step.id,
      title: step.title,
      note: step.description,
      priority: step.priority,
      dueDate: step.dueDate,
      reason: 'Aus Adaptive Goal Blueprint kompiliert',
    })),
  ];
}

export function compileBlueprintToHabits(blueprint: GoalBlueprint): unknown[] {
  return blueprint.routines.map((routine) => ({
    id: routine.id,
    title: routine.title,
    description: routine.description,
    frequencyPerWeek: routine.frequency === 'daily' ? 7 : routine.frequency === 'weekly' ? 1 : undefined,
    durationMinutes: routine.estimatedMinutes,
    reason: routine.reason,
    failureFallback: routine.failureFallback,
  }));
}

export function compileBlueprintToCalendarBlocks(blueprint: GoalBlueprint): unknown[] {
  return blueprint.calendarBlocks.map((block) => ({
    id: block.id,
    title: block.title,
    description: block.description,
    durationMinutes: block.durationMinutes,
    preferredTimeOfDay: block.preferredTimeOfDay ?? 'any',
    recurrence: block.recurrence ?? 'once',
    flexibility: block.flexibility,
    reason: block.reason,
  }));
}

export function compileBlueprintToProgressMetrics(blueprint: GoalBlueprint): unknown[] {
  return blueprint.progressMetrics.map((metric) => ({
    id: metric.id,
    name: metric.name,
    type: metric.type,
    unit: metric.unit,
    targetValue: metric.targetValue,
    currentValue: metric.currentValue,
    trackingFrequency: metric.trackingFrequency,
  }));
}
