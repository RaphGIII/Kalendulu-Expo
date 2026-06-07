import React, { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { router } from 'expo-router';

import { useAppTheme } from '../theme/ThemeProvider';
import { PAYWALL_COPY, useSubscription, type PaywallReason } from '../billing';
import {
  applyFullGoalPlan,
  loadCalendarEventsBestEffort,
  loadHabitsState,
  loadTodoStateBestEffort,
} from '../psyche/adapters';
import type { PsycheSuggestedCalendarBlock, PsycheSuggestedHabit, PsycheSuggestedTodo } from '../psyche/types';
import {
  compileStudyPlan,
  createTemporaryAsset,
  addStudySession,
  deleteStudyProject,
  deleteStudyDay,
  deleteStudySession,
  deleteTemporaryStudyFile,
  enhanceStudyBuildWithAi,
  estimatePagesFromFile,
  extractTextFromFile,
  isInactiveStudyFile,
  isSupportedStudyFile,
  loadStudyProgressSteps,
  loadStudyUsage,
  generateSpacedRepetition,
  loadStudyData,
  saveStudyProjectBundle,
  scheduleStudyPlan,
  toggleKnowledgeUnit,
  updateStudyDay,
  updateStudySession,
  validateStudyFileAgainstTier,
  addStudyUsagePages,
  completeStudyProgressStep,
  type KnowledgeUnit,
  type StudyBuildResult,
  type StudyPlan,
  type StudyProgressStep,
  type StudyProject,
  type StudySession,
  type StudySessionType,
  type StudyTargetLevel,
  type TemporaryStudyAsset,
} from './index';
import { exportStudyPlanAsDocx, exportStudyPlanAsPdf } from './export/studyPlanExportClient';

type Mode = 'home' | 'create' | 'preview' | 'detail';
type EditScope = 'preview' | 'detail';
type DayDraft = {
  scope: EditScope;
  projectId: string;
  date: string;
  nextDate: string;
  startTime: string;
  availableMinutes: string;
};
type SessionDraft = {
  scope: EditScope;
  sessionId?: string;
  projectId: string;
  title: string;
  sessionType: StudySessionType;
  date: string;
  startTime: string;
  duration: string;
  note: string;
  unitId: string;
};

dayjs.locale('de');

function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${minutes} Min`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function splitTopics(value: string) {
  return value
    .split('\n')
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean);
}

function unitNameMap(units: KnowledgeUnit[]) {
  return new Map(units.map((unit) => [unit.id, unit.title]));
}

function coverageLabel(status: KnowledgeUnit['coverageStatus']) {
  if (status === 'core') return 'Kernstoff';
  if (status === 'important') return 'Wichtig';
  return 'Zusatz';
}

function targetLevelLabel(level: StudyTargetLevel) {
  if (level === 'pass') return 'Bestehen';
  if (level === 'excellent') return 'Sehr gut';
  return 'Gut';
}

function sessionTypeLabel(type: StudySession['sessionType']) {
  if (type === 'review') return 'Wiederholen';
  if (type === 'catchup') return 'Nachholen';
  if (type === 'quiz') return 'Quiz';
  return 'Lernen';
}

function sourcePagesLabel(unit: KnowledgeUnit) {
  if (unit.sourcePageStart && unit.sourcePageEnd && unit.sourcePageStart !== unit.sourcePageEnd) {
    return `Seiten ${unit.sourcePageStart}-${unit.sourcePageEnd}`;
  }
  if (unit.sourcePageStart) return `Seite ${unit.sourcePageStart}`;
  return null;
}

function sessionTimeLabel(session: StudySession) {
  return `${dayjs(session.scheduledStart).format('HH:mm')}-${dayjs(session.scheduledEnd).format('HH:mm')}`;
}

function groupSessionsByDay(sessions: StudySession[]) {
  const groups = new Map<string, StudySession[]>();
  for (const session of sessions) {
    const key = dayjs(session.scheduledStart).format('YYYY-MM-DD');
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      label: dayjs(date).format('dddd, DD. MMMM'),
      sessions: items.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    }));
}

function dayLearningSummary(sessions: StudySession[]) {
  const learning = sessions.filter((session) => session.sessionType !== 'review').length;
  const reviews = sessions.filter((session) => session.sessionType === 'review').length;
  const minutes = sessions.reduce((sum, session) => sum + session.estimatedMinutes, 0);
  return `${minutesLabel(minutes)} - ${sessions.length} Sessions - ${learning} Lernen - ${reviews} Wiederholen`;
}

function progressStatusLabel(status: StudyProgressStep['status']) {
  if (status === 'done') return 'Erledigt';
  if (status === 'missed') return 'Verpasst';
  if (status === 'rescheduled') return 'Verschoben';
  if (status === 'deleted') return 'Geloescht';
  return 'Offen';
}

function feasibilityTone(plan: StudyPlan): 'success' | 'warning' | 'danger' {
  if (plan.feasible) return 'success';
  if ((plan.overloadMinutes ?? 0) <= plan.availableMinutes * 0.25) return 'warning';
  return 'danger';
}

function feasibilityTitle(plan: StudyPlan) {
  const tone = feasibilityTone(plan);
  if (tone === 'success') return 'Realistisch';
  if (tone === 'warning') return 'Knapp, aber steuerbar';
  return 'Zu viel Stoff fuer die verfuegbare Zeit';
}

function rebuildPlanForSessions(plan: StudyPlan, sessions: StudySession[]): StudyPlan {
  const learningMinutes = sessions
    .filter((session) => session.sessionType !== 'review')
    .reduce((sum, session) => sum + session.estimatedMinutes, 0);
  const reviewMinutes = sessions
    .filter((session) => session.sessionType === 'review')
    .reduce((sum, session) => sum + session.estimatedMinutes, 0);
  const bufferMinutes = Math.ceil((learningMinutes + reviewMinutes) * 0.2);
  const requiredMinutes = learningMinutes + reviewMinutes + bufferMinutes;
  const overloadMinutes = Math.max(0, requiredMinutes - plan.availableMinutes);

  return {
    ...plan,
    sessions: sessions.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    learningMinutes,
    reviewMinutes,
    bufferMinutes,
    requiredMinutes,
    feasible: overloadMinutes === 0,
    overloadMinutes: overloadMinutes ? overloadMinutes : undefined,
  };
}

function makeSessionDateTime(date: string, startTime: string) {
  const [hoursRaw, minutesRaw] = startTime.split(':');
  const start = new Date(`${date}T00:00:00.000`);
  start.setHours(Number(hoursRaw) || 0, Number(minutesRaw) || 0, 0, 0);
  return start;
}

function createSessionFromDraft(draft: SessionDraft, fallback?: StudySession): StudySession {
  const minutes = Math.max(10, Number(draft.duration) || fallback?.estimatedMinutes || 30);
  const start = makeSessionDateTime(draft.date, draft.startTime);
  const unitIds = draft.unitId ? [draft.unitId] : fallback?.unitIds ?? [];
  const title = draft.title.trim() || fallback?.title || 'Freie Lernsession';
  return {
    id: fallback?.id ?? `study_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    projectId: draft.projectId,
    title,
    sessionType: draft.sessionType,
    scheduledStart: start.toISOString(),
    scheduledEnd: new Date(start.getTime() + minutes * 60 * 1000).toISOString(),
    estimatedMinutes: minutes,
    unitIds,
    todoTitles: fallback?.todoTitles?.length ? fallback.todoTitles : [`${title}: bearbeiten`],
    note: draft.note.trim() || undefined,
    completed: fallback?.completed ?? false,
    updatedAt: new Date().toISOString(),
  };
}

function buildStudyAppBundle(input: {
  project: StudyProject;
  units: KnowledgeUnit[];
  plan: StudyPlan;
  existingTodoTitles: Set<string>;
  existingHabitTitles: Set<string>;
  existingCalendarTitles: Set<string>;
}) {
  const names = unitNameMap(input.units);

  const todos: PsycheSuggestedTodo[] = [];
  for (const session of input.plan.sessions) {
    for (const title of session.todoTitles) {
      const fullTitle = `${input.project.title}: ${title}`;
      if (input.existingTodoTitles.has(fullTitle)) continue;
      input.existingTodoTitles.add(fullTitle);
      todos.push({
        id: `study_todo_${session.id}_${todos.length}`,
        title: fullTitle,
        reason: 'Aus dem Lernplan erzeugt.',
        priority: session.sessionType === 'review' ? 'medium' : 'high',
        subcategory: 'Lernen',
        estimatedMinutes: session.estimatedMinutes,
      });
    }
  }

  const calendarBlocks: PsycheSuggestedCalendarBlock[] = input.plan.sessions
    .filter((session) => !input.existingCalendarTitles.has(`${input.project.title}: ${session.title}`))
    .map((session) => {
      const title = `${input.project.title}: ${session.title}`;
      input.existingCalendarTitles.add(title);
      return {
        id: `study_cal_${session.id}`,
        title,
        reason: 'Zeitblock aus dem Lernplan.',
        start: session.scheduledStart,
        end: session.scheduledEnd,
        durationMinutes: session.estimatedMinutes,
        color: '#2563EB',
        description: session.unitIds.map((id) => names.get(id)).filter(Boolean).join(', '),
      };
    });

  const habits: PsycheSuggestedHabit[] = [];
  const recallHabit = `${input.project.title}: Taeglicher Active Recall`;
  if (!input.existingHabitTitles.has(recallHabit)) {
    habits.push({
      id: `study_habit_${input.project.id}`,
      title: recallHabit,
      reason: 'Kurze taegliche Wiederholung stabilisiert den Lernplan.',
      description: '10 Minuten Active Recall oder Karteikarten ohne Unterlagen.',
      cadence: 'daily',
      durationMinutes: 10,
      targetPerDay: 1,
      frequencyPerWeek: 7,
      color: '#10B981',
      subcategory: 'Lernen',
    });
  }

  return { todos, habits, calendarBlocks };
}

export default function StudyScreen() {
  const { colors, fontFamily } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, fontFamily), [colors, fontFamily]);
  const { status: subscription, limits } = useSubscription();

  const [mode, setMode] = useState<Mode>('home');
  const [projects, setProjects] = useState<StudyProject[]>([]);
  const [units, setUnits] = useState<KnowledgeUnit[]>([]);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [progressSteps, setProgressSteps] = useState<StudyProgressStep[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [targetLevel, setTargetLevel] = useState<StudyTargetLevel>('good');
  const [weeklyMinutes, setWeeklyMinutes] = useState('480');
  const [availableDaysPerWeek, setAvailableDaysPerWeek] = useState('5');
  const [minutesPerDay, setMinutesPerDay] = useState('90');
  const [preferredTime, setPreferredTime] = useState<'morning' | 'midday' | 'evening' | 'flexible'>('evening');
  const [maxSessionMinutes, setMaxSessionMinutes] = useState('60');
  const [manualTopicsText, setManualTopicsText] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [files, setFiles] = useState<TemporaryStudyAsset[]>([]);
  const [uploadMessages, setUploadMessages] = useState<string[]>([]);
  const [preview, setPreview] = useState<StudyBuildResult | null>(null);
  const [dayDraft, setDayDraft] = useState<DayDraft | null>(null);
  const [sessionDraft, setSessionDraft] = useState<SessionDraft | null>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedUnits = selectedProject ? units.filter((unit) => unit.projectId === selectedProject.id) : [];
  const selectedPlan = selectedProject ? plans.find((plan) => plan.projectId === selectedProject.id) ?? null : null;
  const selectedProgressSteps = selectedProject
    ? progressSteps.filter((step) => step.projectId === selectedProject.id)
    : [];

  const todaySessions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return plans.flatMap((plan) => plan.sessions).filter((session) => session.scheduledStart.slice(0, 10) === today);
  }, [plans]);

  const upcomingReviews = useMemo(() => {
    return plans
      .flatMap((plan) => plan.repetitionItems)
      .filter((item) => item.status !== 'done')
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .slice(0, 5);
  }, [plans]);

  async function reload() {
    const data = await loadStudyData();
    const steps = await loadStudyProgressSteps();
    setProjects(data.projects);
    setUnits(data.units);
    setPlans(data.plans);
    setProgressSteps(steps);
    setFiles((prev) => prev.filter((asset) => new Date(asset.expiresAt).getTime() > Date.now()));
  }

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, []),
  );

  function resetCreateForm() {
    setTitle('');
    setExamDate('');
    setTargetLevel('good');
    setWeeklyMinutes('480');
    setAvailableDaysPerWeek('5');
    setMinutesPerDay('90');
    setPreferredTime('evening');
    setMaxSessionMinutes('60');
    setManualTopicsText('');
    setPastedText('');
    setFiles([]);
    setUploadMessages([]);
    setPreview(null);
  }

  function showInactiveMediaMessage() {
    Alert.alert(
      'Texterkennung noch nicht aktiv',
      'Texterkennung fuer Fotos, gescannte PDFs und PPTX ist noch nicht aktiviert. Bitte nutze aktuell PDFs mit auswaehlbarem Text, DOCX-Dateien oder manuell eingegebene Themen.',
    );
  }

  function showPaywall(reason: PaywallReason, extra?: string) {
    const copy = PAYWALL_COPY[reason];
    Alert.alert(copy.title, extra ? `${copy.body}\n\n${extra}` : copy.body, [
      {
        text: 'Plaene ansehen',
        onPress: () => router.push('/premium'),
      },
      { text: 'Nicht jetzt', style: 'cancel' },
    ]);
  }

  async function addFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'text/plain',
        'text/markdown',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) return;

    const usage = await loadStudyUsage();
    const newFiles: TemporaryStudyAsset[] = [];

    for (const asset of result.assets) {
      if (isInactiveStudyFile(asset.name, asset.mimeType) || !isSupportedStudyFile(asset.name)) {
        showInactiveMediaMessage();
        continue;
      }

      const estimatedPages = estimatePagesFromFile({ name: asset.name, size: asset.size });
      const validation = validateStudyFileAgainstTier({
        tier: subscription.tier,
        name: asset.name,
        size: asset.size,
        estimatedPages,
        usage,
      });

      if (!validation.ok) {
        showPaywall(validation.reason, validation.message);
        continue;
      }

      newFiles.push(createTemporaryAsset({
        uri: asset.uri,
        name: asset.name,
        kind: 'file',
        mimeType: asset.mimeType,
        size: asset.size,
      }));
      await addStudyUsagePages(estimatedPages);
    }

    setFiles((prev) => [...prev, ...newFiles]);

    for (const file of newFiles) {
      const extracted = await extractTextFromFile({ ...file, tier: subscription.tier });
      if (extracted.text) {
        setPastedText((prev) => `${prev.trim()}\n\n${extracted.text}`.trim());
      }
      if (extracted.message) {
        const message = extracted.message;
        setUploadMessages((prev) => [...prev, message]);
      }
    }
  }

  async function removeAsset(asset: TemporaryStudyAsset) {
    await deleteTemporaryStudyFile(asset);
    setFiles((prev) => prev.filter((item) => item.id !== asset.id));
  }

  async function analyze() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert('Titel fehlt', 'Bitte gib einen Titel fuer das Lernprojekt ein.');
      return;
    }

    const manualTopics = splitTopics(manualTopicsText);
    if (!manualTopics.length && !pastedText.trim() && !files.length) {
      Alert.alert('Stoff fehlt', 'Bitte gib mindestens eine Themenliste, Text, Fotos oder Dateien ein.');
      return;
    }

    const availability = {
      availableDaysPerWeek: Math.max(1, Math.min(7, Number(availableDaysPerWeek) || 5)),
      minutesPerDay: Math.max(15, Number(minutesPerDay) || 90),
      preferredTime,
      excludedWeekdays: [] as number[],
      maxSessionMinutes: Math.max(25, Number(maxSessionMinutes) || 60),
    };

    let result = compileStudyPlan({
      title: cleanTitle,
      examDate: examDate.trim() || undefined,
      targetLevel,
      weeklyAvailableMinutes: Number(weeklyMinutes) || 480,
      availability,
      bundle: {
        manualTopics,
        pastedText,
        uploadedImages: [],
        uploadedFiles: files,
      },
    });

    if (limits.allowAiEnhancement) {
      const enhanced = await enhanceStudyBuildWithAi(result);
      result = enhanced.result;
      setUploadMessages((prev) => [...prev, enhanced.message]);
    }

    setPreview(result);
    setMode('preview');
  }

  function rebuildPreviewWithUnits(nextUnits: KnowledgeUnit[]) {
    if (!preview) return;
    const repetitionItems = generateSpacedRepetition({
      projectId: preview.project.id,
      units: nextUnits,
      examDate: preview.project.examDate,
    });
    const plan = scheduleStudyPlan({
      projectId: preview.project.id,
      units: nextUnits,
      repetitionItems,
      weeklyAvailableMinutes: preview.project.weeklyAvailableMinutes,
      availability: preview.project.availability,
      targetLevel: preview.project.targetLevel,
      examDate: preview.project.examDate,
    });
    setPreview({ ...preview, units: nextUnits, plan });
  }

  function replacePreviewSessions(nextSessions: StudySession[]) {
    if (!preview) return;
    setPreview({
      ...preview,
      plan: rebuildPlanForSessions(preview.plan, nextSessions),
    });
  }

  function openDayEditor(scope: EditScope, projectId: string, date: string, sessionsForDay: StudySession[]) {
    const sorted = [...sessionsForDay].sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
    setDayDraft({
      scope,
      projectId,
      date,
      nextDate: date,
      startTime: sorted[0] ? dayjs(sorted[0].scheduledStart).format('HH:mm') : '18:00',
      availableMinutes: String(sorted.reduce((sum, session) => sum + session.estimatedMinutes, 0) || 60),
    });
  }

  async function saveDayDraft() {
    if (!dayDraft) return;
    if (dayDraft.scope === 'preview' && preview) {
      const daySessions = preview.plan.sessions
        .filter((session) => session.projectId === dayDraft.projectId && session.scheduledStart.slice(0, 10) === dayDraft.date)
        .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
      const total = daySessions.reduce((sum, session) => sum + session.estimatedMinutes, 0);
      const available = Number(dayDraft.availableMinutes) || total;
      const scale = available > 0 && available < total ? available / total : 1;
      let cursor = makeSessionDateTime(dayDraft.nextDate, dayDraft.startTime);
      const moved = daySessions.map((session) => {
        const minutes = Math.max(10, Math.round(session.estimatedMinutes * scale));
        const scheduledStart = cursor.toISOString();
        const scheduledEnd = new Date(cursor.getTime() + minutes * 60 * 1000).toISOString();
        cursor = new Date(scheduledEnd);
        return { ...session, scheduledStart, scheduledEnd, estimatedMinutes: minutes, updatedAt: new Date().toISOString() };
      });
      const movedById = new Map(moved.map((session) => [session.id, session]));
      replacePreviewSessions(preview.plan.sessions.map((session) => movedById.get(session.id) ?? session));
    } else {
      await updateStudyDay(dayDraft.projectId, dayDraft.date, {
        date: dayDraft.nextDate,
        startTime: dayDraft.startTime,
        availableMinutes: Number(dayDraft.availableMinutes) || undefined,
      });
      await reload();
    }
    setDayDraft(null);
  }

  function confirmDeleteDay(scope: EditScope, projectId: string, date: string) {
    Alert.alert(
      'Diesen Lerntag loeschen?',
      'Alle geplanten Sessions, Todos und Fortschrittsschritte dieses Tages werden entfernt.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Lerntag loeschen',
          style: 'destructive',
          onPress: () => {
            if (scope === 'preview' && preview) {
              replacePreviewSessions(preview.plan.sessions.filter((session) => session.scheduledStart.slice(0, 10) !== date));
              return;
            }
            void deleteStudyDay(projectId, date).then(reload);
          },
        },
      ],
    );
  }

  function openSessionEditor(scope: EditScope, projectId: string, session?: StudySession, date?: string) {
    const start = session?.scheduledStart ? dayjs(session.scheduledStart) : dayjs(date);
    setSessionDraft({
      scope,
      sessionId: session?.id,
      projectId,
      title: session?.title ?? 'Freie Lernsession',
      sessionType: session?.sessionType ?? 'learn',
      date: start.isValid() ? start.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      startTime: start.isValid() ? start.format('HH:mm') : '18:00',
      duration: String(session?.estimatedMinutes ?? 30),
      note: session?.note ?? '',
      unitId: session?.unitIds[0] ?? '',
    });
  }

  async function saveSessionDraft() {
    if (!sessionDraft) return;
    if (sessionDraft.scope === 'preview' && preview) {
      const existing = sessionDraft.sessionId
        ? preview.plan.sessions.find((session) => session.id === sessionDraft.sessionId)
        : undefined;
      const nextSession = createSessionFromDraft(sessionDraft, existing);
      replacePreviewSessions(existing
        ? preview.plan.sessions.map((session) => (session.id === existing.id ? nextSession : session))
        : [nextSession, ...preview.plan.sessions]);
    } else if (sessionDraft.sessionId) {
      const existing = selectedPlan?.sessions.find((session) => session.id === sessionDraft.sessionId);
      await updateStudySession(sessionDraft.sessionId, createSessionFromDraft(sessionDraft, existing));
      await reload();
    } else {
      const nextSession = createSessionFromDraft(sessionDraft);
      await addStudySession(sessionDraft.projectId, {
        title: nextSession.title,
        sessionType: nextSession.sessionType,
        scheduledStart: nextSession.scheduledStart,
        scheduledEnd: nextSession.scheduledEnd,
        estimatedMinutes: nextSession.estimatedMinutes,
        unitIds: nextSession.unitIds,
        todoTitles: nextSession.todoTitles,
        note: nextSession.note,
        updatedAt: nextSession.updatedAt,
      });
      await reload();
    }
    setSessionDraft(null);
  }

  function confirmDeleteSession(scope: EditScope, session: StudySession) {
    Alert.alert('Lernsession loeschen?', 'Diese Session und der zugehoerige Fortschrittsschritt werden entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Session loeschen',
        style: 'destructive',
        onPress: () => {
          if (scope === 'preview' && preview) {
            replacePreviewSessions(preview.plan.sessions.filter((item) => item.id !== session.id));
            return;
          }
          void deleteStudySession(session.id).then(reload);
        },
      },
    ]);
  }

  async function completeSession(scope: EditScope, session: StudySession) {
    if (scope === 'preview' && preview) {
      replacePreviewSessions(preview.plan.sessions.map((item) => (item.id === session.id ? { ...item, completed: true } : item)));
      return;
    }
    await updateStudySession(session.id, { completed: true });
    await reload();
  }

  function renderStudyEditors() {
    return (
      <>
        {dayDraft ? (
          <View style={styles.editorCard}>
            <Text style={styles.cardTitle}>Lerntag bearbeiten</Text>
            <Text style={styles.label}>Datum</Text>
            <TextInput value={dayDraft.nextDate} onChangeText={(nextDate) => setDayDraft({ ...dayDraft, nextDate })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>Startzeit</Text>
            <TextInput value={dayDraft.startTime} onChangeText={(startTime) => setDayDraft({ ...dayDraft, startTime })} placeholder="18:00" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>Verfuegbare Gesamtzeit in Minuten</Text>
            <TextInput value={dayDraft.availableMinutes} onChangeText={(availableMinutes) => setDayDraft({ ...dayDraft, availableMinutes })} keyboardType="numeric" placeholder="90" placeholderTextColor={colors.textMuted} style={styles.input} />
            <View style={styles.actionRow}>
              <Pressable onPress={() => setDayDraft(null)} style={styles.secondaryBtn}><Text style={styles.secondaryText}>Abbrechen</Text></Pressable>
              <Pressable onPress={() => void saveDayDraft()} style={styles.primaryHalf}><Text style={styles.primaryText}>Speichern</Text></Pressable>
            </View>
          </View>
        ) : null}

        {sessionDraft ? (
          <View style={styles.editorCard}>
            <Text style={styles.cardTitle}>{sessionDraft.sessionId ? 'Lernsession bearbeiten' : 'Freie Lernsession hinzufuegen'}</Text>
            <Text style={styles.label}>Titel</Text>
            <TextInput value={sessionDraft.title} onChangeText={(title) => setSessionDraft({ ...sessionDraft, title })} placeholder="Thema wiederholen" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>Typ</Text>
            <View style={styles.rowWrap}>
              {[
                ['learn', 'Lernen'],
                ['review', 'Wiederholen'],
                ['quiz', 'Quiz'],
                ['catchup', 'Nachholen'],
              ].map(([id, label]) => (
                <Pressable key={id} onPress={() => setSessionDraft({ ...sessionDraft, sessionType: id as StudySessionType })} style={[styles.chip, sessionDraft.sessionType === id && styles.chipActive]}>
                  <Text style={[styles.chipText, sessionDraft.sessionType === id && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Datum</Text>
            <TextInput value={sessionDraft.date} onChangeText={(date) => setSessionDraft({ ...sessionDraft, date })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>Startzeit</Text>
            <TextInput value={sessionDraft.startTime} onChangeText={(startTime) => setSessionDraft({ ...sessionDraft, startTime })} placeholder="18:00" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>Dauer in Minuten</Text>
            <TextInput value={sessionDraft.duration} onChangeText={(duration) => setSessionDraft({ ...sessionDraft, duration })} keyboardType="numeric" placeholder="45" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>Zugeordnete Lerneinheit optional</Text>
            <View style={styles.rowWrap}>
              <Pressable onPress={() => setSessionDraft({ ...sessionDraft, unitId: '' })} style={[styles.chip, !sessionDraft.unitId && styles.chipActive]}>
                <Text style={[styles.chipText, !sessionDraft.unitId && styles.chipTextActive]}>Keine</Text>
              </Pressable>
              {(sessionDraft.scope === 'preview' ? preview?.units ?? [] : selectedUnits).slice(0, 8).map((unit) => (
                <Pressable key={unit.id} onPress={() => setSessionDraft({ ...sessionDraft, unitId: unit.id })} style={[styles.chip, sessionDraft.unitId === unit.id && styles.chipActive]}>
                  <Text numberOfLines={1} style={[styles.chipText, sessionDraft.unitId === unit.id && styles.chipTextActive]}>{unit.title}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Notiz</Text>
            <TextInput value={sessionDraft.note} onChangeText={(note) => setSessionDraft({ ...sessionDraft, note })} placeholder="Optional" placeholderTextColor={colors.textMuted} style={[styles.input, styles.smallTextarea]} multiline />
            <View style={styles.actionRow}>
              <Pressable onPress={() => setSessionDraft(null)} style={styles.secondaryBtn}><Text style={styles.secondaryText}>Abbrechen</Text></Pressable>
              <Pressable onPress={() => void saveSessionDraft()} style={styles.primaryHalf}><Text style={styles.primaryText}>Speichern</Text></Pressable>
            </View>
          </View>
        ) : null}
      </>
    );
  }

  async function savePreview() {
    if (!preview) return;
    await saveStudyProjectBundle(preview);
    await Promise.all(files.map(deleteTemporaryStudyFile));
    resetCreateForm();
    await reload();
    setMode('home');
    Alert.alert('Gespeichert', 'Der Lernplan wurde gespeichert.');
  }

  async function applyPreview() {
    if (!preview) return;
    const [todoState, habitState, calendarEvents] = await Promise.all([
      loadTodoStateBestEffort(),
      loadHabitsState(),
      loadCalendarEventsBestEffort(),
    ]);

    const bundle = buildStudyAppBundle({
      project: preview.project,
      units: preview.units,
      plan: preview.plan,
      existingTodoTitles: new Set((todoState.tasks ?? []).map((task) => task.title)),
      existingHabitTitles: new Set((habitState.habits ?? []).map((habit) => habit.title)),
      existingCalendarTitles: new Set(calendarEvents.map((event) => event.title)),
    });

    const result = await applyFullGoalPlan(bundle);
    await saveStudyProjectBundle({
      ...preview,
      project: { ...preview.project, appliedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    });
    await Promise.all(files.map(deleteTemporaryStudyFile));
    resetCreateForm();
    await reload();
    setMode('home');
    Alert.alert(
      'Plan uebernommen',
      `${result.todosAdded} Todos, ${result.habitsAdded} Habit und ${result.calendarAdded} Kalenderbloecke wurden erstellt.`,
    );
  }

  function openProject(projectId: string) {
    setSelectedProjectId(projectId);
    setMode('detail');
  }

  function openCreateProject() {
    if (projects.length >= limits.maxActiveProjects) {
      showPaywall('active_projects', `Dein aktueller Plan erlaubt ${limits.maxActiveProjects} aktive Lernprojekte.`);
      return;
    }
    resetCreateForm();
    setMode('create');
  }

  function confirmRemoveProject(project: StudyProject) {
    Alert.alert(
      'Lernprojekt loeschen?',
      'Dadurch werden der Lernplan, alle Sessions, Wiederholungen, Fortschrittsschritte und zugehoerige Todos/Kalenderbloecke geloescht. Hochgeladene Originaldateien werden nicht gespeichert und sind davon nicht betroffen.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Endgueltig loeschen',
          style: 'destructive',
          onPress: () => {
            void deleteStudyProject(project.id).then(async () => {
              await reload();
              setSelectedProjectId(null);
              setMode('home');
            });
          },
        },
      ],
    );
  }

  async function exportSelected(format: 'pdf' | 'docx') {
    if (!selectedProject || !selectedPlan) return;
    if (format === 'pdf' && !limits.allowPdfExport) {
      showPaywall('pdf_export');
      return;
    }
    if (format === 'docx' && !limits.allowDocxExport) {
      showPaywall('docx_export');
      return;
    }
    if (format === 'pdf') {
      await exportStudyPlanAsPdf({ project: selectedProject, units: selectedUnits, plan: selectedPlan });
    } else {
      await exportStudyPlanAsDocx({ project: selectedProject, units: selectedUnits, plan: selectedPlan });
    }
  }

  async function exportPreview(format: 'pdf' | 'docx') {
    if (!preview) return;
    if (format === 'pdf' && !limits.allowPdfExport) {
      showPaywall('pdf_export');
      return;
    }
    if (format === 'docx' && !limits.allowDocxExport) {
      showPaywall('docx_export');
      return;
    }
    if (format === 'pdf') {
      await exportStudyPlanAsPdf({ project: preview.project, units: preview.units, plan: preview.plan });
    } else {
      await exportStudyPlanAsDocx({ project: preview.project, units: preview.units, plan: preview.plan });
    }
  }

  async function completeStep(step: StudyProgressStep) {
    await completeStudyProgressStep({
      stepId: step.id,
      qualityScore: step.stepType === 'review' ? 4 : undefined,
      actualMinutes: step.estimatedMinutes,
      repetitionItems: selectedPlan?.repetitionItems,
    });
    await reload();
  }

  if (mode === 'create') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => setMode('home')} style={styles.backBtn}>
            <Text style={styles.backText}>Zurueck</Text>
          </Pressable>

          <Text style={styles.title}>Neues Lernprojekt</Text>
          <Text style={styles.notice}>
            Bitte lade keine personenbezogenen Patientendaten oder vertraulichen Inhalte hoch. Hochgeladene Fotos
            und Dateien werden nur temporaer verarbeitet und anschliessend geloescht. Dauerhaft gespeichert werden
            nur der daraus erzeugte Lernplan, Lerneinheiten, Termine und Wiederholungen.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Titel</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="Anatomie Kopf/Hals" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>Pruefungsdatum optional</Text>
            <TextInput value={examDate} onChangeText={setExamDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>Zielniveau</Text>
            <View style={styles.rowWrap}>
              {[
                ['pass', 'Bestehen'],
                ['good', 'Gut'],
                ['excellent', 'Sehr gut'],
              ].map(([id, label]) => (
                <Pressable key={id} onPress={() => setTargetLevel(id as StudyTargetLevel)} style={[styles.chip, targetLevel === id && styles.chipActive]}>
                  <Text style={[styles.chipText, targetLevel === id && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Lernzeit pro Woche in Minuten</Text>
            <TextInput value={weeklyMinutes} onChangeText={setWeeklyMinutes} keyboardType="numeric" placeholder="480" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.notice}>
              Bevor dein Plan erstellt wird, pruefen wir, ob deine verfuegbare Lernzeit fuer den gesamten Stoff realistisch ausreicht.
            </Text>
            <Text style={styles.label}>Verfuegbare Tage pro Woche</Text>
            <TextInput value={availableDaysPerWeek} onChangeText={setAvailableDaysPerWeek} keyboardType="numeric" placeholder="5" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>Minuten pro Lerntag</Text>
            <TextInput value={minutesPerDay} onChangeText={setMinutesPerDay} keyboardType="numeric" placeholder="90" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>Maximale Sessionlaenge</Text>
            <TextInput value={maxSessionMinutes} onChangeText={setMaxSessionMinutes} keyboardType="numeric" placeholder="60" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>Bevorzugte Lernzeit</Text>
            <View style={styles.rowWrap}>
              {[
                ['morning', 'morgens'],
                ['midday', 'mittags'],
                ['evening', 'abends'],
                ['flexible', 'flexibel'],
              ].map(([id, label]) => (
                <Pressable key={id} onPress={() => setPreferredTime(id as typeof preferredTime)} style={[styles.chip, preferredTime === id && styles.chipActive]}>
                  <Text style={[styles.chipText, preferredTime === id && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Themenliste</Text>
            <TextInput
              value={manualTopicsText}
              onChangeText={setManualTopicsText}
              placeholder={'Schaedelbasis\nHirnnerven\nN. trigeminus\nOrbita'}
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.textarea]}
              multiline
            />
            <Text style={styles.cardTitle}>Text einfuegen</Text>
            <TextInput value={pastedText} onChangeText={setPastedText} placeholder="Optional Text einfuegen" placeholderTextColor={colors.textMuted} style={[styles.input, styles.textarea]} multiline />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>PDF, DOCX, TXT und MD</Text>
            <Text style={styles.notice}>
              PDFs und DOCX-Dateien werden nur temporaer zur Textextraktion verarbeitet und anschliessend geloescht. Dauerhaft gespeichert werden nur Lerneinheiten, Lernplan, Termine und Wiederholungen.
            </Text>
            <View style={styles.actionRow}>
              <Pressable onPress={showInactiveMediaMessage} style={styles.secondaryBtn}><Text style={styles.secondaryText}>Fotos/OCR noch aus</Text></Pressable>
              <Pressable onPress={() => Alert.alert('Dein Plan', `${limits.label}: bis ${limits.maxPagesPerFile} Seiten pro Datei, ${limits.maxPagesPerMonth} Seiten pro Monat.`)} style={styles.secondaryBtn}><Text style={styles.secondaryText}>Limits anzeigen</Text></Pressable>
            </View>
            <Pressable onPress={addFile} style={styles.secondaryWide}><Text style={styles.secondaryText}>Datei hochladen</Text></Pressable>
            {files.map((asset) => (
              <View key={asset.id} style={styles.assetRow}>
                <Text numberOfLines={1} style={styles.assetText}>{asset.name}</Text>
                <Pressable onPress={() => void removeAsset(asset)}><Text style={styles.removeText}>Entfernen</Text></Pressable>
              </View>
            ))}
            {uploadMessages.slice(-3).map((message, index) => (
              <Text key={`${message}-${index}`} style={styles.warningText}>{message}</Text>
            ))}
          </View>

          <Pressable onPress={analyze} style={styles.primaryBtn}>
            <Text style={styles.primaryText}>Analyse starten</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === 'preview' && preview) {
    const tone = feasibilityTone(preview.plan);
    const sessionDays = groupSessionsByDay(preview.plan.sessions);

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => setMode('create')} style={styles.backBtn}><Text style={styles.backText}>Bearbeiten</Text></Pressable>
          <Text style={styles.title}>Analyse-Vorschau</Text>

          <View style={styles.statsGrid}>
            <View style={styles.stat}><Text style={styles.statValue}>{preview.units.length}</Text><Text style={styles.statLabel}>Einheiten</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{minutesLabel(preview.plan.learningMinutes)}</Text><Text style={styles.statLabel}>Lernzeit</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{minutesLabel(preview.plan.reviewMinutes)}</Text><Text style={styles.statLabel}>Wiederholungen</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{preview.plan.feasible ? 'OK' : 'Eng'}</Text><Text style={styles.statLabel}>Machbarkeit</Text></View>
          </View>

          <View style={[styles.statusBox, tone === 'warning' && styles.statusBoxWarning, tone === 'danger' && styles.statusBoxDanger]}>
            <Text style={[styles.statusTitle, tone === 'warning' && styles.statusTitleWarning, tone === 'danger' && styles.statusTitleDanger]}>
              {feasibilityTitle(preview.plan)}
            </Text>
            <Text style={styles.metaText}>{preview.plan.recommendation}</Text>
          </View>
          {preview.plan.warnings?.map((warning) => (
            <Text key={warning} style={styles.warningText}>{warning}</Text>
          ))}
          {uploadMessages.slice(-2).map((message, index) => (
            <Text key={`${message}-${index}`} style={styles.metaText}>{message}</Text>
          ))}

          <View style={styles.actionRow}>
            <Pressable onPress={() => void applyPreview()} style={styles.primaryHalf}><Text style={styles.primaryText}>Plan uebernehmen</Text></Pressable>
            <Pressable onPress={() => void exportPreview('pdf')} style={styles.secondaryBtn}><Text style={styles.secondaryText}>PDF herunterladen</Text></Pressable>
          </View>
          <Pressable onPress={() => void exportPreview('docx')} style={styles.secondaryWide}><Text style={styles.secondaryText}>DOCX herunterladen</Text></Pressable>

          {renderStudyEditors()}

          <Text style={styles.sectionTitle}>Dein Stoff im Ueberblick</Text>
          {preview.units.map((unit) => (
            <Pressable key={unit.id} onPress={() => rebuildPreviewWithUnits(toggleKnowledgeUnit(preview.units, unit.id))} style={[styles.unitCard, !unit.enabled && styles.unitDisabled]}>
              <View style={styles.unitHeader}>
                <Text style={styles.unitTitle}>{unit.title}</Text>
                <Text style={styles.unitBadge}>{coverageLabel(unit.coverageStatus)}</Text>
              </View>
              <Text style={styles.metaText}>
                Schwierigkeit {unit.difficulty}/5 - Wichtigkeit {unit.importance}/5 - {minutesLabel(unit.estimatedMinutes)}
                {sourcePagesLabel(unit) ? ` - ${sourcePagesLabel(unit)}` : ''}
              </Text>
              {unit.summary ? <Text style={styles.metaText}>{unit.summary}</Text> : null}
            </Pressable>
          ))}

          <Text style={styles.sectionTitle}>Tagesplan</Text>
          {sessionDays.map((day) => (
            <View key={day.date} style={styles.dayGroup}>
              <View style={styles.dayHeader}>
                <View style={styles.dayHeaderText}>
                  <Text style={styles.dayTitle}>{day.label}</Text>
                  <Text style={styles.metaText}>{dayLearningSummary(day.sessions)}</Text>
                </View>
                <Pressable onPress={() => openDayEditor('preview', preview.project.id, day.date, day.sessions)} style={styles.miniBtn}><Text style={styles.miniBtnText}>Bearbeiten</Text></Pressable>
              </View>
              <View style={styles.actionRow}>
                <Pressable onPress={() => openSessionEditor('preview', preview.project.id, undefined, day.date)} style={styles.secondaryBtn}><Text style={styles.secondaryText}>Session hinzufuegen</Text></Pressable>
                <Pressable onPress={() => confirmDeleteDay('preview', preview.project.id, day.date)} style={styles.dangerMiniBtn}><Text style={styles.dangerText}>Lerntag loeschen</Text></Pressable>
              </View>
              {day.sessions.map((session) => (
                <View
                  key={session.id}
                  style={[
                    styles.sessionRow,
                    session.sessionType === 'review' && styles.sessionReview,
                    session.sessionType === 'quiz' && styles.sessionQuiz,
                  ]}
                >
                  <View style={styles.sessionHeader}>
                    <Text style={styles.sessionBadge}>{sessionTypeLabel(session.sessionType)}</Text>
                    <Text style={styles.sessionTime}>{sessionTimeLabel(session)}</Text>
                  </View>
                  <Text style={styles.sessionTitle}>{session.title}</Text>
                  <Text style={styles.metaText}>{minutesLabel(session.estimatedMinutes)}</Text>
                  {session.todoTitles[0] ? <Text style={styles.metaText}>{session.todoTitles[0]}</Text> : null}
                  <View style={styles.sessionActions}>
                    <Pressable onPress={() => openSessionEditor('preview', preview.project.id, session)}><Text style={styles.linkText}>Bearbeiten</Text></Pressable>
                    <Pressable onPress={() => void completeSession('preview', session)}><Text style={styles.linkText}>Erledigt</Text></Pressable>
                    <Pressable onPress={() => confirmDeleteSession('preview', session)}><Text style={styles.removeText}>Loeschen</Text></Pressable>
                  </View>
                </View>
              ))}
            </View>
          ))}

          <View style={styles.actionRow}>
            <Pressable onPress={savePreview} style={styles.secondaryBtn}><Text style={styles.secondaryText}>Nur speichern</Text></Pressable>
            <Pressable onPress={applyPreview} style={styles.primaryHalf}><Text style={styles.primaryText}>Plan uebernehmen</Text></Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === 'detail' && selectedProject && selectedPlan) {
    const selectedSessionDays = groupSessionsByDay(selectedPlan.sessions.filter((session) => !session.completed));

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => setMode('home')} style={styles.backBtn}><Text style={styles.backText}>Lernen</Text></Pressable>
          <Text style={styles.title}>{selectedProject.title}</Text>
          <Text style={styles.subtitle}>{selectedPlan.feasible ? 'Plan ist realistisch' : selectedPlan.recommendation}</Text>
          <View style={styles.actionRow}>
            <Pressable onPress={() => void exportSelected('pdf')} style={styles.secondaryBtn}><Text style={styles.secondaryText}>PDF exportieren</Text></Pressable>
            <Pressable onPress={() => void exportSelected('docx')} style={styles.secondaryBtn}><Text style={styles.secondaryText}>DOCX exportieren</Text></Pressable>
          </View>
          {renderStudyEditors()}
          <Text style={styles.sectionTitle}>Lernfortschritt</Text>
          {selectedProgressSteps.length ? selectedProgressSteps.slice(0, 12).map((step) => (
            <Pressable key={step.id} onPress={() => void completeStep(step)} style={[styles.sessionRow, step.status === 'done' && styles.unitDisabled]}>
              <Text style={styles.sessionTitle}>{step.title}</Text>
              <Text style={styles.metaText}>{progressStatusLabel(step.status)} - {dayjs(step.scheduledAt).format('DD.MM. HH:mm')} - {minutesLabel(step.estimatedMinutes)}</Text>
            </Pressable>
          )) : <Text style={styles.emptyText}>Noch keine Fortschrittsschritte.</Text>}
          <Text style={styles.sectionTitle}>Lerntage</Text>
          {selectedSessionDays.length ? selectedSessionDays.map((day) => (
            <View key={day.date} style={styles.dayGroup}>
              <View style={styles.dayHeader}>
                <View style={styles.dayHeaderText}>
                  <Text style={styles.dayTitle}>{day.label}</Text>
                  <Text style={styles.metaText}>{dayLearningSummary(day.sessions)}</Text>
                </View>
                <Pressable onPress={() => openDayEditor('detail', selectedProject.id, day.date, day.sessions)} style={styles.miniBtn}><Text style={styles.miniBtnText}>Bearbeiten</Text></Pressable>
              </View>
              <View style={styles.actionRow}>
                <Pressable onPress={() => openSessionEditor('detail', selectedProject.id, undefined, day.date)} style={styles.secondaryBtn}><Text style={styles.secondaryText}>Session hinzufuegen</Text></Pressable>
                <Pressable onPress={() => confirmDeleteDay('detail', selectedProject.id, day.date)} style={styles.dangerMiniBtn}><Text style={styles.dangerText}>Lerntag loeschen</Text></Pressable>
              </View>
              {day.sessions.map((session) => (
                <View key={session.id} style={[styles.sessionRow, session.sessionType === 'review' && styles.sessionReview, session.sessionType === 'quiz' && styles.sessionQuiz]}>
                  <View style={styles.sessionHeader}>
                    <Text style={styles.sessionBadge}>{sessionTypeLabel(session.sessionType)}</Text>
                    <Text style={styles.sessionTime}>{sessionTimeLabel(session)}</Text>
                  </View>
                  <Text style={styles.sessionTitle}>{session.title}</Text>
                  <Text style={styles.metaText}>{minutesLabel(session.estimatedMinutes)}</Text>
                  {session.note ? <Text style={styles.metaText}>{session.note}</Text> : null}
                  <View style={styles.sessionActions}>
                    <Pressable onPress={() => openSessionEditor('detail', selectedProject.id, session)}><Text style={styles.linkText}>Bearbeiten</Text></Pressable>
                    <Pressable onPress={() => void completeSession('detail', session)}><Text style={styles.linkText}>Erledigt</Text></Pressable>
                    <Pressable onPress={() => confirmDeleteSession('detail', session)}><Text style={styles.removeText}>Loeschen</Text></Pressable>
                  </View>
                </View>
              ))}
            </View>
          )) : <Text style={styles.emptyText}>Keine offenen Lerntage.</Text>}
          <Text style={styles.sectionTitle}>Lerneinheiten</Text>
          {selectedUnits.map((unit) => (
            <View key={unit.id} style={styles.unitCard}>
              <View style={styles.unitHeader}>
                <Text style={styles.unitTitle}>{unit.title}</Text>
                <Text style={styles.unitBadge}>{coverageLabel(unit.coverageStatus)}</Text>
              </View>
              <Text style={styles.metaText}>Schwierigkeit {unit.difficulty}/5 - Wichtigkeit {unit.importance}/5 - {minutesLabel(unit.estimatedMinutes)}</Text>
            </View>
          ))}
          <Pressable onPress={() => confirmRemoveProject(selectedProject)} style={styles.dangerBtn}><Text style={styles.dangerText}>Lernprojekt loeschen</Text></Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Lernen</Text>
          <Pressable onPress={openCreateProject} style={styles.newBtn}>
            <Text style={styles.newBtnText}>Neues Lernprojekt</Text>
          </Pressable>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.stat}><Text style={styles.statValue}>{projects.length}</Text><Text style={styles.statLabel}>Projekte</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{todaySessions.length}</Text><Text style={styles.statLabel}>Heute</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{upcomingReviews.length}</Text><Text style={styles.statLabel}>Wiederholungen</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Aktive Lernprojekte</Text>
        {projects.length ? projects.map((project) => {
          const plan = plans.find((item) => item.projectId === project.id);
          return (
            <Pressable key={project.id} onPress={() => openProject(project.id)} onLongPress={() => confirmRemoveProject(project)} style={styles.projectCard}>
              <Text style={styles.projectTitle}>{project.title}</Text>
              <Text style={styles.metaText}>{project.examDate ? `Pruefung: ${project.examDate}` : 'Ohne Pruefungsdatum'} - {targetLevelLabel(project.targetLevel)}</Text>
              {plan ? <Text style={plan.feasible ? styles.successText : styles.warningText}>{plan.recommendation}</Text> : null}
              <Pressable onPress={() => confirmRemoveProject(project)} style={styles.inlineDanger}>
                <Text style={styles.removeText}>Lernprojekt loeschen</Text>
              </Pressable>
            </Pressable>
          );
        }) : <Text style={styles.emptyText}>Noch kein Lernprojekt.</Text>}

        <Text style={styles.sectionTitle}>Naechste Wiederholungen</Text>
        {upcomingReviews.map((item) => (
          <View key={item.id} style={styles.sessionRow}>
            <Text style={styles.sessionTitle}>Wiederholen</Text>
            <Text style={styles.metaText}>{dayjs(item.dueAt).format('DD.MM. HH:mm')} - {minutesLabel(item.estimatedMinutes)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  fontFamily: ReturnType<typeof useAppTheme>['fontFamily'],
) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { padding: 18, paddingBottom: 120, gap: 14 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    title: { color: colors.text, fontSize: 32, fontWeight: '900', fontFamily: fontFamily.bold },
    subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20, fontFamily: fontFamily.regular },
    notice: { color: colors.textMuted, lineHeight: 20, backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
    card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14 },
    cardTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 10, fontFamily: fontFamily.bold },
    editorCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.primary, padding: 14, gap: 2 },
    label: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 7, fontFamily: fontFamily.bold },
    input: { backgroundColor: colors.cardSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, fontSize: 15, fontFamily: fontFamily.regular },
    textarea: { minHeight: 120, textAlignVertical: 'top' },
    smallTextarea: { minHeight: 72, textAlignVertical: 'top' },
    rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
    chip: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.cardSecondary },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.text, fontWeight: '800', fontFamily: fontFamily.bold },
    chipTextActive: { color: colors.primaryText },
    primaryBtn: { minHeight: 52, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    primaryHalf: { flex: 1, minHeight: 50, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: colors.primaryText, fontWeight: '900', fontFamily: fontFamily.bold },
    secondaryBtn: { flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
    secondaryWide: { minHeight: 46, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
    secondaryText: { color: colors.text, fontWeight: '800', fontFamily: fontFamily.bold, textAlign: 'center' },
    miniBtn: { minHeight: 34, borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardSecondary },
    miniBtnText: { color: colors.text, fontSize: 12, fontWeight: '900', fontFamily: fontFamily.bold },
    newBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
    newBtnText: { color: colors.primaryText, fontWeight: '900', fontFamily: fontFamily.bold },
    backBtn: { alignSelf: 'flex-start' },
    backText: { color: colors.primary, fontWeight: '900', fontFamily: fontFamily.bold },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    stat: { flexGrow: 1, flexBasis: '47%', backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12 },
    statValue: { color: colors.text, fontSize: 18, fontWeight: '900', fontFamily: fontFamily.bold },
    statLabel: { color: colors.textMuted, marginTop: 4, fontSize: 12, fontFamily: fontFamily.regular },
    statusBox: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.success, padding: 14 },
    statusBoxWarning: { borderColor: colors.warning },
    statusBoxDanger: { borderColor: colors.danger },
    statusTitle: { color: colors.success, fontSize: 16, fontWeight: '900', marginBottom: 4, fontFamily: fontFamily.bold },
    statusTitleWarning: { color: colors.warning },
    statusTitleDanger: { color: colors.danger },
    sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 8, fontFamily: fontFamily.bold },
    projectCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
    projectTitle: { color: colors.text, fontSize: 17, fontWeight: '900', fontFamily: fontFamily.bold },
    unitCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
    unitDisabled: { opacity: 0.45 },
    unitHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
    unitTitle: { flex: 1, color: colors.text, fontWeight: '900', fontSize: 15, fontFamily: fontFamily.bold },
    unitBadge: { color: colors.primary, backgroundColor: colors.cardSecondary, borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: '900', fontFamily: fontFamily.bold },
    dayGroup: { gap: 8 },
    dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    dayHeaderText: { flex: 1 },
    dayTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '900', textTransform: 'uppercase', fontFamily: fontFamily.bold },
    sessionRow: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
    sessionReview: { borderColor: colors.warning },
    sessionQuiz: { borderColor: colors.success },
    sessionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 7 },
    sessionBadge: { color: colors.primary, fontSize: 12, fontWeight: '900', fontFamily: fontFamily.bold },
    sessionTime: { color: colors.textMuted, fontSize: 12, fontWeight: '800', fontFamily: fontFamily.bold },
    sessionTitle: { color: colors.text, fontWeight: '800', fontFamily: fontFamily.bold },
    sessionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
    linkText: { color: colors.primary, fontWeight: '900', fontFamily: fontFamily.bold },
    metaText: { color: colors.textMuted, lineHeight: 19, marginTop: 4, fontFamily: fontFamily.regular },
    emptyText: { color: colors.textMuted, padding: 12, fontFamily: fontFamily.regular },
    warningText: { color: colors.warning, lineHeight: 20, fontFamily: fontFamily.bold },
    successText: { color: colors.success, lineHeight: 20, fontFamily: fontFamily.bold },
    assetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    assetText: { flex: 1, color: colors.text, fontFamily: fontFamily.regular },
    removeText: { color: colors.danger, fontWeight: '800', fontFamily: fontFamily.bold },
    inlineDanger: { alignSelf: 'flex-start', marginTop: 10 },
    dangerMiniBtn: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
    dangerBtn: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
    dangerText: { color: colors.danger, fontWeight: '900', fontFamily: fontFamily.bold },
  });
}
