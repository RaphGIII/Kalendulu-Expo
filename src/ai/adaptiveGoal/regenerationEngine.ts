import { RegenerationRequestSchema, RegenerationResultSchema } from './schemas';
import { postAdaptiveGoalApi } from './api';
import type { GoalCalendarBlock, GoalRoutine, GoalStep, RegenerationRequest, RegenerationResult } from './types';

function smallerStep(step: GoalStep, reason: RegenerationRequest['reason']): GoalStep {
  const hard = reason === 'too_hard' || reason === 'low_completion';
  return {
    ...step,
    id: `${step.id}_regen_${Date.now()}`,
    title: hard ? `Kleinere Version: ${step.title}` : `Klarere Version: ${step.title}`,
    description:
      reason === 'too_vague'
        ? `${step.description} Ergebnis: ein sichtbares Artefakt, eine dokumentierte Entscheidung oder ein messbarer Zwischenstand.`
        : hard
          ? `Reduziere diesen Schritt auf 10-15 Minuten und beende ihn mit einem einzigen sichtbaren Zwischenergebnis.`
          : `${step.description} Fuege eine klare Messung oder einen naechsten Output hinzu.`,
    estimatedMinutes: hard ? Math.min(step.estimatedMinutes ?? 20, 15) : step.estimatedMinutes,
    canBeRegenerated: true,
  };
}

function smallerRoutine(routine: GoalRoutine, reason: RegenerationRequest['reason']): GoalRoutine {
  const hard = reason === 'too_hard' || reason === 'low_completion' || reason === 'time_conflict';
  return {
    ...routine,
    id: `${routine.id}_regen_${Date.now()}`,
    title: hard ? `Leichtere Routine: ${routine.title}` : `Neue Variante: ${routine.title}`,
    estimatedMinutes: hard ? Math.max(5, Math.min(routine.estimatedMinutes, 15)) : routine.estimatedMinutes,
    intensity: hard ? 'low' : routine.intensity,
    failureFallback: 'Wenn es nicht klappt, mache nur die erste 5-Minuten-Version und dokumentiere den naechsten Schritt.',
  };
}

function movableBlock(block: GoalCalendarBlock): GoalCalendarBlock {
  return {
    ...block,
    id: `${block.id}_regen_${Date.now()}`,
    durationMinutes: Math.max(10, Math.min(block.durationMinutes, 30)),
    flexibility: 'movable',
    reason: 'Der Block wurde wegen Zeitkonflikt kuerzer und verschiebbar gemacht.',
  };
}

function localRegenerate(request: RegenerationRequest): RegenerationResult {
  const { goal, targetId, targetType, reason } = request;
  const steps = goal.steps.filter((item) => !targetId || item.id === targetId);
  const routines = goal.routines.filter((item) => !targetId || item.id === targetId);
  const blocks = goal.calendarBlocks.filter((item) => !targetId || item.id === targetId);

  if (targetType === 'step' && steps[0]) {
    const newStep = smallerStep(steps[0], reason);
    return { targetType, replacedTargetId: steps[0].id, explanation: 'Der Step wurde kleiner, konkreter und regenerierbar ersetzt.', newItems: [newStep] };
  }
  if (targetType === 'routine' && routines[0]) {
    const newRoutine = smallerRoutine(routines[0], reason);
    return { targetType, replacedTargetId: routines[0].id, explanation: 'Die Routine wurde realistischer und mit Fallback ersetzt.', newItems: [newRoutine] };
  }
  if (targetType === 'calendar_block' && blocks[0]) {
    const newBlock = movableBlock(blocks[0]);
    return { targetType, replacedTargetId: blocks[0].id, explanation: 'Der Kalenderblock wurde kuerzer und flexibler gemacht.', newItems: [newBlock] };
  }

  return {
    targetType,
    explanation: 'Der Blueprint wurde als lokale Fallback-Regeneration leichter und klarer markiert.',
    newItems: [],
    updatedBlueprint: {
      ...goal,
      planningStyle: reason === 'too_hard' || reason === 'low_completion' ? 'gentle' : goal.planningStyle,
      personalizationNotes: [...goal.personalizationNotes, `Regeneration: ${reason}`],
    },
  };
}

export async function regenerateGoalPart(request: RegenerationRequest): Promise<RegenerationResult> {
  const safe = RegenerationRequestSchema.parse(request);
  try {
    const data = await postAdaptiveGoalApi<unknown>('/api/ai/adaptive-goal/regenerate', safe);
    return RegenerationResultSchema.parse(data);
  } catch {
    return RegenerationResultSchema.parse(localRegenerate(safe));
  }
}
