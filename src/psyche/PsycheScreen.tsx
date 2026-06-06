import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/de';

import {
  CalendarEventLike,
  GoalAnswerMap,
  GoalCalendarBlockPlan,
  GoalCategory,
  GoalExecutionPlan,
  GoalMiniStepStatus,
  GoalQuestion,
  GoalQuestionOption,
  MindsetProfile,
  PlannerBundle,
  PlannerExecutionStep,
  PsycheGoal,
  PsycheSettings,
  PsycheSignals,
  UserPlanningProfile,
} from './types';
import {
  loadPsycheGoals,
  loadPsycheSettings,
  savePsycheGoals,
  savePsycheSettings,
} from './storage';
import {
  loadCalendarEventsBestEffort,
  loadHabitsState,
  loadTodoStateBestEffort,
  applyFullGoalPlan,
} from './adapters';
import { buildFreeSlots } from './buildFreeSlots';
import { buildUserPlanningProfile } from './buildUserPlanningProfile';
import { fetchGoalRefinement } from './refinementApi';
import { fetchPlannerBundle } from './plannerApi';
import { requireAiAds } from '../monetization/aiAdGate';
import { useAppTheme } from '../theme/ThemeProvider';
import { getUserGoalLearningProfile } from '../ai/adaptiveGoal';

dayjs.locale('de');

const DEFAULT_SETTINGS: PsycheSettings = {
  style: 'winner',
  intensity: 2,
};

type ViewMode = 'setup' | 'questions' | 'preview';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function curvedCount(level: number, min: number, max: number) {
  const safe = clamp(level, 1, 10);
  const t = (safe - 1) / 9;
  const curved = (Math.exp(2.4 * t) - 1) / (Math.exp(2.4) - 1);
  return Math.round(min + curved * (max - min));
}

function questionCountForDifficulty(level: number) {
  return curvedCount(level, 4, 16);
}

function stepCountForDifficulty(level: number) {
  return curvedCount(level, 5, 14);
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function difficultyLabel(level: number) {
  if (level <= 2) return 'leicht';
  if (level <= 4) return 'machbar';
  if (level <= 6) return 'fordernd';
  if (level <= 8) return 'hart';
  return 'extrem anspruchsvoll';
}

function answerToString(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.join(', ');
  return value ?? '';
}

function answerToNumber(value: string | string[] | undefined, fallback = 0) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapChecklistToMiniSteps(steps: PlannerExecutionStep[]) {
  return steps.map((step, index) => {
    const status: GoalMiniStepStatus =
      (step.checklist ?? []).every((item) => item.done)
        ? 'done'
        : index === 0
          ? 'active'
          : 'upcoming';

    return {
      id: step.id,
      order: step.order,
      title: step.title,
      description: step.explanation,
      done: (step.checklist ?? []).every((item) => item.done),
      status,
    };
  });
}

function computeProgressPercent(steps: PlannerExecutionStep[]) {
  const items = steps.flatMap((step) => step.checklist ?? []);
  if (!items.length) return 0;
  const done = items.filter((item) => item.done).length;
  return Math.round((done / items.length) * 100);
}

function inferIntensityPreset(level: number): 'gentle' | 'balanced' | 'aggressive' {
  if (level <= 3) return 'gentle';
  if (level <= 7) return 'balanced';
  return 'aggressive';
}

function isoToDayLabel(iso: string) {
  return dayjs(iso).format('dd, DD.MM.');
}

function isoToTimeLabel(iso: string) {
  return dayjs(iso).format('HH:mm');
}

function dedupeByTitle<T extends { title: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickBestTime(answer: string | string[] | undefined) {
  const value = answerToString(answer).toLowerCase();
  if (value.includes('morg')) return 'morning';
  if (value.includes('nach')) return 'afternoon';
  if (value.includes('abend')) return 'evening';
  if (value === 'morning' || value === 'afternoon' || value === 'evening') return value;
  return 'mixed';
}

function bestHourForTime(bestTime: string) {
  if (bestTime === 'morning') return 7;
  if (bestTime === 'afternoon') return 16;
  if (bestTime === 'evening') return 19;
  return 18;
}

function parseGoalTargetDate(targetDate: string) {
  const parsed = dayjs(targetDate);
  if (parsed.isValid()) {
    return parsed.endOf('day');
  }
  return dayjs().add(90, 'day').endOf('day');
}

function pickWeekdays(daysPerWeek: number) {
  if (daysPerWeek >= 7) return [1, 2, 3, 4, 5, 6, 0];
  if (daysPerWeek === 6) return [1, 2, 3, 4, 5, 6];
  if (daysPerWeek === 5) return [1, 2, 3, 4, 5];
  if (daysPerWeek === 4) return [1, 2, 4, 6];
  if (daysPerWeek === 3) return [1, 3, 5];
  if (daysPerWeek === 2) return [2, 5];
  return [3];
}

function buildRepeatedCalendarBlocks(params: {
  title: string;
  shortTitle?: string;
  reason: string;
  description?: string;
  targetDate: string;
  weekdays: number[];
  startHour: number;
  startMinute?: number;
  durationMinutes: number;
  startFromTomorrow?: boolean;
  maxOccurrences?: number;
}): GoalCalendarBlockPlan[] {
  const {
    title,
    shortTitle,
    reason,
    description,
    targetDate,
    weekdays,
    startHour,
    startMinute = 0,
    durationMinutes,
    startFromTomorrow = true,
    maxOccurrences = 240,
  } = params;

  const result: GoalCalendarBlockPlan[] = [];
  const endDate = parseGoalTargetDate(targetDate);
  let cursor = startFromTomorrow ? dayjs().add(1, 'day').startOf('day') : dayjs().startOf('day');

  while (cursor.isBefore(endDate) || cursor.isSame(endDate, 'day')) {
    if (weekdays.includes(cursor.day())) {
      const start = cursor.hour(startHour).minute(startMinute).second(0).millisecond(0);
      const end = start.add(durationMinutes, 'minute');

      result.push({
        id: uid('cal'),
        title,
        shortTitle: shortTitle ?? title,
        reason,
        start: start.toISOString(),
        end: end.toISOString(),
        dayLabel: isoToDayLabel(start.toISOString()),
        startTime: isoToTimeLabel(start.toISOString()),
        durationMinutes,
        description,
      });

      if (result.length >= maxOccurrences) break;
    }

    cursor = cursor.add(1, 'day');
  }

  return result;
}

function buildWeeklyReviewBlock(params: {
  title: string;
  reason: string;
  description?: string;
  targetDate: string;
  weekday?: number;
  hour?: number;
  minute?: number;
  durationMinutes?: number;
}): GoalCalendarBlockPlan[] {
  return buildRepeatedCalendarBlocks({
    title: params.title,
    shortTitle: params.title,
    reason: params.reason,
    description: params.description,
    targetDate: params.targetDate,
    weekdays: [params.weekday ?? 0],
    startHour: params.hour ?? 20,
    startMinute: params.minute ?? 0,
    durationMinutes: params.durationMinutes ?? 20,
    maxOccurrences: 80,
  });
}

function fitnessPlanFromAnswers(
  bundle: PlannerBundle,
  difficultyLevel: number,
  answers: GoalAnswerMap,
  targetDate: string,
): GoalExecutionPlan {
  const currentWeight = answerToNumber(answers.current_weight, 0);
  const targetWeight = answerToNumber(answers.target_weight, 0);
  const daysPerWeek = clamp(answerToNumber(answers.days_per_week, difficultyLevel >= 8 ? 5 : 4), 2, 7);
  const minutesPerDay = clamp(answerToNumber(answers.minutes_per_day, difficultyLevel >= 8 ? 60 : 40), 20, 120);
  const trainingStatus = answerToString(answers.training_status);
  const activityLevel = answerToString(answers.activity_level);
  const bestTime = pickBestTime(answers.best_time);
  const nutritionPattern = answerToString(answers.nutrition_pattern);
  const mainProblems = Array.isArray(answers.main_nutrition_problems)
    ? answers.main_nutrition_problems
    : [];

  const weightToLose =
    currentWeight > 0 && targetWeight > 0 && currentWeight > targetWeight
      ? currentWeight - targetWeight
      : 0;

  const estimatedCalories =
    currentWeight > 0
      ? clamp(
          Math.round(
            currentWeight * 22 +
              (activityLevel === 'high' ? 450 : activityLevel === 'moderate' ? 250 : 100) -
              (weightToLose > 0 ? 450 : 250),
          ),
          1400,
          3200,
        )
      : 2200;

  const proteinTarget =
    currentWeight > 0
      ? clamp(Math.round(currentWeight * 1.8), 110, 240)
      : 160;

  const stepsTarget =
    activityLevel === 'very_low'
      ? 9000
      : activityLevel === 'low'
        ? 8500
        : activityLevel === 'moderate'
          ? 10000
          : 11000;

  const waterLiters =
    currentWeight > 0 ? Math.max(2, Math.round(currentWeight * 0.035 * 10) / 10) : 2.5;

  const trainingMinutes =
    trainingStatus === 'none'
      ? Math.min(45, minutesPerDay)
      : Math.min(60, minutesPerDay);

  const baseHour = bestHourForTime(bestTime);
  const trainingWeekdays = pickWeekdays(daysPerWeek);

  const todos = dedupeByTitle([
    {
      id: uid('todo'),
      title: `Kalorienziel auf ca. ${estimatedCalories} kcal festlegen`,
      shortTitle: 'Kalorienziel',
      reason: 'Ein täglicher Rahmen macht das Defizit konkret und steuerbar.',
      note: `Starte mit ungefähr ${estimatedCalories} kcal pro Tag und prüfe die Entwicklung wöchentlich.`,
      priority: 'high' as const,
    },
    {
      id: uid('todo'),
      title: `${proteinTarget} g Protein pro Tag absichern`,
      shortTitle: 'Proteinziel',
      reason: 'Protein hilft bei Sättigung und Muskelerhalt während des Defizits.',
      note: 'Definiere 2 bis 4 feste Eiweißquellen für deinen Alltag.',
      priority: 'high' as const,
    },
    {
      id: uid('todo'),
      title: `${stepsTarget.toLocaleString('de-DE')} Schritte als Tagesziel setzen`,
      shortTitle: 'Schrittziel',
      reason: 'Alltagsbewegung erhöht deinen Verbrauch und stabilisiert den Fettverlust.',
      note: 'Plane bewusste Gehstrecken statt nur auf spontane Bewegung zu hoffen.',
      priority: 'medium' as const,
    },
    {
      id: uid('todo'),
      title: `${daysPerWeek} feste Trainingstage bis zum Ziel einplanen`,
      shortTitle: 'Training planen',
      reason: 'Ohne feste Slots bleibt Training schnell unverbindlich.',
      note: `Plane je Einheit ungefähr ${trainingMinutes} Minuten ein und halte den Rhythmus bis zum Zieldatum.`,
      priority: 'high' as const,
    },
    {
      id: uid('todo'),
      title: '3 Ernährungsregeln für problematische Situationen festlegen',
      shortTitle: 'Essensregeln',
      reason: 'Klare Regeln schlagen spontane Willenskraft.',
      note:
        nutritionPattern || mainProblems.length
          ? `Achte besonders auf: ${nutritionPattern || mainProblems.join(', ')}`
          : 'Fokussiere Snacks, Portionen und abendliches Essen.',
      priority: 'high' as const,
    },
    {
      id: uid('todo'),
      title: bundle.primary.todo.title,
      shortTitle: bundle.primary.todo.title,
      reason: bundle.primary.todo.reason,
      note: bundle.primary.todo.instruction ?? bundle.primary.todo.expectedEffect,
      priority: 'medium' as const,
    },
  ]);

  const habits = dedupeByTitle([
    {
      id: uid('habit'),
      title: 'Training durchziehen',
      shortTitle: 'Training',
      reason: 'Regelmäßiges Training ist der körperliche Haupttreiber deines Plans.',
      description: `${daysPerWeek} Einheiten pro Woche mit ungefähr ${trainingMinutes} Minuten bis zum Zieltermin.`,
      details: 'Zieh die fest geplanten Einheiten wirklich durch, statt spontan zu entscheiden.',
      frequencyPerWeek: daysPerWeek,
      durationMinutes: trainingMinutes,
      targetPerDay: 1,
      cadence: 'weekly' as const,
    },
    {
      id: uid('habit'),
      title: `${stepsTarget.toLocaleString('de-DE')} Schritte erreichen`,
      shortTitle: 'Schritte',
      reason: 'Bewegung außerhalb des Trainings stabilisiert dein Defizit.',
      description: 'Nutze Spaziergänge, Wege und aktive Alltagsmomente.',
      details: 'Wenn du deutlich darunter liegst, plane bewusst einen zusätzlichen Gehblock.',
      frequencyPerWeek: 7,
      durationMinutes: 30,
      targetPerDay: 1,
      cadence: 'daily' as const,
    },
    {
      id: uid('habit'),
      title: `${waterLiters} Liter Wasser trinken`,
      shortTitle: 'Wasser',
      reason: 'Wasser unterstützt Sättigung, Energie und Trainingsqualität.',
      description: `Trinke ungefähr ${waterLiters} Liter pro Tag bis zum Zieltermin.`,
      details: 'Verteile das Wasser über den Tag statt alles abends zu trinken.',
      frequencyPerWeek: 7,
      durationMinutes: 0,
      targetPerDay: 1,
      cadence: 'daily' as const,
    },
    {
      id: uid('habit'),
      title: `${proteinTarget} g Protein einhalten`,
      shortTitle: 'Protein',
      reason: 'Protein verbessert Sättigung und Muskelerhalt.',
      description: 'Baue in jede Hauptmahlzeit eine klare Proteinquelle ein.',
      details: 'Nicht perfekt, aber im Wochenschnitt möglichst nah am Ziel.',
      frequencyPerWeek: 7,
      durationMinutes: 0,
      targetPerDay: 1,
      cadence: 'daily' as const,
    },
    {
      id: uid('habit'),
      title: 'Wöchentlicher Fettverlust-Check',
      shortTitle: 'Check',
      reason: 'Nur ein Wochencheck zeigt dir, ob dein System wirklich funktioniert.',
      description: 'Gewicht, Ernährung, Schritte und Training 1x pro Woche prüfen.',
      details: 'Passe nie täglich hektisch an. Werte lieber wöchentlich aus.',
      frequencyPerWeek: 1,
      durationMinutes: 20,
      targetPerDay: 1,
      cadence: 'weekly' as const,
    },
  ]);

  const calendarBlocks = dedupeByTitle([
    ...buildRepeatedCalendarBlocks({
      title: 'Trainingseinheit',
      shortTitle: 'Training',
      reason: 'Feste Trainingseinheiten machen dein Ziel dauerhaft umsetzbar.',
      description: `Führe in diesem Block dein geplantes Training sauber durch. Ziel: ${daysPerWeek} Einheiten pro Woche bis ${dayjs(targetDate).format('DD.MM.YYYY')}.`,
      targetDate,
      weekdays: trainingWeekdays,
      startHour: baseHour,
      durationMinutes: trainingMinutes,
      maxOccurrences: 220,
    }),
    ...buildRepeatedCalendarBlocks({
      title: 'Schritt- oder Spazierblock',
      shortTitle: 'Schritte',
      reason: 'Gezielte Alltagsbewegung hält deine Wochenkonstanz stabil.',
      description: `Zusätzliche Bewegung einplanen, damit das Tagesziel von ${stepsTarget.toLocaleString('de-DE')} Schritten erreichbar wird.`,
      targetDate,
      weekdays: [1, 3, 5],
      startHour: baseHour + 1 <= 21 ? baseHour + 1 : baseHour,
      durationMinutes: 25,
      maxOccurrences: 120,
    }),
    ...buildWeeklyReviewBlock({
      title: 'Wochencheck Fettverlust',
      reason: 'Gewicht, Konstanz und Ernährung müssen jede Woche ehrlich überprüft werden.',
      description: 'Gewicht, Training, Schritte und Ernährung kurz auswerten und den nächsten Wochenhebel bestimmen.',
      targetDate,
      weekday: 0,
      hour: 20,
      minute: 0,
      durationMinutes: 20,
    }),
  ]);

  return {
    summary:
      bundle.planMeta?.summary ??
      `Fettverlust-Plan mit ungefähr ${estimatedCalories} kcal, ${proteinTarget} g Protein, ${stepsTarget.toLocaleString('de-DE')} Schritten und ${daysPerWeek} Trainingstagen pro Woche bis ${dayjs(targetDate).format('DD.MM.YYYY')}.`,
    intensityPreset: inferIntensityPreset(difficultyLevel),
    todos,
    habits,
    calendarBlocks,
    steps: bundle.executionSteps ?? [],
    sourceBundle: bundle,
  };
}

function researchStudyPlanFromAnswers(
  bundle: PlannerBundle,
  difficultyLevel: number,
  answers: GoalAnswerMap,
  goalType: GoalCategory,
  targetDate: string,
): GoalExecutionPlan {
  const weeklyHours = clamp(answerToNumber(answers.weekly_hours, difficultyLevel >= 8 ? 14 : 8), 3, 40);
  const bestTime = pickBestTime(answers.best_time);
  const baseHour = bestHourForTime(bestTime);
  const blockMinutes = difficultyLevel >= 8 ? 120 : difficultyLevel >= 5 ? 90 : 60;
  const focusBlocks = Math.max(2, Math.min(6, Math.round(weeklyHours / 3)));
  const topicFixed = answerToString(answers.topic_fixed);
  const currentStatus = answerToString(answers.current_status);
  const bottleneck = Array.isArray(answers.main_bottleneck)
    ? answers.main_bottleneck.join(', ')
    : answerToString(answers.main_bottleneck);
  const focusWeekdays = pickWeekdays(focusBlocks);

  const todos = dedupeByTitle([
    {
      id: uid('todo'),
      title:
        topicFixed === 'no' || topicFixed === 'rough'
          ? 'Thema und Scope sauber eingrenzen'
          : 'Aktuellen Arbeitsstand schriftlich strukturieren',
      shortTitle: 'Scope klären',
      reason: 'Große Wissens- oder Forschungsziele scheitern oft an unklarem Scope.',
      note: currentStatus || 'Formuliere ehrlich, was schon steht und was noch fehlt.',
      priority: 'high' as const,
    },
    {
      id: uid('todo'),
      title: 'Literatur- oder Materialbasis priorisieren',
      shortTitle: 'Basis priorisieren',
      reason: 'Die richtige Reihenfolge spart Wochen an ineffizienter Arbeit.',
      note: 'Bestimme Kernquellen, Pflichtmaterial oder den wichtigsten Arbeitsblock.',
      priority: 'high' as const,
    },
    {
      id: uid('todo'),
      title: 'Wochenstruktur für Tiefenarbeit bis zum Ziel fixieren',
      shortTitle: 'Fokusblöcke',
      reason: 'Ohne feste Fokusblöcke bleibt komplexe Denk- und Schreibarbeit liegen.',
      note: `${focusBlocks} Fokusblöcke pro Woche mit je ungefähr ${blockMinutes} Minuten bis ${dayjs(targetDate).format('DD.MM.YYYY')}.`,
      priority: 'high' as const,
    },
    {
      id: uid('todo'),
      title:
        goalType === 'research'
          ? 'Kapitel- oder Forschungsstruktur aufbauen'
          : 'Lern- oder Arbeitsstruktur aufbauen',
      shortTitle: 'Struktur bauen',
      reason: 'Struktur reduziert Überforderung und macht Fortschritt sichtbar.',
      note: bottleneck ? `Achte besonders auf den Engpass: ${bottleneck}` : 'Arbeite vom größten Engpass aus.',
      priority: 'medium' as const,
    },
    {
      id: uid('todo'),
      title: bundle.primary.todo.title,
      shortTitle: bundle.primary.todo.title,
      reason: bundle.primary.todo.reason,
      note: bundle.primary.todo.instruction ?? bundle.primary.todo.expectedEffect,
      priority: 'medium' as const,
    },
  ]);

  const habits = dedupeByTitle([
    {
      id: uid('habit'),
      title: 'Tiefenarbeitsblock durchziehen',
      shortTitle: 'Deep Work',
      reason: 'Komplexe kognitive Arbeit braucht wiederholte konzentrierte Blöcke.',
      description: `${focusBlocks} Blöcke pro Woche mit ${blockMinutes} Minuten bis zum Zieltermin.`,
      details: 'Nur die wichtigste Denk-, Lese-, Analyse- oder Schreibaufgabe bearbeiten.',
      frequencyPerWeek: focusBlocks,
      durationMinutes: blockMinutes,
      targetPerDay: 1,
      cadence: 'weekly' as const,
    },
    {
      id: uid('habit'),
      title: 'Arbeitsstand kurz dokumentieren',
      shortTitle: 'Logbuch',
      reason: 'Ein kurzes Protokoll hält den Faden zwischen den Sessions.',
      description: 'Nach jedem Fokusblock kurz notieren, was fertig ist und was als Nächstes kommt.',
      details: 'So startest du die nächste Einheit schneller und klarer.',
      frequencyPerWeek: focusBlocks,
      durationMinutes: 10,
      targetPerDay: 1,
      cadence: 'weekly' as const,
    },
    {
      id: uid('habit'),
      title: 'Wöchentlicher Review des Hauptengpasses',
      shortTitle: 'Review',
      reason: 'Große Projekte brauchen regelmäßige Kurskorrekturen.',
      description: '1x pro Woche prüfen: Was blockiert? Was ist der nächste Hebel?',
      details: 'Nicht alles bewerten, sondern den wichtigsten Flaschenhals angehen.',
      frequencyPerWeek: 1,
      durationMinutes: 20,
      targetPerDay: 1,
      cadence: 'weekly' as const,
    },
  ]);

  const calendarBlocks = dedupeByTitle([
    ...buildRepeatedCalendarBlocks({
      title: goalType === 'research' ? 'Forschungsblock' : 'Lernblock',
      shortTitle: 'Fokus',
      reason: 'Wiederholte Fokusblöcke machen große Wissensarbeit realistisch.',
      description: `Nur die wichtigste intellektuelle Hauptaufgabe bearbeiten. Zielrhythmus bis ${dayjs(targetDate).format('DD.MM.YYYY')}.`,
      targetDate,
      weekdays: focusWeekdays,
      startHour: baseHour,
      durationMinutes: blockMinutes,
      maxOccurrences: 220,
    }),
    ...buildWeeklyReviewBlock({
      title: 'Wochenreview',
      reason: 'Ein fixer Review-Termin hält den Plan ehrlich und anpassbar.',
      description: 'Fortschritt, Engpässe und nächste Schwerpunktphase prüfen.',
      targetDate,
      weekday: 0,
      hour: 19,
      minute: 30,
      durationMinutes: 20,
    }),
  ]);

  return {
    summary:
      bundle.planMeta?.summary ??
      `Strukturierter ${goalType === 'research' ? 'Forschungs-' : 'Lern-'}Plan mit ${focusBlocks} Fokusblöcken pro Woche bis ${dayjs(targetDate).format('DD.MM.YYYY')}.`,
    intensityPreset: inferIntensityPreset(difficultyLevel),
    todos,
    habits,
    calendarBlocks,
    steps: bundle.executionSteps ?? [],
    sourceBundle: bundle,
  };
}

function businessProjectPlanFromAnswers(
  bundle: PlannerBundle,
  difficultyLevel: number,
  answers: GoalAnswerMap,
  goalType: GoalCategory,
  targetDate: string,
): GoalExecutionPlan {
  const weeklyHours = clamp(answerToNumber(answers.weekly_hours, difficultyLevel >= 8 ? 12 : 7), 3, 40);
  const bestTime = pickBestTime(answers.best_time);
  const baseHour = bestHourForTime(bestTime);
  const focusBlocks = Math.max(2, Math.min(6, Math.round(weeklyHours / 3)));
  const blockMinutes = difficultyLevel >= 8 ? 100 : 75;
  const offer = answerToString(answers.offer);
  const targetGroup = answerToString(answers.target_group);
  const salesStatus = answerToString(answers.sales_status);
  const focusWeekdays = pickWeekdays(focusBlocks);

  const todos = dedupeByTitle([
    {
      id: uid('todo'),
      title:
        goalType === 'business'
          ? 'Angebot und Zielgruppe glasklar formulieren'
          : 'Projektziel und Scope klar festziehen',
      shortTitle: 'Klarheit',
      reason: 'Ohne Klarheit verzettelst du dich sehr schnell in Nebenbaustellen.',
      note: [offer, targetGroup].filter(Boolean).join(' · ') || 'Schreibe messbar auf, was du für wen erreichen willst.',
      priority: 'high' as const,
    },
    {
      id: uid('todo'),
      title:
        goalType === 'business'
          ? 'Vertriebs- oder Validierungssystem für die gesamte Laufzeit festlegen'
          : 'Wichtigste Umsetzungsphase bis zum Ziel strukturieren',
      shortTitle: 'Wochensystem',
      reason: 'Ein klares Wochensystem macht Fortschritt reproduzierbar.',
      note: salesStatus || `Lege fest, welche operative Aktivität bis ${dayjs(targetDate).format('DD.MM.YYYY')} jede Woche passieren muss.`,
      priority: 'high' as const,
    },
    {
      id: uid('todo'),
      title: 'Hauptengpass gezielt entschärfen',
      shortTitle: 'Engpass',
      reason: 'Der größte Engpass entscheidet, ob das Ziel Fahrt aufnimmt oder stehenbleibt.',
      note: 'Bearbeite zuerst nur den einen Flaschenhals mit der höchsten Hebelwirkung.',
      priority: 'medium' as const,
    },
    {
      id: uid('todo'),
      title: bundle.primary.todo.title,
      shortTitle: bundle.primary.todo.title,
      reason: bundle.primary.todo.reason,
      note: bundle.primary.todo.instruction ?? bundle.primary.todo.expectedEffect,
      priority: 'medium' as const,
    },
  ]);

  const habits = dedupeByTitle([
    {
      id: uid('habit'),
      title: goalType === 'business' ? 'Business-Execution-Block' : 'Projekt-Execution-Block',
      shortTitle: 'Execution',
      reason: 'Kontinuierliche operative Umsetzung schlägt gelegentliche Motivationsspitzen.',
      description: `${focusBlocks} Blöcke pro Woche mit ${blockMinutes} Minuten bis zum Zieltermin.`,
      details: 'Nur die aktuell wichtigste Wachstums-, Vertriebs- oder Umsetzungsaufgabe bearbeiten.',
      frequencyPerWeek: focusBlocks,
      durationMinutes: blockMinutes,
      targetPerDay: 1,
      cadence: 'weekly' as const,
    },
    {
      id: uid('habit'),
      title: 'Wöchentlicher Output-Review',
      shortTitle: 'Review',
      reason: 'Du brauchst sichtbare Outputs, nicht nur Beschäftigung.',
      description: '1x pro Woche prüfen: Was wurde wirklich produziert oder validiert?',
      details: 'Messe an Ergebnissen statt an gefühlter Anstrengung.',
      frequencyPerWeek: 1,
      durationMinutes: 20,
      targetPerDay: 1,
      cadence: 'weekly' as const,
    },
  ]);

  const calendarBlocks = dedupeByTitle([
    ...buildRepeatedCalendarBlocks({
      title: goalType === 'business' ? 'Business-Block' : 'Projekt-Block',
      shortTitle: 'Block',
      reason: 'Mehrere feste Blocks pro Woche machen dein Ziel operativ.',
      description: `Bearbeite in diesem Block nur den wichtigsten Hebel der Woche. Laufzeit bis ${dayjs(targetDate).format('DD.MM.YYYY')}.`,
      targetDate,
      weekdays: focusWeekdays,
      startHour: baseHour,
      durationMinutes: blockMinutes,
      maxOccurrences: 220,
    }),
    ...buildWeeklyReviewBlock({
      title: 'Wochenreview Output',
      reason: 'Ein fixer Review-Termin hält die Umsetzungsqualität hoch.',
      description: 'Outputs, Engpässe und den nächsten Wochenhebel prüfen.',
      targetDate,
      weekday: 0,
      hour: 19,
      minute: 45,
      durationMinutes: 20,
    }),
  ]);

  return {
    summary:
      bundle.planMeta?.summary ??
      `Operativer ${goalType === 'business' ? 'Business-' : 'Projekt-'}Plan mit ${focusBlocks} Fokusblöcken pro Woche bis ${dayjs(targetDate).format('DD.MM.YYYY')}.`,
    intensityPreset: inferIntensityPreset(difficultyLevel),
    todos,
    habits,
    calendarBlocks,
    steps: bundle.executionSteps ?? [],
    sourceBundle: bundle,
  };
}

function genericPlanFromBundle(
  bundle: PlannerBundle,
  difficultyLevel: number,
  answers: GoalAnswerMap,
  targetDate: string,
): GoalExecutionPlan {
  const weeklyHours = clamp(answerToNumber(answers.weekly_hours, difficultyLevel >= 8 ? 10 : 6), 2, 30);
  const focusBlocks = Math.max(2, Math.min(5, Math.round(weeklyHours / 3)));
  const blockMinutes = difficultyLevel >= 8 ? 90 : 60;
  const bestTime = pickBestTime(answers.best_time);
  const baseHour = bestHourForTime(bestTime);
  const focusWeekdays = pickWeekdays(focusBlocks);

  const todos = dedupeByTitle([
    {
      id: uid('todo'),
      title: bundle.primary.todo.title,
      shortTitle: bundle.primary.todo.title,
      reason: bundle.primary.todo.reason,
      note: bundle.primary.todo.instruction ?? bundle.primary.todo.expectedEffect,
      priority: 'high' as const,
    },
    {
      id: uid('todo'),
      title: 'Wöchentliche Umsetzungsstruktur festziehen',
      shortTitle: 'Struktur',
      reason: 'Ein gutes Zielsystem lebt von einem haltbaren Wochenrhythmus.',
      note: `Plane ${focusBlocks} feste Fokusblöcke pro Woche bis ${dayjs(targetDate).format('DD.MM.YYYY')}.`,
      priority: 'medium' as const,
    },
  ]);

  const habits = dedupeByTitle([
    {
      id: uid('habit'),
      title: bundle.primary.habit.title,
      shortTitle: bundle.primary.habit.title,
      reason: bundle.primary.habit.reason,
      description: bundle.primary.habit.instruction,
      details: bundle.primary.habit.expectedEffect,
      frequencyPerWeek: focusBlocks,
      durationMinutes: blockMinutes,
      targetPerDay: 1,
      cadence: 'weekly' as const,
    },
    {
      id: uid('habit'),
      title: 'Wöchentlicher Fortschrittscheck',
      shortTitle: 'Review',
      reason: 'Der Weg muss regelmäßig überprüft werden, sonst driftet das Ziel ab.',
      description: '1x pro Woche Fortschritt, Hindernisse und nächsten Hebel prüfen.',
      details: 'Kurz, ehrlich und mit konkreter Anpassung für die nächste Woche.',
      frequencyPerWeek: 1,
      durationMinutes: 20,
      targetPerDay: 1,
      cadence: 'weekly' as const,
    },
  ]);

  const calendarBlocks = dedupeByTitle([
    ...buildRepeatedCalendarBlocks({
      title: bundle.primary.calendar.title || 'Fokusblock',
      shortTitle: bundle.primary.calendar.title || 'Fokus',
      reason: bundle.primary.calendar.reason || 'Ein fester Block macht dein Ziel umsetzbar.',
      description:
        bundle.primary.calendar.instruction ||
        `Arbeite in diesem Block an deinem wichtigsten Zielhebel bis ${dayjs(targetDate).format('DD.MM.YYYY')}.`,
      targetDate,
      weekdays: focusWeekdays,
      startHour: baseHour,
      durationMinutes: blockMinutes,
      maxOccurrences: 220,
    }),
    ...buildWeeklyReviewBlock({
      title: 'Wochenreview',
      reason: 'Ein fixer Review-Termin hält den Plan ehrlich.',
      description: 'Fortschritt, Blocker und nächste Woche kurz prüfen.',
      targetDate,
      weekday: 0,
      hour: 19,
      minute: 30,
      durationMinutes: 20,
    }),
  ]);

  return {
    summary:
      bundle.planMeta?.summary ??
      `Konkreter Plan mit wiederkehrenden Fokusblöcken bis ${dayjs(targetDate).format('DD.MM.YYYY')}.`,
    intensityPreset: inferIntensityPreset(difficultyLevel),
    todos,
    habits,
    calendarBlocks,
    steps: bundle.executionSteps ?? [],
    sourceBundle: bundle,
  };
}

function bundleToExecutionPlan(
  bundle: PlannerBundle,
  difficultyLevel: number,
  category: GoalCategory,
  answers: GoalAnswerMap,
  targetDate: string,
): GoalExecutionPlan {
  if (category === 'fitness') {
    return fitnessPlanFromAnswers(bundle, difficultyLevel, answers, targetDate);
  }

  if (category === 'research' || category === 'study') {
    return researchStudyPlanFromAnswers(bundle, difficultyLevel, answers, category, targetDate);
  }

  if (category === 'business' || category === 'project') {
    return businessProjectPlanFromAnswers(bundle, difficultyLevel, answers, category, targetDate);
  }

  return genericPlanFromBundle(bundle, difficultyLevel, answers, targetDate);
}

function multiChoiceSelected(answer: string | string[] | undefined, optionId: string) {
  return Array.isArray(answer) && answer.includes(optionId);
}

function toggleMultiChoice(
  answers: GoalAnswerMap,
  questionId: string,
  optionId: string,
): GoalAnswerMap {
  const current = Array.isArray(answers[questionId]) ? [...(answers[questionId] as string[])] : [];
  const next = current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId];
  return {
    ...answers,
    [questionId]: next,
  };
}

function buildApproxMindsetProfile(
  consistencyScore: number,
  todoCount: number,
  eventCount: number,
): MindsetProfile {
  return {
    discipline: clamp(40 + Math.round(consistencyScore * 0.35), 20, 95),
    consistency: clamp(consistencyScore, 15, 95),
    focus: clamp(45 + Math.round(eventCount * 2), 20, 95),
    planning: clamp(35 + Math.round(eventCount * 3), 15, 95),
    recovery: 60,
    momentum: clamp(35 + Math.round(todoCount * 1.5), 10, 95),
  };
}

function buildApproxSignals(
  todoDone7d: number,
  todoTotal: number,
  eventCount: number,
  habitActiveDays7d: number,
): PsycheSignals {
  return {
    habitCheckinsToday: 0,
    habitCheckins7d: habitActiveDays7d,
    habitActiveDays7d,
    tasksDoneToday: 0,
    tasksDone7d: todoDone7d,
    tasksTotal7d: todoTotal,
    calendarHoursToday: 0,
    calendarHours7d: Math.min(eventCount * 1.5, 40),
    calendarEarlyStartScore: 0.5,
    momentum7d: 0.2,
  };
}

function GoalProgressBar({
  value,
  styles,
}: {
  value: number;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${clamp(value, 0, 100)}%` }]} />
    </View>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
  onToggle,
  styles,
  colors,
}: {
  question: GoalQuestion;
  value: string | string[] | undefined;
  onChange: (next: string) => void;
  onToggle: (optionId: string) => void;
  styles: ReturnType<typeof createStyles>;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  if (question.type === 'single_choice') {
    return (
      <View style={styles.optionsWrap}>
        {(question.options ?? []).map((option: GoalQuestionOption) => {
          const active = value === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => onChange(option.id)}
              style={[styles.optionChip, active && styles.optionChipActive]}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (question.type === 'multi_choice') {
    return (
      <View style={styles.optionsWrap}>
        {(question.options ?? []).map((option: GoalQuestionOption) => {
          const active = multiChoiceSelected(value, option.id);
          return (
            <Pressable
              key={option.id}
              onPress={() => onToggle(option.id)}
              style={[styles.optionChip, active && styles.optionChipActive]}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <TextInput
      multiline={question.type === 'long_text'}
      value={answerToString(value)}
      onChangeText={onChange}
      placeholder={question.placeholder ?? 'Antwort eingeben'}
      placeholderTextColor={colors.textMuted}
      style={[
        styles.input,
        question.type === 'long_text' && { minHeight: 120, textAlignVertical: 'top' },
      ]}
    />
  );
}

export default function PsycheScreen() {
  const { colors, fontFamily } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, fontFamily), [colors, fontFamily]);

  const [settings, setSettings] = useState<PsycheSettings>(DEFAULT_SETTINGS);
  const [goals, setGoals] = useState<PsycheGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const [goalTitle, setGoalTitle] = useState('');
  const [targetDate, setTargetDate] = useState(dayjs().add(90, 'day').format('YYYY-MM-DD'));
  const [difficultyLevel, setDifficultyLevel] = useState(5);

  const [questionSet, setQuestionSet] = useState<GoalQuestion[]>([]);
  const [questionMeta, setQuestionMeta] = useState<{
    category?: GoalCategory | string;
    summary?: string;
  } | null>(null);
  const [answers, setAnswers] = useState<GoalAnswerMap>({});
  const [busy, setBusy] = useState<'idle' | 'refining' | 'planning' | 'applying'>('idle');

  const [mode, setMode] = useState<ViewMode>('setup');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [previewPlan, setPreviewPlan] = useState<GoalExecutionPlan | null>(null);

  useEffect(() => {
    (async () => {
      const [savedSettings, savedGoals] = await Promise.all([
        loadPsycheSettings(),
        loadPsycheGoals(),
      ]);
      if (savedSettings) setSettings(savedSettings);
      setGoals(savedGoals);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    savePsycheSettings(settings);
  }, [settings]);

  const targetQuestionCount = useMemo(
    () => questionCountForDifficulty(difficultyLevel),
    [difficultyLevel],
  );

  const targetStepCount = useMemo(
    () => stepCountForDifficulty(difficultyLevel),
    [difficultyLevel],
  );

  const avgProgress = useMemo(() => {
    if (!goals.length) return 0;
    return Math.round(goals.reduce((sum, goal) => sum + goal.progressPercent, 0) / goals.length);
  }, [goals]);

  const currentQuestion = questionSet[questionIndex];
  const answeredCount = useMemo(() => {
    return questionSet.filter((question) => {
      const value = answers[question.id];
      if (Array.isArray(value)) return value.length > 0;
      return typeof value === 'string' && value.trim().length > 0;
    }).length;
  }, [answers, questionSet]);

  async function buildContext(): Promise<{
    planningProfile: UserPlanningProfile;
    freeSlots: { start: string; end: string; durationMinutes: number }[];
    mindsetProfile: MindsetProfile;
    signals: PsycheSignals;
    calendarEvents: CalendarEventLike[];
  }> {
    const [todo, habits, calendarEvents] = await Promise.all([
      loadTodoStateBestEffort(),
      loadHabitsState(),
      loadCalendarEventsBestEffort(),
    ]);

    const planningProfile = buildUserPlanningProfile({
      goals,
      todo,
      habits,
      calendarEvents,
    });

    const freeSlots = buildFreeSlots(calendarEvents, {
      daysAhead: 10,
      minDurationMinutes: 25,
      startTomorrow: true,
    });

    const doneTasks = (todo?.tasks ?? []).filter((task) => task.done).length;
    const totalTasks = (todo?.tasks ?? []).length;
    const habitActiveDays7d = (habits?.habits ?? []).reduce((max, habit) => {
      const active = Object.values(habit.checkins ?? {}).filter((count) => (count ?? 0) > 0).length;
      return Math.max(max, active);
    }, 0);

    const mindsetProfile = buildApproxMindsetProfile(
      planningProfile.consistencyScore,
      doneTasks,
      calendarEvents.length,
    );

    const signals = buildApproxSignals(
      doneTasks,
      totalTasks,
      calendarEvents.length,
      habitActiveDays7d,
    );

    return {
      planningProfile,
      freeSlots,
      mindsetProfile,
      signals,
      calendarEvents,
    };
  }

  function resetBuilderState() {
    setQuestionSet([]);
    setQuestionMeta(null);
    setAnswers({});
    setQuestionIndex(0);
    setPreviewPlan(null);
    setMode('setup');
  }

  async function handleGenerateQuestions() {
    if (!goalTitle.trim()) {
      Alert.alert('Ziel fehlt', 'Bitte gib zuerst dein Ziel ein.');
      return;
    }

    setBusy('refining');

    try {
      await requireAiAds({
        phase: 'goal_refinement',
        difficultyLevel,
      });

      const context = await buildContext();

      const refinement = await fetchGoalRefinement({
        goal: goalTitle.trim(),
        difficultyLevel,
        targetDate,
        pastGoals: goals,
        profile: context.planningProfile,
        existingAnswers: {},
      });

      setQuestionSet(refinement.questions);
      setQuestionMeta({
        category: refinement.goalType,
        summary:
          refinement.analysis?.rationale?.[0] ??
          `Schwierigkeit ${difficultyLevel}/10 · ca. ${targetQuestionCount} Fragen`,
      });
      setAnswers({});
      setQuestionIndex(0);
      setPreviewPlan(null);
      setMode('questions');
    } catch (error: any) {
      Alert.alert('Fehler', error?.message ?? 'Die KI-Fragen konnten nicht erzeugt werden.');
    } finally {
      setBusy('idle');
    }
  }

  function validateAnswers() {
    for (const question of questionSet) {
      if (!question.required) continue;
      const value = answers[question.id];
      if (question.type === 'multi_choice') {
        if (!Array.isArray(value) || !value.length) {
          return question.title;
        }
      } else if (typeof value !== 'string' || !value.trim()) {
        return question.title;
      }
    }
    return null;
  }

  function currentQuestionAnswered() {
    if (!currentQuestion) return true;
    const value = answers[currentQuestion.id];
    if (currentQuestion.type === 'multi_choice') {
      return Array.isArray(value) && value.length > 0;
    }
    return typeof value === 'string' && value.trim().length > 0;
  }

  function goNextQuestion() {
    if (!currentQuestion) return;
    if (currentQuestion.required && !currentQuestionAnswered()) {
      Alert.alert('Antwort fehlt', 'Bitte beantworte zuerst diese Frage.');
      return;
    }
    setQuestionIndex((prev) => Math.min(prev + 1, questionSet.length - 1));
  }

  function goPrevQuestion() {
    setQuestionIndex((prev) => Math.max(prev - 1, 0));
  }

  async function handleBuildPlan() {
    const missing = validateAnswers();
    if (missing) {
      Alert.alert('Antwort fehlt', `Bitte beantworte zuerst: ${missing}`);
      return;
    }

    setBusy('planning');

    try {
      await requireAiAds({
        phase: 'planner_bundle',
        difficultyLevel,
      });

      const context = await buildContext();
      const goalLearningProfile = await getUserGoalLearningProfile();

      const bundle = await fetchPlannerBundle({
        goal: goalTitle.trim(),
        difficultyLevel,
        targetDate,
        goals,
        profile: context.mindsetProfile,
        signals: context.signals,
        freeSlots: context.freeSlots,
        answers,
        userPlanningProfile: context.planningProfile,
        goalLearningProfile,
      });

      const category = ((questionMeta?.category as GoalCategory) ?? 'other');
      const executionPlan = bundleToExecutionPlan(
        bundle,
        difficultyLevel,
        category,
        answers,
        targetDate,
      );
      setPreviewPlan(executionPlan);
      setMode('preview');
    } catch (error: any) {
      Alert.alert('Fehler', error?.message ?? 'Der Plan konnte nicht erstellt werden.');
    } finally {
      setBusy('idle');
    }
  }

  async function handleSavePreviewPlan() {
    if (!previewPlan) return;

    const steps = previewPlan.steps ?? [];
    const progressPercent = computeProgressPercent(steps);

    const goal: PsycheGoal = {
      id: uid('goal'),
      title: goalTitle.trim(),
      category: (questionMeta?.category as GoalCategory) ?? 'other',
      difficultyLevel,
      targetDate,
      createdAt: new Date().toISOString(),
      why: answerToString(answers.why || answers.reason || answers.motivation),
      answers,
      questionCount: questionSet.length,
      refinement: {
        goalLabel: goalTitle.trim(),
        goalType: ((questionMeta?.category as GoalCategory) ?? 'other'),
        questions: questionSet,
      },
      recommendation: {
        summary:
          previewPlan.summary ??
          'Ein konkreter Plan mit Schritten, Gewohnheiten und Zeitblöcken wurde erstellt.',
      },
      miniSteps: mapChecklistToMiniSteps(steps),
      executionPlan: previewPlan,
      progressPercent,
      appliedToApp: false,
    };

    const nextGoals = [goal, ...goals];
    setGoals(nextGoals);
    await savePsycheGoals(nextGoals);

    setGoalTitle('');
    setTargetDate(dayjs().add(90, 'day').format('YYYY-MM-DD'));
    setDifficultyLevel(5);
    resetBuilderState();

    Alert.alert(
      'Plan gespeichert',
      'Dein Ziel wurde gespeichert und ist jetzt im Fortschritt-Tab sichtbar.',
    );
  }

  async function handleApplyGoal(goal: PsycheGoal) {
    if (!goal.executionPlan) return;

    setBusy('applying');

    try {
      const result = await applyFullGoalPlan({
        todos: goal.executionPlan.todos ?? [],
        habits: goal.executionPlan.habits ?? [],
        calendarBlocks: goal.executionPlan.calendarBlocks ?? [],
      });

      const nextGoals = goals.map((item) =>
        item.id === goal.id ? { ...item, appliedToApp: true } : item,
      );
      setGoals(nextGoals);
      await savePsycheGoals(nextGoals);

      Alert.alert(
        'Übernommen',
        `${result.todosAdded} Todos, ${result.habitsAdded} Habits und ${result.calendarAdded} Kalenderblöcke wurden eingefügt.`,
      );
    } catch (error: any) {
      Alert.alert('Fehler', error?.message ?? 'Der Plan konnte nicht in die App übernommen werden.');
    } finally {
      setBusy('idle');
    }
  }

  async function handleApplyPreviewPlan() {
    if (!previewPlan) return;

    setBusy('applying');

    try {
      const result = await applyFullGoalPlan({
        todos: previewPlan.todos ?? [],
        habits: previewPlan.habits ?? [],
        calendarBlocks: previewPlan.calendarBlocks ?? [],
      });

      const steps = previewPlan.steps ?? [];
      const progressPercent = computeProgressPercent(steps);
      const goal: PsycheGoal = {
        id: uid('goal'),
        title: goalTitle.trim(),
        category: (questionMeta?.category as GoalCategory) ?? 'other',
        difficultyLevel,
        targetDate,
        createdAt: new Date().toISOString(),
        why: answerToString(answers.why || answers.reason || answers.motivation),
        answers,
        questionCount: questionSet.length,
        refinement: {
          goalLabel: goalTitle.trim(),
          goalType: ((questionMeta?.category as GoalCategory) ?? 'other'),
          questions: questionSet,
        },
        recommendation: {
          summary:
            previewPlan.summary ??
            'Ein konkreter Plan mit Schritten, Gewohnheiten und Zeitblöcken wurde erstellt.',
        },
        miniSteps: mapChecklistToMiniSteps(steps),
        executionPlan: previewPlan,
        progressPercent,
        appliedToApp: true,
      };

      const nextGoals = [goal, ...goals];
      setGoals(nextGoals);
      await savePsycheGoals(nextGoals);

      setGoalTitle('');
      setTargetDate(dayjs().add(90, 'day').format('YYYY-MM-DD'));
      setDifficultyLevel(5);
      resetBuilderState();

      Alert.alert(
        'Übernommen',
        `${result.todosAdded} Todos, ${result.habitsAdded} Habits und ${result.calendarAdded} Kalenderblöcke wurden eingefügt. Das Ziel wurde gespeichert.`,
      );
    } catch (error: any) {
      Alert.alert('Fehler', error?.message ?? 'Die Vorschläge konnten nicht übernommen werden.');
    } finally {
      setBusy('idle');
    }
  }

  async function handleDeleteGoal(goalId: string) {
    const nextGoals = goals.filter((goal) => goal.id !== goalId);
    setGoals(nextGoals);
    await savePsycheGoals(nextGoals);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Lade Psyche…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Psyche AI Planner</Text>
          <Text style={styles.title}>Ziele zuerst sauber diagnostizieren.</Text>
          <Text style={styles.subtitle}>
            Die KI erzeugt kluge Diagnosefragen, erkennt Engpässe und baut daraus konkrete
            Handlungsschritte. Bei 1 bleibt es leicht, bei 10 wird das Ziel tief zerlegt.
          </Text>

          <View style={styles.heroStats}>
            <View style={styles.statPill}>
              <Text style={styles.statValue}>{goals.length}</Text>
              <Text style={styles.statLabel}>Ziele</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statValue}>{avgProgress}%</Text>
              <Text style={styles.statLabel}>Ø Fortschritt</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statValue}>{targetQuestionCount}</Text>
              <Text style={styles.statLabel}>Fragen</Text>
            </View>
          </View>
        </View>

        {mode === 'setup' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Neues Ziel definieren</Text>

            <Text style={styles.label}>Ziel</Text>
            <TextInput
              value={goalTitle}
              onChangeText={setGoalTitle}
              placeholder="z. B. 12 kg Fett verlieren / Doktorarbeit in Biochemie fertigstellen / Unternehmen aufbauen"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { minHeight: 74 }]}
              multiline
            />

            <Text style={styles.label}>Zieldatum</Text>
            <TextInput
              value={targetDate}
              onChangeText={setTargetDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Schwierigkeit {difficultyLevel}/10</Text>
                <Text style={styles.smallMuted}>
                  {difficultyLabel(difficultyLevel)} · ca. {questionCountForDifficulty(difficultyLevel)}{' '}
                  Fragen · ca. {targetStepCount} Schritte
                </Text>
              </View>
            </View>

            <View style={styles.difficultyRow}>
              {Array.from({ length: 10 }).map((_, index) => {
                const level = index + 1;
                const active = difficultyLevel === level;
                return (
                  <Pressable
                    key={level}
                    onPress={() => setDifficultyLevel(level)}
                    style={[styles.diffButton, active && styles.diffButtonActive]}
                  >
                    <Text style={[styles.diffButtonText, active && styles.diffButtonTextActive]}>
                      {level}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={handleGenerateQuestions}
              disabled={busy !== 'idle'}
              style={[styles.primaryBtn, busy !== 'idle' && styles.btnDisabled]}
            >
              <Text style={styles.primaryBtnText}>
                {busy === 'refining' ? 'KI denkt nach…' : 'Passende KI-Fragen erzeugen'}
              </Text>
            </Pressable>
          </View>
        )}

        {mode === 'questions' && !!currentQuestion && (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>KI-Diagnosefragen</Text>
              <Text style={styles.stepCounter}>
                {questionIndex + 1}/{questionSet.length}
              </Text>
            </View>

            <Text style={styles.smallMuted}>
              {questionMeta?.summary ??
                `${questionSet.length} KI-Fragen, um Engpässe, Messpunkte und nächste Aktionen zu erkennen.`}
            </Text>

            <View style={styles.progressMetaWrap}>
              <Text style={styles.progressMetaText}>
                Beantwortet: {answeredCount}/{questionSet.length}
              </Text>
              <GoalProgressBar
                value={Math.round((answeredCount / Math.max(questionSet.length, 1)) * 100)}
                styles={styles}
              />
            </View>

            <View style={styles.questionCard}>
              <Text style={styles.questionIndex}>Frage {questionIndex + 1}</Text>
              <Text style={styles.questionTitle}>{currentQuestion.title}</Text>
              {!!currentQuestion.whyAsked && (
                <Text style={styles.questionWhy}>{currentQuestion.whyAsked}</Text>
              )}

              <QuestionInput
                question={currentQuestion}
                value={answers[currentQuestion.id]}
                onChange={(next) => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: next }))}
                onToggle={(optionId) =>
                  setAnswers((prev) => toggleMultiChoice(prev, currentQuestion.id, optionId))
                }
                styles={styles}
                colors={colors}
              />
            </View>

            <View style={styles.questionActions}>
              <Pressable
                onPress={goPrevQuestion}
                disabled={questionIndex === 0}
                style={[styles.secondaryBtn, questionIndex === 0 && styles.btnDisabled]}
              >
                <Text style={styles.secondaryBtnText}>Zurück</Text>
              </Pressable>

              {questionIndex < questionSet.length - 1 ? (
                <Pressable onPress={goNextQuestion} style={styles.primaryHalfBtn}>
                  <Text style={styles.primaryBtnText}>Weiter</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleBuildPlan}
                  disabled={busy !== 'idle'}
                  style={[styles.primaryHalfBtn, busy !== 'idle' && styles.btnDisabled]}
                >
                  <Text style={styles.primaryBtnText}>
                    {busy === 'planning' ? 'Plan wird gebaut…' : 'Plan erzeugen'}
                  </Text>
                </Pressable>
              )}
            </View>

            <Pressable onPress={handleBuildPlan} style={styles.ghostBtn}>
              <Text style={styles.ghostBtnText}>Alle Antworten prüfen und direkt Plan bauen</Text>
            </Pressable>
          </View>
        )}

        {mode === 'preview' && !!previewPlan && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Plan-Vorschau</Text>
            <Text style={styles.smallMuted}>
              Erst prüfen, dann speichern oder direkt übernehmen. Jeder Schritt soll als konkrete
              Handlung prüfbar sein.
            </Text>

            <View style={styles.previewBlock}>
              <Text style={styles.previewLabel}>Zusammenfassung</Text>
              <Text style={styles.previewText}>
                {previewPlan.summary ?? 'Keine Zusammenfassung vorhanden.'}
              </Text>
            </View>

            <View style={styles.previewGrid}>
              <View style={styles.previewMiniCard}>
                <Text style={styles.previewMiniValue}>{previewPlan.todos?.length ?? 0}</Text>
                <Text style={styles.previewMiniLabel}>Todos</Text>
              </View>
              <View style={styles.previewMiniCard}>
                <Text style={styles.previewMiniValue}>{previewPlan.habits?.length ?? 0}</Text>
                <Text style={styles.previewMiniLabel}>Habits</Text>
              </View>
              <View style={styles.previewMiniCard}>
                <Text style={styles.previewMiniValue}>{previewPlan.calendarBlocks?.length ?? 0}</Text>
                <Text style={styles.previewMiniLabel}>Kalender</Text>
              </View>
              <View style={styles.previewMiniCard}>
                <Text style={styles.previewMiniValue}>{previewPlan.steps?.length ?? 0}</Text>
                <Text style={styles.previewMiniLabel}>Schritte</Text>
              </View>
            </View>

            {!!previewPlan.todos?.length && (
              <View style={styles.previewBlock}>
                <Text style={styles.previewLabel}>Haupt-Todos</Text>
                {previewPlan.todos.slice(0, 5).map((todo, index) => (
                  <View key={`${todo.title}_${index}`} style={styles.previewListItem}>
                    <Text style={styles.previewListTitle}>{todo.title}</Text>
                    <Text style={styles.previewListText}>{todo.reason}</Text>
                  </View>
                ))}
              </View>
            )}

            {!!previewPlan.habits?.length && (
              <View style={styles.previewBlock}>
                <Text style={styles.previewLabel}>Habits</Text>
                {previewPlan.habits.slice(0, 5).map((habit, index) => (
                  <View key={`${habit.title}_${index}`} style={styles.previewListItem}>
                    <Text style={styles.previewListTitle}>{habit.title}</Text>
                    <Text style={styles.previewListText}>{habit.reason}</Text>
                  </View>
                ))}
              </View>
            )}

            {!!previewPlan.calendarBlocks?.length && (
              <View style={styles.previewBlock}>
                <Text style={styles.previewLabel}>Kalenderblöcke</Text>
                {previewPlan.calendarBlocks.slice(0, 5).map((block, index) => (
                  <View key={`${block.title}_${index}`} style={styles.previewListItem}>
                    <Text style={styles.previewListTitle}>
                      {block.title} {block.startTime ? `· ${block.startTime}` : ''}
                    </Text>
                    <Text style={styles.previewListText}>{block.reason}</Text>
                  </View>
                ))}
              </View>
            )}

            {!!previewPlan.steps?.length && (
              <View style={styles.previewBlock}>
                <Text style={styles.previewLabel}>Erste Schritte</Text>
                {previewPlan.steps.slice(0, 5).map((step, index) => (
                  <View key={step.id} style={styles.previewStepRow}>
                    <Text style={styles.previewStepNumber}>
                      {String(index + 1).padStart(2, '0')}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewListTitle}>{step.title}</Text>
                      <Text style={styles.previewListText}>{step.explanation}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.previewActionsStack}>
              <Pressable onPress={handleSavePreviewPlan} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Plan speichern</Text>
              </Pressable>

              <Pressable
                onPress={handleApplyPreviewPlan}
                disabled={busy !== 'idle'}
                style={[styles.secondaryWideBtn, busy !== 'idle' && styles.btnDisabled]}
              >
                <Text style={styles.secondaryBtnText}>
                  {busy === 'applying' ? 'Wird übernommen…' : 'Direkt in die App übernehmen'}
                </Text>
              </Pressable>

              <Pressable onPress={() => setMode('questions')} style={styles.ghostBtn}>
                <Text style={styles.ghostBtnText}>Antworten nochmal bearbeiten</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Deine Ziele</Text>

          {!goals.length ? (
            <Text style={styles.emptyText}>
              Noch kein Ziel gespeichert. Erstelle oben dein erstes KI-Ziel.
            </Text>
          ) : (
            goals.map((goal) => (
              <View key={goal.id} style={styles.goalCard}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.goalTitle}>{goal.title}</Text>
                    <Text style={styles.goalMeta}>
                      {goal.category} · Schwierigkeit {goal.difficultyLevel}/10 · {goal.questionCount ?? 0} Fragen
                    </Text>
                  </View>
                  <Text style={styles.goalPercent}>{goal.progressPercent}%</Text>
                </View>

                <GoalProgressBar value={goal.progressPercent} styles={styles} />

                <Text style={styles.goalSummary}>
                  {goal.recommendation?.summary ?? 'Noch keine Zusammenfassung vorhanden.'}
                </Text>

                <View style={styles.goalActions}>
                  <Pressable
                    onPress={() => handleApplyGoal(goal)}
                    disabled={busy !== 'idle'}
                    style={[styles.secondaryBtn, busy !== 'idle' && styles.btnDisabled]}
                  >
                    <Text style={styles.secondaryBtnText}>
                      {goal.appliedToApp ? 'Schon übernommen' : 'In App übernehmen'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      Alert.alert('Ziel löschen', 'Dieses Ziel wirklich löschen?', [
                        { text: 'Abbrechen', style: 'cancel' },
                        {
                          text: 'Löschen',
                          style: 'destructive',
                          onPress: () => {
                            handleDeleteGoal(goal.id);
                          },
                        },
                      ])
                    }
                    style={styles.deleteBtn}
                  >
                    <Text style={styles.deleteBtnText}>Löschen</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  fontFamily: ReturnType<typeof useAppTheme>['fontFamily']
) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
      fontFamily: fontFamily.bold,
    },
    content: {
      padding: 18,
      paddingBottom: 120,
      gap: 16,
    },
    hero: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 24,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
    },
    kicker: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      fontFamily: fontFamily.bold,
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '900',
      marginTop: 8,
      fontFamily: fontFamily.bold,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 10,
      fontFamily: fontFamily.regular,
    },
    heroStats: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 16,
    },
    statPill: {
      flex: 1,
      backgroundColor: colors.cardSecondary,
      borderRadius: 16,
      paddingVertical: 12,
      alignItems: 'center',
    },
    statValue: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    statLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
      marginTop: 4,
      fontFamily: fontFamily.bold,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    label: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '900',
      marginTop: 14,
      marginBottom: 8,
      letterSpacing: 1,
      textTransform: 'uppercase',
      fontFamily: fontFamily.bold,
    },
    input: {
      backgroundColor: colors.cardSecondary,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: fontFamily.regular,
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    smallMuted: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
      fontFamily: fontFamily.regular,
    },
    difficultyRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    diffButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    diffButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    diffButtonText: {
      color: colors.text,
      fontWeight: '900',
      fontSize: 15,
      fontFamily: fontFamily.bold,
    },
    diffButtonTextActive: {
      color: colors.primaryText,
    },
    primaryBtn: {
      marginTop: 16,
      borderRadius: 16,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryHalfBtn: {
      flex: 1,
      borderRadius: 16,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryBtnText: {
      color: colors.primaryText,
      fontWeight: '900',
      fontSize: 15,
      fontFamily: fontFamily.bold,
    },
    secondaryBtn: {
      flex: 1,
      borderRadius: 14,
      backgroundColor: colors.cardSecondary,
      paddingVertical: 12,
      alignItems: 'center',
    },
    secondaryWideBtn: {
      marginTop: 10,
      borderRadius: 14,
      backgroundColor: colors.cardSecondary,
      paddingVertical: 12,
      alignItems: 'center',
    },
    secondaryBtnText: {
      color: colors.text,
      fontWeight: '800',
      fontSize: 14,
      fontFamily: fontFamily.bold,
    },
    deleteBtn: {
      borderRadius: 14,
      backgroundColor: colors.danger + '24',
      paddingHorizontal: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    deleteBtnText: {
      color: colors.danger,
      fontWeight: '800',
      fontSize: 14,
      fontFamily: fontFamily.bold,
    },
    ghostBtn: {
      marginTop: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      alignItems: 'center',
    },
    ghostBtnText: {
      color: colors.textMuted,
      fontWeight: '800',
      fontSize: 13,
      fontFamily: fontFamily.bold,
    },
    btnDisabled: {
      opacity: 0.55,
    },
    stepCounter: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    progressMetaWrap: {
      marginTop: 14,
    },
    progressMetaText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
      marginBottom: 8,
      fontFamily: fontFamily.bold,
    },
    questionCard: {
      marginTop: 14,
      borderRadius: 18,
      backgroundColor: colors.cardSecondary,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    questionIndex: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    questionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '800',
      marginTop: 8,
      lineHeight: 24,
      fontFamily: fontFamily.bold,
    },
    questionWhy: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6,
      fontFamily: fontFamily.regular,
    },
    questionActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
    optionsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    optionChip: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.cardSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionChipActive: {
      backgroundColor: colors.primary + '29',
      borderColor: colors.primary + '59',
    },
    optionText: {
      color: colors.text,
      fontWeight: '700',
      fontFamily: fontFamily.bold,
    },
    optionTextActive: {
      color: colors.primary,
    },
    previewBlock: {
      marginTop: 14,
      borderRadius: 18,
      backgroundColor: colors.cardSecondary,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    previewLabel: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontFamily: fontFamily.bold,
    },
    previewText: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 8,
      fontFamily: fontFamily.regular,
    },
    previewGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 14,
    },
    previewMiniCard: {
      width: '47%',
      backgroundColor: colors.cardSecondary,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    previewMiniValue: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    previewMiniLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
      marginTop: 4,
      fontFamily: fontFamily.bold,
    },
    previewListItem: {
      marginTop: 10,
    },
    previewListTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '800',
      fontFamily: fontFamily.bold,
    },
    previewListText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 4,
      fontFamily: fontFamily.regular,
    },
    previewStepRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 10,
    },
    previewStepNumber: {
      width: 28,
      color: colors.primary,
      fontSize: 12,
      fontWeight: '900',
      marginTop: 2,
      fontFamily: fontFamily.bold,
    },
    previewActionsStack: {
      marginTop: 8,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 12,
      fontFamily: fontFamily.regular,
    },
    goalCard: {
      marginTop: 14,
      borderRadius: 18,
      backgroundColor: colors.cardSecondary,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    goalTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    goalMeta: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 4,
      fontFamily: fontFamily.regular,
    },
    goalPercent: {
      color: colors.primary,
      fontSize: 18,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    progressTrack: {
      height: 10,
      borderRadius: 999,
      backgroundColor: colors.border,
      overflow: 'hidden',
      marginTop: 12,
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.success,
    },
    goalSummary: {
      color: colors.text,
      opacity: 0.82,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 12,
      fontFamily: fontFamily.regular,
    },
    goalActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
  });
}
