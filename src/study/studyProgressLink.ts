import { loadPsycheGoals, savePsycheGoals } from '../psyche/storage';
import type { GoalMiniStep, PsycheGoal, TodoLikeTask } from '../psyche/types';
import type { StudyPlan, StudyProgressStep, StudyProject, StudySession } from './types';

export function getStudyGoalId(projectId: string) {
  return `study_goal_${projectId}`;
}

function progressFromMiniSteps(steps: GoalMiniStep[]) {
  if (!steps.length) return 0;
  const done = steps.filter((step) => step.done || step.status === 'done').length;
  return Math.round((done / steps.length) * 100);
}

function miniStepFromSession(session: StudySession, index: number): GoalMiniStep {
  return {
    id: `study_goal_step_${session.id}`,
    order: index + 1,
    title: session.title,
    description: session.note || session.todoTitles.join(' - ') || session.title,
    done: !!session.completed,
    status: session.completed ? 'done' : index === 0 ? 'active' : 'upcoming',
    linkedTodoTitles: session.todoTitles,
    linkedHabitTitles: [],
    sessionId: session.id,
    scheduledAt: session.scheduledStart,
  };
}

export async function upsertStudyProgressGoal(input: {
  project: StudyProject;
  plan: StudyPlan;
}) {
  const goals = await loadPsycheGoals();
  const goalId = getStudyGoalId(input.project.id);
  const existing = goals.find((goal) => goal.id === goalId || goal.studyProjectId === input.project.id);
  const sessions = [...input.plan.sessions].sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  const miniSteps = sessions.map(miniStepFromSession);
  const lastSessionDate = sessions.slice(-1)[0]?.scheduledEnd;
  const now = new Date().toISOString();
  const targetDate = input.project.examDate
    ? new Date(`${input.project.examDate}T23:59:00.000`).toISOString()
    : lastSessionDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const nextGoal: PsycheGoal = {
    ...(existing ?? {}),
    id: existing?.id ?? goalId,
    title: input.project.title,
    category: 'study',
    customCategoryLabel: 'Lernen',
    source: 'study',
    studyProjectId: input.project.id,
    difficultyLevel: existing?.difficultyLevel ?? 2,
    targetDate,
    createdAt: existing?.createdAt ?? input.project.createdAt ?? now,
    why: existing?.why ?? 'Lernplan aus Study erstellt.',
    answers: existing?.answers ?? {},
    recommendation: {
      summary: input.plan.recommendation || 'Dein Lernplan ist als kurzfristiges Ziel verknuepft.',
    },
    miniSteps,
    executionPlan: {
      ...(existing?.executionPlan ?? {}),
      summary: input.plan.recommendation || 'Lernplan Schritt fuer Schritt bearbeiten.',
    },
    progressPercent: progressFromMiniSteps(miniSteps),
    appliedToApp: true,
    status: progressFromMiniSteps(miniSteps) >= 100 ? 'completed' : 'in_progress',
    updatedAt: now,
  };

  const nextGoals = [nextGoal, ...goals.filter((goal) => goal.id !== nextGoal.id && goal.studyProjectId !== input.project.id)];
  await savePsycheGoals(nextGoals);
  return nextGoal;
}

export async function syncStudyGoalProgressFromSteps(projectId: string, stepsInput?: StudyProgressStep[]) {
  const goals = await loadPsycheGoals();
  const goal = goals.find((item) => item.id === getStudyGoalId(projectId) || item.studyProjectId === projectId);
  if (!goal) return;

  const steps = stepsInput?.filter((step) => step.projectId === projectId) ?? [];
  const statusBySession = new Map(steps.map((step) => [step.sessionId, step.status]));
  const miniSteps = (goal.miniSteps ?? []).map((step) => {
    const sessionId = typeof step.sessionId === 'string' ? step.sessionId : undefined;
    const done = sessionId ? statusBySession.get(sessionId) === 'done' : !!step.done;
    return {
      ...step,
      done,
      status: done ? 'done' as const : step.status === 'done' ? 'active' as const : step.status,
    };
  });
  const progressPercent = progressFromMiniSteps(miniSteps);
  const nextGoal: PsycheGoal = {
    ...goal,
    miniSteps,
    progressPercent,
    status: progressPercent >= 100 ? 'completed' : 'in_progress',
  };
  await savePsycheGoals(goals.map((item) => (item.id === goal.id ? nextGoal : item)));
}

export async function syncLinkedGoalProgressFromTodos(tasks: TodoLikeTask[]) {
  const linkedIds = [...new Set(tasks.map((task) => task.linkedGoalId).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (!linkedIds.length) return;

  const goals = await loadPsycheGoals();
  let changed = false;
  const nextGoals = goals.map((goal) => {
    if (!linkedIds.includes(goal.id)) return goal;
    const linkedTasks = tasks.filter((task) => task.linkedGoalId === goal.id);
    if (!linkedTasks.length) return goal;

    const doneBySession = new Map(
      linkedTasks
        .map((task) => [typeof task.linkedStudySessionId === 'string' ? task.linkedStudySessionId : undefined, !!task.done] as const)
        .filter((entry): entry is [string, boolean] => Boolean(entry[0])),
    );
    const miniSteps = (goal.miniSteps ?? []).map((step) => {
      const sessionId = typeof step.sessionId === 'string' ? step.sessionId : undefined;
      const done = sessionId && doneBySession.has(sessionId) ? doneBySession.get(sessionId)! : !!step.done || step.status === 'done';
      return {
        ...step,
        done,
        status: done ? 'done' as const : step.status === 'done' ? 'active' as const : step.status,
      };
    });
    const fallbackProgress = Math.round((linkedTasks.filter((task) => task.done).length / linkedTasks.length) * 100);
    const progressPercent = miniSteps.length ? progressFromMiniSteps(miniSteps) : fallbackProgress;
    changed = true;
    return {
      ...goal,
      miniSteps,
      progressPercent,
      status: progressPercent >= 100 ? 'completed' as const : 'in_progress' as const,
    };
  });

  if (changed) await savePsycheGoals(nextGoals);
}
