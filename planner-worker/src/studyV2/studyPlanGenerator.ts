import type {
  StudyCorpusDocumentV2,
  StudyDayV2,
  StudyLearningSlotV2,
  StudyLearningUnitV2,
  StudyPlanResultV2,
  StudyV2Env,
  StudyV2TargetLevel,
} from './types';
import { callOpenAiJson, estimatedCost, safeHeading } from './studyAi';
import { computeOpenAiCostUsd } from '../shared/apiPricing';
import { logStudyStep } from './studyLogger';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayTitle(date: string) {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(new Date(`${date}T12:00:00.000Z`));
}

function hasBadText(value: string) {
  return /^(wie viel|10 ml|stoffmenge|stoff|lernen|grundlagen|seite|folie|raphael|gmeiner)$/i.test(value.trim());
}

function cleanBullet(value: string) {
  const bullet = value.replace(/^[-*•\d.)\s]+/, '').replace(/\s+/g, ' ').trim();
  if (!bullet || bullet.length < 8) return '';
  if (/^(inhalt lernen|stoff verstehen|wichtige punkte merken|lernen|stoff)$/i.test(bullet)) return '';
  if (/raphael|gmeiner|@|https?:|www\./i.test(bullet)) return '';
  return bullet.length > 130 ? `${bullet.slice(0, 127)}...` : bullet;
}

function fallbackUnits(corpus: StudyCorpusDocumentV2): StudyLearningUnitV2[] {
  return corpus.structuredSummaryJson.topics.flatMap((topic, topicIndex) => {
    const points = topic.keyPoints.map(cleanBullet).filter(Boolean);
    const chunkSize = Math.max(3, Math.ceil(points.length / Math.max(1, Math.ceil(points.length / 5))));
    const groups: string[][] = [];
    for (let index = 0; index < points.length; index += chunkSize) groups.push(points.slice(index, index + chunkSize));
    return (groups.length ? groups : [points]).map((group, groupIndex) => ({
      id: crypto.randomUUID(),
      projectId: corpus.projectId,
      corpusDocumentId: corpus.id,
      heading: safeHeading(`${topic.heading} ${groupIndex ? groupIndex + 1 : ''}`, topic.heading),
      bullets: group.slice(0, 7),
      difficulty: clamp(topic.difficulty, 1, 5),
      importance: clamp(topic.importance, 1, 5),
      estimatedMinutes: clamp(20 + topic.difficulty * 7 + topic.estimatedWeight * 3, 20, 60),
      orderIndex: topicIndex * 10 + groupIndex,
    }));
  }).filter((unit) => unit.bullets.length > 0 && !hasBadText(unit.heading));
}

function normalizeUnits(rawUnits: any[], corpus: StudyCorpusDocumentV2) {
  const fallback = fallbackUnits(corpus);
  const units = rawUnits.map((unit, index) => {
    const bullets = Array.isArray(unit?.bullets) ? unit.bullets.map((item: unknown) => cleanBullet(String(item))).filter(Boolean) : [];
    const fallbackUnit = fallback[index] ?? fallback[index % Math.max(1, fallback.length)];
    return {
      id: crypto.randomUUID(),
      projectId: corpus.projectId,
      corpusDocumentId: corpus.id,
      heading: safeHeading(String(unit?.heading ?? ''), fallbackUnit?.heading ?? `Einheit ${index + 1}`),
      bullets: bullets.length >= 2 ? bullets.slice(0, 8) : fallbackUnit?.bullets ?? [],
      difficulty: clamp(Number(unit?.difficulty ?? fallbackUnit?.difficulty ?? 3), 1, 5),
      importance: clamp(Number(unit?.importance ?? fallbackUnit?.importance ?? 3), 1, 5),
      estimatedMinutes: clamp(Number(unit?.estimatedMinutes ?? fallbackUnit?.estimatedMinutes ?? 35), 20, 60),
      orderIndex: Number(unit?.orderIndex ?? index),
    };
  }).filter((unit) => unit.bullets.length >= 2 && !hasBadText(unit.heading));

  return units.length ? units : fallback;
}

function distributeUnits(input: {
  corpus: StudyCorpusDocumentV2;
  units: StudyLearningUnitV2[];
  examDate?: string;
  weeklyHours: number;
  minutesPerLearningDay: number;
}) {
  const start = addDays(new Date(), 1);
  const dailyLimit = clamp(input.minutesPerLearningDay, 30, 240);
  const totalMinutes = input.units.reduce((sum, unit) => sum + unit.estimatedMinutes, 0);
  const relaxedDays = Math.max(1, Math.ceil(totalMinutes / dailyLimit));
  const deadlineDays = input.examDate
    ? Math.max(1, Math.ceil((new Date(`${input.examDate}T12:00:00.000Z`).getTime() - start.getTime()) / 86400000))
    : relaxedDays;
  const dayCount = input.examDate ? Math.min(relaxedDays, deadlineDays) : relaxedDays;
  const days: StudyDayV2[] = [];
  const learnedByUnit = new Map<string, number>();
  let unitIndex = 0;

  for (let dayIndex = 0; dayIndex < dayCount && unitIndex < input.units.length; dayIndex += 1) {
    const date = isoDate(addDays(start, dayIndex));
    const dayId = crypto.randomUUID();
    const slots: StudyLearningSlotV2[] = [];
    let minutes = 0;
    while (unitIndex < input.units.length && (minutes < dailyLimit * 0.9 || !slots.length)) {
      const unit = input.units[unitIndex];
      if (minutes + unit.estimatedMinutes > dailyLimit * 1.3 && slots.length) break;
      const slot: StudyLearningSlotV2 = {
        id: crypto.randomUUID(),
        projectId: input.corpus.projectId,
        dayId,
        unitIds: [unit.id],
        slotType: 'learn',
        title: unit.heading,
        bullets: unit.bullets.slice(0, 5),
        estimatedMinutes: unit.estimatedMinutes,
        completed: false,
      };
      slots.push(slot);
      learnedByUnit.set(unit.id, dayIndex);
      minutes += unit.estimatedMinutes;
      unitIndex += 1;
    }

    const reviewSlots = input.units
      .filter((unit) => {
        const learnedDay = learnedByUnit.get(unit.id);
        return learnedDay !== undefined && [1, 3, 7].includes(dayIndex - learnedDay);
      })
      .slice(0, 3)
      .map((unit) => ({
        id: crypto.randomUUID(),
        projectId: input.corpus.projectId,
        dayId,
        unitIds: [unit.id],
        slotType: 'review' as const,
        title: `${unit.heading} wiederholen`,
        bullets: unit.bullets.slice(0, 3),
        estimatedMinutes: clamp(Math.round(unit.estimatedMinutes * 0.35), 10, 25),
        completed: false,
      }));

    const total = minutes + reviewSlots.reduce((sum, slot) => sum + slot.estimatedMinutes, 0);
    days.push({
      id: dayId,
      projectId: input.corpus.projectId,
      date,
      dayIndex: dayIndex + 1,
      title: dayTitle(date),
      slots,
      reviewSlots,
      totalMinutes: total,
    });
  }

  return days.filter((day) => day.slots.length || day.reviewSlots.length);
}

function validatePlan(days: StudyDayV2[], units: StudyLearningUnitV2[]) {
  const warnings: string[] = [];
  const learned = new Map<string, number>();
  for (const day of days) {
    if (!day.slots.length && !day.reviewSlots.length) warnings.push(`Lerntag ${day.dayIndex} ist leer.`);
    for (const slot of day.slots) for (const unitId of slot.unitIds) learned.set(unitId, day.dayIndex);
    for (const slot of day.reviewSlots) {
      for (const unitId of slot.unitIds) {
        const first = learned.get(unitId);
        if (!first || first >= day.dayIndex) warnings.push(`Wiederholung vor Lernen bei ${slot.title}.`);
      }
    }
  }
  if (units.some((unit) => hasBadText(unit.heading))) warnings.push('Schlechte Ueberschriften wurden erkannt und lokal bereinigt.');
  const totals = days.map((day) => day.totalMinutes).filter(Boolean);
  const avg = totals.reduce((sum, item) => sum + item, 0) / Math.max(1, totals.length);
  if (totals.some((item) => item > avg * 1.3 && item > 60)) warnings.push('Einige Tage sind wegen Deadline oder Stoffmenge dichter geplant.');
  return warnings;
}

const studyPlanJsonSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    units: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          heading: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
          difficulty: { type: 'number' },
          importance: { type: 'number' },
          estimatedMinutes: { type: 'number' },
          orderIndex: { type: 'number' },
        },
      },
    },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          dayIndex: { type: 'number' },
          date: { type: 'string' },
          learnSlots: { type: 'array', items: { type: 'object', additionalProperties: true } },
          reviewSlots: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
    },
    feasible: { type: 'boolean' },
    recommendation: { type: 'string' },
  },
};

function unwrapPlanResponse(raw: any) {
  if (Array.isArray(raw?.units)) return raw;
  if (Array.isArray(raw?.output?.units)) return raw.output;
  if (Array.isArray(raw?.plan?.units)) return raw.plan;
  if (Array.isArray(raw?.studyPlan?.units)) return raw.studyPlan;
  return raw;
}

export async function generateStudyPlanFromCorpus(input: {
  env: StudyV2Env;
  requestId: string;
  corpus: StudyCorpusDocumentV2;
  examDate?: string;
  weeklyHours: number;
  minutesPerLearningDay: number;
  targetLevel: StudyV2TargetLevel;
}): Promise<StudyPlanResultV2> {
  const model = input.env.OPENAI_STUDY_PLAN_MODEL || 'gpt-5-nano';
  const maxCost = Math.min(0.1, Math.max(0.001, Number(input.env.OPENAI_STUDY_MAX_COST_USD_PER_PROJECT ?? '0.10')));
  const cost = estimatedCost(input.corpus.summaryMarkdown.length, Math.min(12000, input.corpus.summaryMarkdown.length));
  const warnings: string[] = [];
  let fallbackUsed = !input.env.OPENAI_API_KEY || cost > maxCost;
  if (cost > maxCost) warnings.push('Ein Teil wurde lokal strukturiert, weil das Kostenlimit erreicht wurde.');

  let raw: any = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let providerRequestId: string | undefined;
  logStudyStep({
    requestId: input.requestId,
    projectId: input.corpus.projectId,
    userId: input.corpus.userId,
    stage: 'plan_generation_started',
    status: 'start',
    message: 'Planerzeugung aus StudyCorpusDocument gestartet.',
    details: {
      summaryCharacters: input.corpus.summaryMarkdown.length,
      topicCount: input.corpus.structuredSummaryJson.topics.length,
      estimatedCostUsd: cost,
      maxCost,
    },
  });
  if (!fallbackUsed) {
    logStudyStep({
      requestId: input.requestId,
      projectId: input.corpus.projectId,
      userId: input.corpus.userId,
      stage: 'plan_ai_started',
      status: 'start',
      message: 'Zweite KI fuer Lernplan gestartet.',
    });
    const rawResult = await callOpenAiJson(
      input.env,
      model,
      [
        'Du bist Kalendulu Study Planner.',
        'Du erhaeltst eine strukturierte Gesamtzusammenfassung eines Studienmaterials.',
        'Erstelle daraus einen realistischen Lernplan fuer Studenten.',
        'Erzeuge kurze fachlich sinnvolle Lerneinheiten.',
        'Verteile die Inhalte gleichmaessig auf Lerntage.',
        'Wiederholungen duerfen erst nach dem ersten Lernen derselben Einheit erscheinen.',
        'Keine Platzhalter. Keine schlechten Ueberschriften.',
        'Keine Namen, Zahlenreste oder Verwaltungsdaten als Lerneinheiten.',
        'Antworte ausschliesslich mit gueltigem JSON.',
      ].join('\n'),
      JSON.stringify({
        corpus: input.corpus,
        examDate: input.examDate,
        weeklyHours: input.weeklyHours,
        minutesPerLearningDay: input.minutesPerLearningDay,
        targetLevel: input.targetLevel,
        requiredOutput:
          'Return JSON with top-level keys units, days, feasible, recommendation. Do not wrap it in output.',
        unitsShape: [{ heading: 'string', bullets: ['string'], difficulty: 1, importance: 1, estimatedMinutes: 30, orderIndex: 0 }],
        daysShape: [{ dayIndex: 1, date: 'YYYY-MM-DD', learnSlots: [], reviewSlots: [] }],
      }),
      6500,
      'kalendulu_study_plan',
      studyPlanJsonSchema,
    );
    raw = rawResult?.json;
    inputTokens = rawResult?.usage.inputTokens ?? 0;
    outputTokens = rawResult?.usage.outputTokens ?? 0;
    cachedInputTokens = rawResult?.usage.cachedInputTokens ?? 0;
    providerRequestId = rawResult?.providerRequestId;
    raw = unwrapPlanResponse(raw);
    if (!Array.isArray(raw?.units)) {
      fallbackUsed = true;
      warnings.push('Lernplan wurde lokal erzeugt, weil die KI-Antwort nicht gueltig war.');
      logStudyStep({
        requestId: input.requestId,
        projectId: input.corpus.projectId,
        userId: input.corpus.userId,
        stage: 'plan_ai_success',
        status: 'warning',
        message: 'Plan-KI-Antwort ungueltig; lokaler Fallback wird genutzt.',
      });
    } else {
      logStudyStep({
        requestId: input.requestId,
        projectId: input.corpus.projectId,
        userId: input.corpus.userId,
        stage: 'plan_ai_success',
        status: 'success',
        message: 'Plan-KI-Antwort erhalten und geparst.',
        details: { rawUnitCount: Array.isArray(raw.units) ? raw.units.length : 0 },
      });
    }
  }

  const units = normalizeUnits(Array.isArray(raw?.units) ? raw.units : [], input.corpus)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((unit, index) => ({ ...unit, orderIndex: index }));
  const days = distributeUnits({
    corpus: input.corpus,
    units,
    examDate: input.examDate,
    weeklyHours: input.weeklyHours,
    minutesPerLearningDay: input.minutesPerLearningDay,
  });
  logStudyStep({
    requestId: input.requestId,
    projectId: input.corpus.projectId,
    userId: input.corpus.userId,
    stage: 'plan_validation_started',
    status: 'start',
    message: 'Planvalidierung gestartet.',
    details: { unitCount: units.length, dayCount: days.length },
  });
  const validationWarnings = validatePlan(days, units);
  logStudyStep({
    requestId: input.requestId,
    projectId: input.corpus.projectId,
    userId: input.corpus.userId,
    stage: 'plan_validation_success',
    status: validationWarnings.length ? 'warning' : 'success',
    message: validationWarnings.length ? 'Plan mit Warnungen validiert.' : 'Plan erfolgreich validiert.',
    details: {
      unitCount: units.length,
      dayCount: days.length,
      slotCount: days.reduce((sum, day) => sum + day.slots.length + day.reviewSlots.length, 0),
      warningCount: validationWarnings.length,
    },
  });
  const required = days.reduce((sum, day) => sum + day.totalMinutes, 0);
  const available = Math.max(input.weeklyHours * 60, input.minutesPerLearningDay * Math.max(1, days.length));
  const feasible = required <= available * 1.15 || !input.examDate;

  return {
    projectId: input.corpus.projectId,
    units,
    days,
    feasible,
    recommendation: raw?.recommendation
      ? String(raw.recommendation)
      : feasible
        ? 'Der Lernplan ist gleichmaessig verteilt und realistisch umsetzbar.'
        : 'Der Lernplan ist dicht. Reduziere Stoff, erhoehe Lernzeit oder verschiebe die Deadline.',
    warnings: [...warnings, ...validationWarnings],
    estimatedCostUsd: inputTokens || outputTokens
      ? computeOpenAiCostUsd({ env: input.env, model, inputTokens, outputTokens, cachedInputTokens })
      : cost,
    fallbackUsed,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    model,
    providerRequestId,
  };
}
