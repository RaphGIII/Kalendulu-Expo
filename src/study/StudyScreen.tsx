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
  deleteStudyProject,
  deleteTemporaryStudyFile,
  enhanceKnowledgeUnitsWithAi,
  enhanceStudyPlanWithAi,
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
  validateStudyFileAgainstTier,
  addStudyUsagePages,
  completeStudyProgressStep,
  type KnowledgeUnit,
  type StudyBuildResult,
  type StudyPlan,
  type StudyProgressStep,
  type StudyProject,
  type StudyTargetLevel,
  type TemporaryStudyAsset,
} from './index';
import { exportStudyPlanAsDocx, exportStudyPlanAsPdf } from './export/studyPlanExportClient';

type Mode = 'home' | 'create' | 'preview' | 'detail';

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
        text: 'Premium ansehen',
        onPress: () => Alert.alert('Kalendulu Premium', 'Du findest Premium, Restore Purchases und Limits in den Einstellungen.'),
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

    const result = compileStudyPlan({
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

  async function improveUnits() {
    if (!preview) return;
    if (!limits.allowAiEnhancement) {
      showPaywall('ai_enhancement');
      return;
    }
    const result = await enhanceKnowledgeUnitsWithAi(preview.units);
    setPreview({ ...preview, units: result.units });
    Alert.alert('KI-Veredelung', result.message);
  }

  async function improvePlan() {
    if (!preview) return;
    if (!limits.allowAiEnhancement) {
      showPaywall('ai_enhancement');
      return;
    }
    const result = await enhanceStudyPlanWithAi(preview.plan);
    setPreview({ ...preview, plan: result.plan });
    Alert.alert('KI-Veredelung', result.message);
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

  async function removeProject(projectId: string) {
    await deleteStudyProject(projectId);
    await reload();
    setMode('home');
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
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => setMode('create')} style={styles.backBtn}><Text style={styles.backText}>Bearbeiten</Text></Pressable>
          <Text style={styles.title}>Analyse-Vorschau</Text>

          <View style={styles.statsGrid}>
            <View style={styles.stat}><Text style={styles.statValue}>{preview.units.length}</Text><Text style={styles.statLabel}>Einheiten</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{minutesLabel(preview.plan.learningMinutes)}</Text><Text style={styles.statLabel}>Lernen</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{minutesLabel(preview.plan.reviewMinutes)}</Text><Text style={styles.statLabel}>Reviews</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{preview.plan.feasible ? 'OK' : 'Eng'}</Text><Text style={styles.statLabel}>Machbarkeit</Text></View>
          </View>

          <Text style={preview.plan.feasible ? styles.successText : styles.warningText}>{preview.plan.recommendation}</Text>
          {preview.plan.warnings?.map((warning) => (
            <Text key={warning} style={styles.warningText}>{warning}</Text>
          ))}

          <View style={styles.actionRow}>
            <Pressable onPress={improveUnits} style={styles.secondaryBtn}><Text style={styles.secondaryText}>Mit KI Units verbessern</Text></Pressable>
            <Pressable onPress={improvePlan} style={styles.secondaryBtn}><Text style={styles.secondaryText}>Mit KI Plan verbessern</Text></Pressable>
          </View>

          <Text style={styles.sectionTitle}>Knowledge Units</Text>
          {preview.units.map((unit) => (
            <Pressable key={unit.id} onPress={() => rebuildPreviewWithUnits(toggleKnowledgeUnit(preview.units, unit.id))} style={[styles.unitCard, !unit.enabled && styles.unitDisabled]}>
              <Text style={styles.unitTitle}>{unit.title}</Text>
              <Text style={styles.metaText}>Schwierigkeit {unit.difficulty}/5 · Wichtigkeit {unit.importance}/5 · {minutesLabel(unit.estimatedMinutes)} · {unit.cognitiveType} · {unit.coverageStatus}</Text>
              <Text style={styles.metaText}>{unit.keywords.join(', ') || 'Keine Keywords'}</Text>
            </Pressable>
          ))}

          <Text style={styles.sectionTitle}>Plan-Vorschau</Text>
          {preview.plan.sessions.slice(0, 20).map((session) => (
            <View key={session.id} style={styles.sessionRow}>
              <Text style={styles.sessionTitle}>{session.title}</Text>
              <Text style={styles.metaText}>{new Date(session.scheduledStart).toLocaleString()} · {minutesLabel(session.estimatedMinutes)}</Text>
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
          <Text style={styles.sectionTitle}>Lernfortschritt</Text>
          {selectedProgressSteps.length ? selectedProgressSteps.slice(0, 12).map((step) => (
            <Pressable key={step.id} onPress={() => void completeStep(step)} style={[styles.sessionRow, step.status === 'done' && styles.unitDisabled]}>
              <Text style={styles.sessionTitle}>{step.title}</Text>
              <Text style={styles.metaText}>{step.status} · {new Date(step.scheduledAt).toLocaleString()} · {minutesLabel(step.estimatedMinutes)}</Text>
            </Pressable>
          )) : <Text style={styles.emptyText}>Noch keine Fortschrittsschritte.</Text>}
          <Text style={styles.sectionTitle}>Offene Sessions</Text>
          {selectedPlan.sessions.filter((session) => !session.completed).slice(0, 12).map((session) => (
            <View key={session.id} style={styles.sessionRow}>
              <Text style={styles.sessionTitle}>{session.title}</Text>
              <Text style={styles.metaText}>{new Date(session.scheduledStart).toLocaleString()} · {minutesLabel(session.estimatedMinutes)}</Text>
            </View>
          ))}
          <Text style={styles.sectionTitle}>Knowledge Units</Text>
          {selectedUnits.map((unit) => (
            <View key={unit.id} style={styles.unitCard}>
              <Text style={styles.unitTitle}>{unit.title}</Text>
              <Text style={styles.metaText}>S {unit.difficulty}/5 · W {unit.importance}/5 · {minutesLabel(unit.estimatedMinutes)} · {unit.coverageStatus}</Text>
            </View>
          ))}
          <Pressable onPress={() => void removeProject(selectedProject.id)} style={styles.dangerBtn}><Text style={styles.dangerText}>Projekt loeschen</Text></Pressable>
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
          <View style={styles.stat}><Text style={styles.statValue}>{upcomingReviews.length}</Text><Text style={styles.statLabel}>Reviews</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Aktive Lernprojekte</Text>
        {projects.length ? projects.map((project) => {
          const plan = plans.find((item) => item.projectId === project.id);
          return (
            <Pressable key={project.id} onPress={() => openProject(project.id)} style={styles.projectCard}>
              <Text style={styles.projectTitle}>{project.title}</Text>
              <Text style={styles.metaText}>{project.examDate ? `Pruefung: ${project.examDate}` : 'Ohne Pruefungsdatum'} · {project.targetLevel}</Text>
              {plan ? <Text style={plan.feasible ? styles.successText : styles.warningText}>{plan.recommendation}</Text> : null}
            </Pressable>
          );
        }) : <Text style={styles.emptyText}>Noch kein Lernprojekt.</Text>}

        <Text style={styles.sectionTitle}>Naechste Wiederholungen</Text>
        {upcomingReviews.map((item) => (
          <View key={item.id} style={styles.sessionRow}>
            <Text style={styles.sessionTitle}>Review</Text>
            <Text style={styles.metaText}>{new Date(item.dueAt).toLocaleString()} · {minutesLabel(item.estimatedMinutes)}</Text>
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
    label: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 7, fontFamily: fontFamily.bold },
    input: { backgroundColor: colors.cardSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, fontSize: 15, fontFamily: fontFamily.regular },
    textarea: { minHeight: 120, textAlignVertical: 'top' },
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
    newBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
    newBtnText: { color: colors.primaryText, fontWeight: '900', fontFamily: fontFamily.bold },
    backBtn: { alignSelf: 'flex-start' },
    backText: { color: colors.primary, fontWeight: '900', fontFamily: fontFamily.bold },
    statsGrid: { flexDirection: 'row', gap: 10 },
    stat: { flex: 1, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12 },
    statValue: { color: colors.text, fontSize: 18, fontWeight: '900', fontFamily: fontFamily.bold },
    statLabel: { color: colors.textMuted, marginTop: 4, fontSize: 12, fontFamily: fontFamily.regular },
    sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 8, fontFamily: fontFamily.bold },
    projectCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
    projectTitle: { color: colors.text, fontSize: 17, fontWeight: '900', fontFamily: fontFamily.bold },
    unitCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
    unitDisabled: { opacity: 0.45 },
    unitTitle: { color: colors.text, fontWeight: '900', fontSize: 15, marginBottom: 6, fontFamily: fontFamily.bold },
    sessionRow: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
    sessionTitle: { color: colors.text, fontWeight: '800', fontFamily: fontFamily.bold },
    metaText: { color: colors.textMuted, lineHeight: 19, marginTop: 4, fontFamily: fontFamily.regular },
    emptyText: { color: colors.textMuted, padding: 12, fontFamily: fontFamily.regular },
    warningText: { color: colors.warning, lineHeight: 20, fontFamily: fontFamily.bold },
    successText: { color: colors.success, lineHeight: 20, fontFamily: fontFamily.bold },
    assetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    assetText: { flex: 1, color: colors.text, fontFamily: fontFamily.regular },
    removeText: { color: colors.danger, fontWeight: '800', fontFamily: fontFamily.bold },
    dangerBtn: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
    dangerText: { color: colors.danger, fontWeight: '900', fontFamily: fontFamily.bold },
  });
}
