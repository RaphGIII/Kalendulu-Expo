import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
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
  loadStudyData,
  saveStudyProjectBundle,
  updateStudyDay,
  updateStudySession,
  validateStudyFileAgainstTier,
  addStudyUsagePages,
  completeStudyProgressStep,
  type KnowledgeUnit,
  type DetectedStudySection,
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
type MaterialInputMode = 'topics' | 'text' | 'files';
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

const FORCE_PREMIUM_FOR_LOCAL_TESTING = true;


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

function normalizeStudyRelevanceText(value: string) {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

const STUDY_RELEVANCE_WORDS = [
  'definition', 'funktion', 'struktur', 'system', 'modell', 'theorie', 'konzept', 'prinzip',
  'mechanismus', 'ursache', 'folge', 'prozess', 'entwicklung', 'klassifikation', 'diagnostik',
  'therapie', 'klinik', 'pathophysiologie', 'histologie', 'anatomie', 'physiologie', 'biochemie',
  'embryologie', 'topographie', 'innervation', 'versorgung', 'arterie', 'vene', 'nerv', 'muskel',
  'organ', 'zelle', 'gewebe', 'rezeptor', 'enzym', 'hormon', 'signalweg', 'syndrom', 'symptom',
  'prüfung', 'pruefung', 'merke', 'wichtig', 'lernziel', 'kapitel', 'übersicht', 'übersicht',
];

const STUDY_NOISE_WORDS = [
  'raphael gmeiner', 'matrikelnummer', 'studentennummer', 'semester', 'email', 'e-mail',
  'universität', 'universitaet', 'friedrich-schiller', 'dozent', 'professor', 'copyright',
  'downloaded', 'generated', 'erstellt von', 'bearbeitet von', 'seite ', 'lecture notes',
  'slide ', 'foliennummer', 'datum', 'name:', 'vorname', 'nachname', 'adresse',
];

function looksLikeOnlyPersonName(line: string) {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  const capitalized = words.filter((word) => /^[A-ZÄÖÜ][a-zäöüß-]{2,}$/.test(word)).length;
  const hasStudySignal = STUDY_RELEVANCE_WORDS.some((word) => normalizeStudyRelevanceText(line).includes(normalizeStudyRelevanceText(word)));
  return capitalized === words.length && !hasStudySignal;
}

function studyLineScore(line: string) {
  const clean = normalizeStudyRelevanceText(line);
  const alphaCount = (line.match(/[A-Za-zÄÖÜäöüß]/g) ?? []).length;
  const tokenCount = (line.match(/[A-Za-zÄÖÜäöüß]{3,}/g) ?? []).length;
  const studySignals = STUDY_RELEVANCE_WORDS.filter((word) => clean.includes(normalizeStudyRelevanceText(word))).length;
  const hasColonStructure = /[:;]/.test(line) && tokenCount >= 3;
  const hasAcademicPattern = /\b([A-ZÄÖÜ][a-zäöüß]+\s+[a-zäöüß]+|[a-zäöüß]+ung|[a-zäöüß]+tion|[a-zäöüß]+ismus)\b/.test(line);
  const listLike = /^[-*•]\s+/.test(line) || /,/.test(line);

  let score = 0;
  score += Math.min(4, studySignals * 2);
  score += tokenCount >= 6 ? 2 : 0;
  score += tokenCount >= 12 ? 2 : 0;
  score += hasColonStructure ? 1 : 0;
  score += hasAcademicPattern ? 1 : 0;
  score += listLike ? 1 : 0;
  score += alphaCount > 40 ? 1 : 0;

  if (STUDY_NOISE_WORDS.some((word) => clean.includes(normalizeStudyRelevanceText(word)))) score -= 4;
  if (looksLikeOnlyPersonName(line)) score -= 5;
  if ((line.match(/\d/g) ?? []).length > line.length * 0.35) score -= 2;
  if (/^[\W_\d]+$/.test(line)) score -= 6;
  if (/https?:\/\//i.test(line) || /www\./i.test(line)) score -= 6;

  return score;
}

function sanitizeExtractedStudyText(value: string) {
  const lines = value
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const cleaned = lines.filter((line) => {
    const lower = line.toLowerCase();
    if (line.length < 3) return false;
    if (/^\d+$/.test(line)) return false;
    if (/^seite\s+\d+/i.test(line)) return false;
    if (/^(abb\.|fig\.|figure|table|tabelle)\s*\d+/i.test(line) && line.length < 40) return false;
    if (/https?:\/\//i.test(line) || /www\./i.test(line)) return false;
    if (/^[\W_\d]+$/.test(line)) return false;
    if ((line.match(/\d/g) ?? []).length > line.length * 0.45) return false;
    if ((line.match(/[A-Za-zÄÖÜäöüß]/g) ?? []).length < 3) return false;
    if (lower.includes('copyright') || lower.includes('all rights reserved')) return false;
    if (lower.includes('downloaded from') || lower.includes('generated by')) return false;
    if (looksLikeOnlyPersonName(line)) return false;
    return studyLineScore(line) >= 0;
  });

  return cleaned.join('\n');
}

function combineStudyText(...parts: (string | undefined)[]) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('\n\n');
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

function sessionTimeLabel(session: StudySession) {
  return `${dayjs(session.scheduledStart).format('HH:mm')}-${dayjs(session.scheduledEnd).format('HH:mm')}`;
}

function progressStatusLabel(status: StudyProgressStep['status']) {
  if (status === 'done') return 'Erledigt';
  if (status === 'missed') return 'Verpasst';
  if (status === 'rescheduled') return 'Verschoben';
  if (status === 'deleted') return 'Gelöscht';
  return 'Offen';
}

function feasibilityTone(plan: StudyPlan): 'success' | 'warning' | 'danger' {
  if (plan.feasible) return 'success';
  if ((plan.overloadMinutes ?? 0) <= plan.availableMinutes * 0.25) return 'warning';
  return 'danger';
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
    const dayLabel = dayjs(session.scheduledStart).format('DD.MM.YYYY');
    for (const title of session.todoTitles) {
      const fullTitle = `Lerntag ${dayLabel}: ${title}`;
      if (input.existingTodoTitles.has(fullTitle)) continue;
      input.existingTodoTitles.add(fullTitle);
      todos.push({
        id: `study_todo_${session.id}_${todos.length}`,
        title: fullTitle,
        reason: `${input.project.title} · Lerntag ${dayLabel}`,
        priority: session.sessionType === 'review' ? 'medium' : 'high',
        subcategory: `Lerntag ${dayLabel}`,
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
  const recallHabit = `${input.project.title}: Täglicher Active Recall`;
  if (!input.existingHabitTitles.has(recallHabit)) {
    habits.push({
      id: `study_habit_${input.project.id}`,
      title: recallHabit,
      reason: 'Kurze tägliche Wiederholung stabilisiert den Lernplan.',
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
function getStudyDateKey(iso: string) {
  return iso.slice(0, 10);
}

function formatStudyDateTitle(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function groupSessionsByStudyDay(plan: StudyPlan | null | undefined) {
  if (!plan) return [];

  const byDay = new Map<string, StudySession[]>();

  for (const session of plan.sessions) {
    const key = getStudyDateKey(session.scheduledStart);
    byDay.set(key, [...(byDay.get(key) ?? []), session]);
  }

  const learnedUnits = new Set<string>();

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, sessions]) => {
      const sorted = sessions.sort((a, b) =>
        a.scheduledStart.localeCompare(b.scheduledStart),
      );

      const learn = sorted.filter((session) => session.sessionType !== 'review');
      const review = sorted.filter((session) =>
        session.sessionType === 'review' &&
        session.unitIds.some((unitId) => learnedUnits.has(unitId)),
      );
      learn.forEach((session) => session.unitIds.forEach((unitId) => learnedUnits.add(unitId)));

      return {
        dateKey,
        sessions: sorted,
        learn,
        review,
        totalMinutes: sorted.reduce(
          (sum, session) => sum + session.estimatedMinutes,
          0,
        ),
      };
    });
}
export default function StudyScreen() {
  const { colors, fontFamily } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, fontFamily), [colors, fontFamily]);
  const { status: subscription, limits } = useSubscription();
  const activeStudyTier = FORCE_PREMIUM_FOR_LOCAL_TESTING ? 'premium' : subscription.tier;
  const activeLimits = useMemo(() => {
    if (!FORCE_PREMIUM_FOR_LOCAL_TESTING) return limits;

    return {
      ...limits,
      tier: 'premium' as const,
      label: 'Premium Test',
      maxPagesPerFile: 300,
      maxPagesPerMonth: 1000,
      maxFileSizeMb: 100,
      maxActiveProjects: 100,
      allowAiEnhancement: true,
      allowPdfExport: true,
      allowDocxExport: true,
      allowLargeDocuments: true,
    };
  }, [limits]);

  const [mode, setMode] = useState<Mode>('home');
  const [projects, setProjects] = useState<StudyProject[]>([]);
  const [units, setUnits] = useState<KnowledgeUnit[]>([]);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [progressSteps, setProgressSteps] = useState<StudyProgressStep[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [expandedStudyDay, setExpandedStudyDay] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [targetLevel, setTargetLevel] = useState<StudyTargetLevel>('good');
  const [weeklyHours, setWeeklyHours] = useState('8');
  const [availableDaysPerWeek, setAvailableDaysPerWeek] = useState('5');
  const [minutesPerDay, setMinutesPerDay] = useState('90');
  const [materialInputMode, setMaterialInputMode] = useState<MaterialInputMode>('topics');
  const [manualTopicsText, setManualTopicsText] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [extractedMaterialText, setExtractedMaterialText] = useState('');
  const [extractedSections, setExtractedSections] = useState<DetectedStudySection[]>([]);
  const [files, setFiles] = useState<TemporaryStudyAsset[]>([]);
  const [uploadMessages, setUploadMessages] = useState<string[]>([]);
  const [preview, setPreview] = useState<StudyBuildResult | null>(null);
  const [showExamPicker, setShowExamPicker] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const scrollRef = useRef<React.ElementRef<typeof ScrollView> | null>(null);
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

  const totalOpenStudyDays = useMemo(() => {
    const dayKeys = new Set<string>();
    plans.forEach((plan) => {
      plan.sessions
        .filter((session) => !session.completed)
        .forEach((session) => dayKeys.add(session.scheduledStart.slice(0, 10)));
    });
    return dayKeys.size;
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
    setWeeklyHours('8');
    setAvailableDaysPerWeek('5');
    setMinutesPerDay('90');
    setMaterialInputMode('topics');
    setManualTopicsText('');
    setPastedText('');
    setExtractedMaterialText('');
    setExtractedSections([]);
    setFiles([]);
    setUploadMessages([]);
    setPreview(null);
  }

  function showInactiveMediaMessage() {
    Alert.alert(
      'Texterkennung noch nicht aktiv',
      'Texterkennung für Fotos und gescannte PDFs ist noch nicht aktiviert. Bitte nutze aktuell PDFs mit auswählbarem Text, DOCX-, PPTX-Dateien oder manuell eingegebene Themen.',
    );
  }

  function showPaywall(reason: PaywallReason, extra?: string) {
    const copy = PAYWALL_COPY[reason];
    Alert.alert(copy.title, extra ? `${copy.body}\n\n${extra}` : copy.body, [
      {
        text: 'Pläne ansehen',
        onPress: () => router.push('/premium'),
      },
      { text: 'Nicht jetzt', style: 'cancel' },
    ]);
  }

  function handleExamDateChange(_event: DateTimePickerEvent, selectedDate?: Date) {
    setShowExamPicker(false);
    if (!selectedDate) return;
    setExamDate(dayjs(selectedDate).format('YYYY-MM-DD'));
  }

  async function advanceAnalysisProgress(target: number) {
    setAnalysisProgress((prev) => Math.max(prev, Math.min(100, target)));
    await new Promise((resolve) => setTimeout(resolve, 160));
  }

  async function addFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'text/plain',
        'text/markdown',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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
        tier: activeStudyTier,
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
      const extracted = await extractTextFromFile({ ...file, tier: activeStudyTier });
      if (extracted.sections?.length) {
        setExtractedSections((prev) => [
          ...prev,
          ...extracted.sections!.map((section, index) => ({ ...section, orderIndex: prev.length + index })),
        ]);
      }
      if (extracted.text) {
        const cleanedText = sanitizeExtractedStudyText(extracted.text);
        if (cleanedText) {
          setExtractedMaterialText((prev) => combineStudyText(prev, cleanedText));
        }
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
      Alert.alert('Titel fehlt', 'Bitte gib einen Titel für das Lernprojekt ein.');
      return;
    }

    const manualTopics = splitTopics(manualTopicsText);
    const combinedText = combineStudyText(pastedText, extractedMaterialText);

    if (!manualTopics.length && !combinedText.trim() && !extractedSections.length && !files.length) {
      Alert.alert('Stoff fehlt', 'Bitte gib mindestens eine Themenliste, Text oder eine Datei ein.');
      return;
    }

    const weeklyAvailableMinutes = Math.max(1, Number(weeklyHours) || 8) * 60;
    const minutesPerLearningDay = Math.max(15, Number(minutesPerDay) || 90);

    const availability = {
      availableDaysPerWeek: Math.max(1, Math.min(7, Number(availableDaysPerWeek) || 5)),
      minutesPerDay: minutesPerLearningDay,
      preferredTime: 'flexible' as const,
      excludedWeekdays: [] as number[],
      maxSessionMinutes: Math.max(25, Math.min(60, minutesPerLearningDay)),
    };

    try {
      setIsAnalyzing(true);
      setAnalysisProgress(4);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      await advanceAnalysisProgress(18);

      let result = compileStudyPlan({
        title: cleanTitle,
        examDate: examDate.trim() || undefined,
        targetLevel,
        weeklyAvailableMinutes,
        availability,
        bundle: {
          manualTopics,
          pastedText: combinedText,
          pageLearningSections: extractedSections,
          uploadedImages: [],
          uploadedFiles: files,
        },
      });

      await advanceAnalysisProgress(58);

      try {
        const enhanced = await enhanceStudyBuildWithAi(result);
        result = enhanced.result;
        const message = enhanced.message?.replace(/Premium-KI/g, 'KI-Veredelung');
        if (typeof message === 'string' && message.trim().length > 0) {
          setUploadMessages((prev) => [...prev, message]);
        }
      } catch {
        setUploadMessages((prev) => [
          ...prev,
          'Der algorithmische Lernplan wurde erstellt. Die KI-Veredelung war gerade nicht verfügbar.',
        ]);
      }

      await advanceAnalysisProgress(88);
      setPreview(result);
      setMode('preview');
      setExpandedStudyDay(null);
      await advanceAnalysisProgress(100);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 80);
    } finally {
      setTimeout(() => {
        setIsAnalyzing(false);
        setAnalysisProgress(0);
      }, 250);
    }

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
      'Diesen Lerntag löschen?',
      'Alle geplanten Sessions, Todos und Fortschrittsschritte dieses Tages werden entfernt.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Lerntag löschen',
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
    Alert.alert('Lernsession löschen?', 'Diese Session und der zugehörige Fortschrittsschritt werden entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Session löschen',
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

  function getSessionUnits(session: StudySession, availableUnits: KnowledgeUnit[]) {
    const byId = new Map(availableUnits.map((unit) => [unit.id, unit]));
    return session.unitIds.map((id) => byId.get(id)).filter((unit): unit is KnowledgeUnit => Boolean(unit));
  }

  function sessionHintLines(session: StudySession, availableUnits: KnowledgeUnit[]) {
    const relatedUnits = getSessionUnits(session, availableUnits);
    const hints = relatedUnits.flatMap((unit) => {
      if (unit.bulletPoints?.length) return unit.bulletPoints;
      const summaryLines = (unit.summary ?? '')
        .split(/\n+/)
        .map((line) => line.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean);
      const keywordLines = unit.keywords?.slice(0, 5).map((keyword) => `Achte auf ${keyword}`) ?? [];

      return [...summaryLines, ...keywordLines];
    });

    const cleanedHints = [...new Set(hints)]
      .filter((line) => line.length >= 3)
      .filter((line) => !/^unit_/i.test(line))
      .slice(0, 6);

    if (cleanedHints.length) return cleanedHints;
    return session.todoTitles.map((title) => title.replace(/^.*?:\s*/, '')).slice(0, 3);
  }

  function renderStudyDayCards(input: { scope: EditScope; projectId: string; plan: StudyPlan; availableUnits: KnowledgeUnit[] }) {
    const days = groupSessionsByStudyDay(input.plan);

    if (!days.length) {
      return <Text style={styles.emptyText}>Keine geplanten Lerntage.</Text>;
    }

    return days.map((day) => {
      const expanded = expandedStudyDay === `${input.scope}_${day.dateKey}`;
      const expandedKey = `${input.scope}_${day.dateKey}`;

      return (
        <View key={expandedKey} style={styles.studyDayCard}>
          <Pressable
            onPress={() => setExpandedStudyDay(expanded ? null : expandedKey)}
            style={styles.studyDayHeader}
          >
            <View style={styles.dayHeaderText}>
              <Text style={styles.studyDayTitle}>{formatStudyDateTitle(day.dateKey)}</Text>
            </View>
            <Text style={styles.studyDayChevron}>{expanded ? '−' : '+'}</Text>
          </Pressable>

          {expanded ? (
            <View style={styles.studyDayDetails}>
              <View style={styles.dayManagementRow}>
                <Pressable onPress={() => openDayEditor(input.scope, input.projectId, day.dateKey, day.sessions)} style={styles.miniBtn}>
                  <Text style={styles.miniBtnText}>Tag bearbeiten</Text>
                </Pressable>
                <Pressable onPress={() => openSessionEditor(input.scope, input.projectId, undefined, day.dateKey)} style={styles.miniBtn}>
                  <Text style={styles.miniBtnText}>Session hinzufügen</Text>
                </Pressable>
                <Pressable onPress={() => confirmDeleteDay(input.scope, input.projectId, day.dateKey)} style={styles.dangerPillBtn}>
                  <Text style={styles.dangerText}>Tag löschen</Text>
                </Pressable>
              </View>

              <View style={styles.learnBlock}>
                <Text style={styles.dayBlockTitle}>Lernen</Text>
                {day.learn.length ? day.learn.map((session) => (
                  <View key={session.id} style={styles.daySessionCard}>
                    <View style={styles.sessionHeader}>
                      <Text style={styles.sessionTime}>{sessionTimeLabel(session)}</Text>
                      <Text style={styles.sessionBadge}>{sessionTypeLabel(session.sessionType)}</Text>
                    </View>
                    <Text style={styles.sessionTitle}>{session.title.replace(/^Lernen:\s*/i, '')}</Text>
                    {sessionHintLines(session, input.availableUnits).map((hint, index) => (
                      <Text key={`${session.id}_hint_${index}`} style={styles.hintText}>• {hint}</Text>
                    ))}
                    <View style={styles.sessionActions}>
                      <Pressable onPress={() => openSessionEditor(input.scope, input.projectId, session)}><Text style={styles.linkText}>Bearbeiten</Text></Pressable>
                      <Pressable onPress={() => void completeSession(input.scope, session)}><Text style={styles.linkText}>Erledigt</Text></Pressable>
                      <Pressable onPress={() => confirmDeleteSession(input.scope, session)}><Text style={styles.removeText}>Löschen</Text></Pressable>
                    </View>
                  </View>
                )) : <Text style={styles.emptyDayText}>An diesem Tag ist kein neues Lernen geplant.</Text>}
              </View>

              <View style={styles.reviewBlock}>
                <Text style={styles.dayBlockTitle}>Wiederholen</Text>
                {day.review.length ? day.review.map((session) => (
                  <View key={session.id} style={styles.daySessionCard}>
                    <View style={styles.sessionHeader}>
                      <Text style={styles.sessionTime}>{sessionTimeLabel(session)}</Text>
                      <Text style={styles.sessionBadge}>Wiederholen</Text>
                    </View>
                    <Text style={styles.sessionTitle}>{session.title.replace(/^Wiederholen:\s*/i, '').replace(/^Review:\s*/i, '')}</Text>
                    {sessionHintLines(session, input.availableUnits).map((hint, index) => (
                      <Text key={`${session.id}_review_hint_${index}`} style={styles.hintText}>• {hint}</Text>
                    ))}
                    <View style={styles.sessionActions}>
                      <Pressable onPress={() => openSessionEditor(input.scope, input.projectId, session)}><Text style={styles.linkText}>Bearbeiten</Text></Pressable>
                      <Pressable onPress={() => void completeSession(input.scope, session)}><Text style={styles.linkText}>Erledigt</Text></Pressable>
                      <Pressable onPress={() => confirmDeleteSession(input.scope, session)}><Text style={styles.removeText}>Löschen</Text></Pressable>
                    </View>
                  </View>
                )) : <Text style={styles.emptyDayText}>An diesem Tag ist keine Wiederholung geplant.</Text>}
              </View>
            </View>
          ) : null}
        </View>
      );
    });
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
            <Text style={styles.label}>Verfügbare Gesamtzeit in Minuten</Text>
            <TextInput value={dayDraft.availableMinutes} onChangeText={(availableMinutes) => setDayDraft({ ...dayDraft, availableMinutes })} keyboardType="numeric" placeholder="90" placeholderTextColor={colors.textMuted} style={styles.input} />
            <View style={styles.actionRow}>
              <Pressable onPress={() => setDayDraft(null)} style={styles.secondaryBtn}><Text style={styles.secondaryText}>Abbrechen</Text></Pressable>
              <Pressable onPress={() => void saveDayDraft()} style={styles.primaryHalf}><Text style={styles.primaryText}>Speichern</Text></Pressable>
            </View>
          </View>
        ) : null}

        {sessionDraft ? (
          <View style={styles.editorCard}>
            <Text style={styles.cardTitle}>{sessionDraft.sessionId ? 'Lernsession bearbeiten' : 'Freie Lernsession hinzufügen'}</Text>
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
      'Plan übernommen',
      `${result.todosAdded} Todos, ${result.habitsAdded} Habit und ${result.calendarAdded} Kalenderblöcke wurden erstellt.`,
    );
  }

  function openProject(projectId: string) {
    setSelectedProjectId(projectId);
    setMode('detail');
  }

  function openCreateProject() {
    if (projects.length >= activeLimits.maxActiveProjects) {
      showPaywall('active_projects', `Dein aktueller Plan erlaubt ${activeLimits.maxActiveProjects} aktive Lernprojekte.`);
      return;
    }
    resetCreateForm();
    setMode('create');
  }

  function confirmRemoveProject(project: StudyProject) {
    Alert.alert(
      'Lernprojekt löschen?',
      'Dadurch werden der Lernplan, alle Sessions, Wiederholungen, Fortschrittsschritte und zugehörige Todos/Kalenderblöcke gelöscht. Hochgeladene Originaldateien werden nicht gespeichert und sind davon nicht betroffen.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Endgültig löschen',
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
    if (format === 'pdf' && !activeLimits.allowPdfExport) {
      showPaywall('pdf_export');
      return;
    }
    if (format === 'docx' && !activeLimits.allowDocxExport) {
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
    if (format === 'pdf' && !activeLimits.allowPdfExport) {
      showPaywall('pdf_export');
      return;
    }
    if (format === 'docx' && !activeLimits.allowDocxExport) {
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

  if (isAnalyzing) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingScreen}>
          <Text style={styles.title}>Lernplan wird erstellt</Text>
          <Text style={styles.subtitle}>
            Kalendulu bereinigt den Stoff, erkennt Lerneinheiten und verteilt deinen Plan auf realistische Lerntage.
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, analysisProgress))}%` }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(analysisProgress)} %</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (mode === 'create') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => setMode('home')} style={styles.backBtn}>
            <Text style={styles.backText}>Zurück</Text>
          </Pressable>

          <Text style={styles.title}>Neues Lernprojekt</Text>
          <Text style={styles.notice}>
            Bitte lade keine personenbezogenen Patientendaten oder vertraulichen Inhalte hoch. Hochgeladene Fotos
            und Dateien werden nur temporär verarbeitet und anschließend gelöscht. Dauerhaft gespeichert werden
            nur der daraus erzeugte Lernplan, Lerneinheiten, Termine und Wiederholungen.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Titel</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="Anatomie Kopf/Hals" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>Prüfungsdatum optional</Text>
            <Pressable onPress={() => setShowExamPicker(true)} style={styles.dateInput}>
              <Text style={[styles.dateInputText, !examDate && styles.placeholderText]}>
                {examDate ? dayjs(examDate).format('DD.MM.YYYY') : 'Datum auswählen'}
              </Text>
            </Pressable>
            {showExamPicker ? (
              <DateTimePicker
                value={examDate ? new Date(`${examDate}T12:00:00`) : new Date()}
                mode="date"
                display="spinner"
                locale="de-DE"
                minimumDate={new Date()}
                onChange={handleExamDateChange}
              />
            ) : null}
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
            <Text style={styles.label}>Lernzeit pro Woche in Stunden</Text>
            <TextInput value={weeklyHours} onChangeText={setWeeklyHours} keyboardType="numeric" placeholder="8" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.notice}>
              Bevor dein Plan erstellt wird, prüfen wir, ob deine verfügbare Lernzeit für den gesamten Stoff realistisch ausreicht.
            </Text>
            <Text style={styles.label}>Verfügbare Tage pro Woche</Text>
            <TextInput value={availableDaysPerWeek} onChangeText={setAvailableDaysPerWeek} keyboardType="numeric" placeholder="5" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>Minuten pro Lerntag</Text>
            <TextInput value={minutesPerDay} onChangeText={setMinutesPerDay} keyboardType="numeric" placeholder="90" placeholderTextColor={colors.textMuted} style={styles.input} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Lernmaterial auswählen</Text>
            <View style={styles.inputModeGrid}>
              {[
                ['topics', 'Themenliste'],
                ['text', 'Text'],
                ['files', 'Datei'],
              ].map(([id, label]) => (
                <Pressable
                  key={id}
                  onPress={() => setMaterialInputMode(id as MaterialInputMode)}
                  style={[styles.inputModeCard, materialInputMode === id && styles.inputModeCardActive]}
                >
                  <Text style={[styles.inputModeText, materialInputMode === id && styles.inputModeTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {materialInputMode === 'topics' ? (
              <>
                <Text style={styles.label}>Themenliste</Text>
                <TextInput
                  value={manualTopicsText}
                  onChangeText={setManualTopicsText}
                  placeholder={'Schädelbasis\nHirnnerven\nN. trigeminus\nOrbita'}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.textarea]}
                  multiline
                />
              </>
            ) : null}

            {materialInputMode === 'text' ? (
              <>
                <Text style={styles.label}>Text einfügen</Text>
                <TextInput
                  value={pastedText}
                  onChangeText={setPastedText}
                  placeholder="Optional Lerntext oder Notizen einfügen"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.textarea]}
                  multiline
                />
              </>
            ) : null}

            {materialInputMode === 'files' ? (
              <>
                <Text style={styles.cardTitle}>PDF, DOCX, PPTX, TXT und MD</Text>
            <Text style={styles.notice}>
              PDFs, DOCX- und PPTX-Dateien werden nur temporär zur Textextraktion verarbeitet und anschließend gelöscht. Dauerhaft gespeichert werden nur Lerneinheiten, Lernplan, Termine und Wiederholungen.
            </Text>
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
            {extractedMaterialText ? (
              <Text style={styles.successText}>Dateitext wurde bereinigt und intern zur Analyse hinzugefügt. Er wird nicht im Textfeld angezeigt.</Text>
            ) : null}
              </>
            ) : null}
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
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => setMode('create')} style={styles.backBtn}><Text style={styles.backText}>Bearbeiten</Text></Pressable>
          <Text style={styles.title}>Analyse-Vorschau</Text>

          <View style={[styles.bigFeasibilityCard, tone === 'warning' && styles.bigFeasibilityWarning, tone === 'danger' && styles.bigFeasibilityDanger]}>
            <Text style={[styles.bigFeasibilityText, tone === 'warning' && styles.statusTitleWarning, tone === 'danger' && styles.statusTitleDanger]}>
              {preview.plan.feasible ? 'Realistisch' : 'Nicht realistisch'}
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
            <Pressable onPress={() => void applyPreview()} style={styles.primaryHalf}><Text style={styles.primaryText}>Plan übernehmen</Text></Pressable>
            <Pressable onPress={() => void exportPreview('pdf')} style={styles.secondaryBtn}><Text style={styles.secondaryText}>Lernplan als PDF</Text></Pressable>
          </View>
          <Pressable onPress={() => void exportPreview('docx')} style={styles.secondaryWide}><Text style={styles.secondaryText}>Lernplan als DOCX</Text></Pressable>

          {renderStudyEditors()}

          <Text style={styles.sectionTitle}>Tagesübersicht</Text>
          {renderStudyDayCards({
            scope: 'preview',
            projectId: preview.project.id,
            plan: preview.plan,
            availableUnits: preview.units,
          })}

          <View style={styles.actionRow}>
            <Pressable onPress={savePreview} style={styles.secondaryBtn}><Text style={styles.secondaryText}>Nur speichern</Text></Pressable>
            <Pressable onPress={applyPreview} style={styles.primaryHalf}><Text style={styles.primaryText}>Plan übernehmen</Text></Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === 'detail' && selectedProject && selectedPlan) {
    const openSelectedPlan = { ...selectedPlan, sessions: selectedPlan.sessions.filter((session) => !session.completed) };

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
          {renderStudyDayCards({
            scope: 'detail',
            projectId: selectedProject.id,
            plan: openSelectedPlan,
            availableUnits: selectedUnits,
          })}
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
          <Pressable onPress={() => confirmRemoveProject(selectedProject)} style={styles.dangerBtn}><Text style={styles.dangerText}>Lernprojekt löschen</Text></Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Lernen</Text>
          <Pressable onPress={openCreateProject} style={styles.newBtn}>
            <Text style={styles.newBtnText}>Neues Lernprojekt</Text>
          </Pressable>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.stat}><Text style={styles.statValue}>{projects.length}</Text><Text style={styles.statLabel}>Projekte</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{todaySessions.length}</Text><Text style={styles.statLabel}>Heute</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{totalOpenStudyDays}</Text><Text style={styles.statLabel}>Lerntage</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Aktive Lernprojekte</Text>
        {projects.length ? projects.map((project) => {
          const plan = plans.find((item) => item.projectId === project.id);
          return (
            <Pressable key={project.id} onPress={() => openProject(project.id)} onLongPress={() => confirmRemoveProject(project)} style={styles.projectCard}>
              <Text style={styles.projectTitle}>{project.title}</Text>
              <Text style={styles.metaText}>{project.examDate ? `Prüfung: ${project.examDate}` : 'Ohne Prüfungsdatum'} - {targetLevelLabel(project.targetLevel)}</Text>
              {plan ? <Text style={plan.feasible ? styles.successText : styles.warningText}>{plan.recommendation}</Text> : null}
              <Pressable onPress={() => confirmRemoveProject(project)} style={styles.inlineDanger}>
                <Text style={styles.removeText}>Lernprojekt löschen</Text>
              </Pressable>
            </Pressable>
          );
        }) : <Text style={styles.emptyText}>Noch kein Lernprojekt.</Text>}
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
    loadingScreen: { flex: 1, padding: 24, justifyContent: 'center', gap: 18 },
    progressTrack: { height: 12, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.cardSecondary, borderWidth: 1, borderColor: colors.border },
    progressFill: { height: '100%', borderRadius: 999, backgroundColor: colors.primary },
    progressText: { color: colors.text, fontSize: 18, fontWeight: '900', fontFamily: fontFamily.bold, textAlign: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    title: { color: colors.text, fontSize: 32, fontWeight: '900', fontFamily: fontFamily.bold },
    subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20, fontFamily: fontFamily.regular },
    notice: { color: colors.textMuted, lineHeight: 20, backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
    card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14 },
    cardTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 10, fontFamily: fontFamily.bold },
    editorCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.primary, padding: 14, gap: 2 },
    label: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 7, fontFamily: fontFamily.bold },
    input: { backgroundColor: colors.cardSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, fontSize: 15, fontFamily: fontFamily.regular },
    dateInput: { backgroundColor: colors.cardSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 12 },
    dateInputText: { color: colors.text, fontSize: 15, fontFamily: fontFamily.bold },
    placeholderText: { color: colors.textMuted, fontFamily: fontFamily.regular },
    textarea: { minHeight: 120, textAlignVertical: 'top' },
    smallTextarea: { minHeight: 72, textAlignVertical: 'top' },
    rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    inputModeGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    inputModeCard: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSecondary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
    inputModeCardActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    inputModeText: { color: colors.text, fontWeight: '900', fontFamily: fontFamily.bold },
    inputModeTextActive: { color: colors.primaryText },
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
    bigFeasibilityCard: { backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: colors.success, padding: 18, gap: 6 },
    bigFeasibilityWarning: { borderColor: colors.warning },
    bigFeasibilityDanger: { borderColor: colors.danger },
    bigFeasibilityText: { color: colors.success, fontSize: 28, fontWeight: '900', fontFamily: fontFamily.bold },
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
    studyDayCard: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16, marginBottom: 8 },
    studyDayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    studyDayTitle: { color: colors.text, fontSize: 18, fontWeight: '900', fontFamily: fontFamily.bold, textTransform: 'capitalize' },
    studyDayChevron: { color: colors.primary, fontSize: 28, fontWeight: '900', fontFamily: fontFamily.bold },
    studyDayDetails: { marginTop: 14, gap: 12 },
    dayManagementRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    learnBlock: { borderRadius: 16, padding: 12, backgroundColor: 'rgba(234, 179, 8, 0.12)', gap: 8 },
    reviewBlock: { borderRadius: 16, padding: 12, backgroundColor: 'rgba(20, 184, 166, 0.12)', gap: 8 },
    dayBlockTitle: { color: colors.text, fontSize: 15, fontWeight: '900', fontFamily: fontFamily.bold, marginBottom: 2 },
    daySessionCard: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12 },
    hintText: { color: colors.textMuted, lineHeight: 19, marginTop: 4, fontFamily: fontFamily.regular },
    emptyDayText: { color: colors.textMuted, fontFamily: fontFamily.regular },
    dangerPillBtn: { minHeight: 34, borderRadius: 999, borderWidth: 1, borderColor: colors.danger, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
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
