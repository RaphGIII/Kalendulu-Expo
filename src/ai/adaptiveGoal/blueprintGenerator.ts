import { GoalBlueprintSchema } from './schemas';
import { postAdaptiveGoalApi } from './api';
import type {
  AdaptiveQuestionSet,
  GoalBlueprint,
  GoalDiagnosis,
  GoalRoutine,
  GoalStep,
  UserGoalLearningProfile,
} from './types';

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function answerText(answers: Record<string, string> | undefined, keys: string[], fallback = '') {
  if (!answers) return fallback;
  for (const key of keys) {
    const value = answers[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function routineMinutes(profile?: UserGoalLearningProfile, fallback = 20) {
  return Math.max(5, Math.min(90, profile?.preferredRoutineDurationMinutes ?? fallback));
}

function commonBase(input: {
  rawGoal: string;
  diagnosis: GoalDiagnosis;
  learningProfile?: UserGoalLearningProfile;
}) {
  return {
    id: uid('blueprint'),
    diagnosisId: input.diagnosis.id,
    title: input.diagnosis.interpretedGoal || input.rawGoal,
    refinedGoal: input.diagnosis.interpretedGoal || input.rawGoal,
    primaryDomain: input.diagnosis.primaryDomain,
    domains: input.diagnosis.domains,
    shape: input.diagnosis.shape,
    planningStyle:
      input.learningProfile?.preferredPlanningStyle ??
      (input.diagnosis.shape === 'emotional_state_goal' ? 'gentle' : 'balanced'),
  } as const;
}

function emotionalBlueprint(rawGoal: string, diagnosis: GoalDiagnosis, answers?: Record<string, string>, profile?: UserGoalLearningProfile): GoalBlueprint {
  const marker = answerText(answers, ['emotional_success'], 'Du reagierst im Alltag ruhiger, grübelst kuerzer und kannst Belastung bewusster einordnen.');
  const trigger = answerText(answers, ['emotional_trigger'], 'Situationen, in denen innere Unruhe oder Anspannung deutlich spuerbar wird.');
  const minutes = routineMinutes(profile, 10);

  const routines: GoalRoutine[] = [
    {
      id: uid('routine'),
      title: 'Taeglicher innerer Check-in',
      description: `Notiere ${minutes} Minuten lang Ausloeser, Koerpergefuehl und den kleinsten beruhigenden naechsten Schritt.`,
      frequency: 'daily',
      preferredTimeOfDay: 'evening',
      estimatedMinutes: minutes,
      intensity: 'low',
      reason: 'Emotionale Ziele werden durch wiederholte Wahrnehmung und kleine Regulierungsschritte greifbar.',
      failureFallback: 'Wenn es zu viel ist, schreibe nur einen Satz: Was war heute der staerkste Ausloeser?',
    },
    {
      id: uid('routine'),
      title: 'Woechentliche Ruhe-Review',
      description: 'Pruefe einmal pro Woche, welche Situationen leichter wurden und welche Trigger wiederkehren.',
      frequency: 'weekly',
      estimatedMinutes: 20,
      intensity: 'low',
      reason: 'Der Plan muss lernen, welche Methode im echten Alltag wirkt.',
      failureFallback: 'Reduziere die Review auf drei Stichworte: Ausloeser, Reaktion, naechster Versuch.',
    },
  ];

  const steps: GoalStep[] = [
    {
      id: uid('step'),
      title: 'Drei aktuelle Unruhe-Situationen aufschreiben',
      description: `Beschreibe heute drei konkrete Situationen rund um "${trigger}" und was du jeweils gebraucht haettest.`,
      priority: 'high',
      estimatedMinutes: 10,
      canBeRegenerated: true,
    },
    {
      id: uid('step'),
      title: 'Persoenliche Ruhe-Indikatoren definieren',
      description: `Formuliere 3 sichtbare Marker fuer Fortschritt, z.B. "${marker}".`,
      priority: 'high',
      estimatedMinutes: 15,
      canBeRegenerated: true,
    },
    {
      id: uid('step'),
      title: 'Ersten Mini-Regulationsversuch testen',
      description: 'Teste fuer 7 Tage eine kleine Methode: Atemfenster, Spaziergang, Journaling oder stoische Reframing-Frage.',
      priority: 'medium',
      estimatedMinutes: 10,
      canBeRegenerated: true,
    },
  ];

  return GoalBlueprintSchema.parse({
    ...commonBase({ rawGoal, diagnosis, learningProfile: profile }),
    successDefinition: {
      plainLanguage: marker,
      measurableIndicators: ['Ruhe-Skala 1-10 einmal taeglich', 'Anzahl bewusster Regulationsversuche pro Woche'],
      qualitativeIndicators: ['weniger impulsive Reaktionen', 'kuerzere Grübelphasen', 'klarere Entscheidungen unter Druck'],
      reviewFrequency: 'weekly',
    },
    strategy: {
      corePrinciple: 'Nicht erzwingen, sondern erkennen, regulieren und kleine stabile Reaktionen aufbauen.',
      whatToDo: ['Ausloeser beobachten', 'kleine Regulation testen', 'woechentlich Muster auswerten'],
      whatToAvoid: ['inneren Frieden als perfekte Dauerstimmung behandeln', 'zu harte Selbstoptimierung', 'emotionale Signale ignorieren'],
      adaptationRule: 'Wenn eine Routine Druck erzeugt, wird sie halbiert und auf Beobachtung statt Leistung umgestellt.',
    },
    phases: [{ id: uid('phase'), title: 'Wahrnehmen und stabilisieren', purpose: 'Ausloeser sichtbar machen und erste Ruheanker testen.', durationEstimate: '2 Wochen', focus: ['Trigger', 'Koerper', 'erste Regulation'] }],
    milestones: [{ id: uid('milestone'), title: 'Erste erkennbare Ruhemarker', description: 'Du erkennst wiederkehrende Ausloeser und hast mindestens eine wirksame Mini-Methode getestet.', successCriteria: ['7 Check-ins', '3 Trigger erkannt', '1 Methode getestet'] }],
    routines,
    steps,
    calendarBlocks: [{ id: uid('cal'), title: 'Ruhiger Reflexionsblock', description: 'Woechentlicher Review ohne Leistungsdruck.', durationMinutes: 20, preferredTimeOfDay: 'evening', recurrence: 'weekly', flexibility: 'movable', reason: 'Der Plan braucht einen festen Lernmoment.' }],
    progressMetrics: [{ id: uid('metric'), name: 'Innere Ruhe', type: 'scale', minLabel: 'angespannt', maxLabel: 'ruhig', trackingFrequency: 'daily' }],
    firstAction: { title: steps[0].title, description: steps[0].description, estimatedMinutes: 10, reason: 'Der erste Schritt macht das diffuse Ziel im Alltag beobachtbar.' },
    reviewSystem: {
      dailyCheckInQuestions: ['Wann war heute die groesste innere Unruhe?', 'Was hat sie ausgeloest?', 'Was war der kleinste hilfreiche Schritt?'],
      weeklyReviewQuestions: ['Welche Ausloeser wiederholen sich?', 'Welche Methode hat spuerbar geholfen?', 'Was muss kleiner oder sanfter werden?'],
      failureRecoveryRule: 'Bei Abbruch nur einen Satz pro Tag notieren und nach 3 Tagen die Routine neu skalieren.',
    },
    personalizationNotes: profile?.prefersSmallSteps ? ['Der Plan startet bewusst klein, weil kurze Routinen besser passen.'] : [],
    userFacingSummary: `Dieses Ziel wird als qualitatives inneres Ziel geplant. Der Fokus liegt auf Alltagsmarkern, Triggern, sanften Routinen und woechentlicher Anpassung statt auf kuenstlichen Zahlen.`,
  });
}

function operationalBlueprint(rawGoal: string, diagnosis: GoalDiagnosis, answers?: Record<string, string>, profile?: UserGoalLearningProfile): GoalBlueprint {
  const current = answerText(answers, ['current_value', 'current_body_state', 'study_level', 'current_business_state'], 'aktuellen Stand konkret erfassen');
  const target = answerText(answers, ['target_value', 'fitness_target', 'study_target', 'money_target'], rawGoal);
  const minutes = routineMinutes(profile, diagnosis.primaryDomain === 'study' ? 45 : 30);
  const isBusiness = diagnosis.primaryDomain === 'business' || diagnosis.primaryDomain === 'finance';
  const isStudy = diagnosis.primaryDomain === 'study';
  const isFitness = diagnosis.primaryDomain === 'fitness' || diagnosis.primaryDomain === 'health';

  const coreNoun = isBusiness ? 'KPI/Angebot' : isStudy ? 'Lernstoff' : isFitness ? 'Training/Ernaehrung' : 'Zieloutput';

  const steps: GoalStep[] = [
    { id: uid('step'), title: `${coreNoun} Ausgangslage dokumentieren`, description: `Halte den Startpunkt fest: ${current}. Ohne Startpunkt wird "${target}" nicht steuerbar.`, priority: 'high', estimatedMinutes: 25, canBeRegenerated: true },
    { id: uid('step'), title: `Messbaren 14-Tage-Zwischenoutput festlegen`, description: `Definiere, was in 14 Tagen sichtbar fertig, gemessen oder getestet sein muss.`, priority: 'high', estimatedMinutes: 20, canBeRegenerated: true },
    { id: uid('step'), title: `Ersten Arbeitsblock abschliessen`, description: `Arbeite ${minutes} Minuten nur an dem naechsten Output und dokumentiere Ergebnis plus naechste Aktion.`, priority: 'high', estimatedMinutes: minutes, canBeRegenerated: true },
    { id: uid('step'), title: `Woechentlichen Review mit Anpassung durchfuehren`, description: 'Vergleiche Plan, echte Umsetzung und Engpass. Streiche, verkleinere oder verschaerfe nur anhand von Daten.', priority: 'medium', estimatedMinutes: 25, canBeRegenerated: true },
  ];

  return GoalBlueprintSchema.parse({
    ...commonBase({ rawGoal, diagnosis, learningProfile: profile }),
    successDefinition: {
      plainLanguage: `Du erreichst "${target}" ueber messbare Zwischenoutputs und woechentliche Anpassung.`,
      measurableIndicators: isBusiness
        ? ['Umsatz/Kunden/Leads pro Woche', 'validierte Zahlungsbereitschaft', 'abgeschlossene Outreach-Schritte']
        : isStudy
          ? ['Lernstunden', 'Testfragen richtig', 'abgeschlossene Themen']
          : isFitness
            ? ['Trainingseinheiten', 'Gewicht/Umfang/Leistung', 'Schlaf und Ernaehrungs-Consistency']
            : ['abgeschlossene Outputs', 'Fokusbloecke', 'Review-Ergebnis'],
      qualitativeIndicators: ['Plan fuehlt sich umsetzbar an', 'Engpass ist klarer', 'naechster Schritt ist eindeutig'],
      reviewFrequency: 'weekly',
    },
    strategy: {
      corePrinciple: 'Ein messbarer Zielpfad entsteht aus Startwert, Zwischenoutput, Arbeitsblock und Review.',
      whatToDo: ['Startpunkt messen', 'naechsten Output definieren', 'regelmaessig ausfuehren', 'woechentlich anpassen'],
      whatToAvoid: ['zu viele parallele Routinen', 'unklare Fortschrittsphasen', 'Plan ohne Messung'],
      adaptationRule: 'Wenn die Completion sinkt, reduziere Umfang vor Intensitaet.',
    },
    phases: [
      { id: uid('phase'), title: 'Klarheit und Startwert', purpose: 'Ziel steuerbar machen.', durationEstimate: '1 Woche', focus: ['Startwert', 'Engpass', 'Metrik'] },
      { id: uid('phase'), title: 'Umsetzung und Review', purpose: 'Regelmaessige Outputs erzeugen und anpassen.', durationEstimate: '2-6 Wochen', focus: ['Fokusbloecke', 'Messung', 'Anpassung'] },
    ],
    milestones: [
      { id: uid('milestone'), title: 'Erster messbarer Zwischenoutput', description: 'Ein sichtbarer Fortschritt ist fertig, getestet oder gemessen.', successCriteria: ['Startwert erfasst', 'Output definiert', 'erster Block abgeschlossen'] },
    ],
    routines: [
      { id: uid('routine'), title: `${coreNoun} Fokusblock`, description: `Arbeite konzentriert am naechsten Output fuer "${target}".`, frequency: 'weekly', estimatedMinutes: minutes, intensity: profile?.prefersSmallSteps ? 'low' : 'medium', reason: 'Regelmaessige Outputs schlagen vage Motivation.', failureFallback: 'Wenn der Block ausfaellt, mache 10 Minuten Planung plus eine Mini-Aktion.' },
      { id: uid('routine'), title: 'Woechentlicher Ziel-Review', description: 'Pruefe Fortschritt, Engpass und naechste Anpassung.', frequency: 'weekly', estimatedMinutes: 25, intensity: 'low', reason: 'Der Plan lernt durch echte Umsetzung.', failureFallback: 'Beantworte nur: Was wurde geschafft? Was blockiert? Was wird kleiner?' },
    ],
    steps,
    calendarBlocks: [
      { id: uid('cal'), title: `${coreNoun} Arbeitsblock`, description: `Konkreter Umsetzungsblock fuer "${target}".`, durationMinutes: minutes, preferredTimeOfDay: 'any', recurrence: 'weekly', flexibility: 'movable', reason: 'Ein Ziel braucht echte Zeit im Kalender.' },
    ],
    progressMetrics: [
      { id: uid('metric'), name: isBusiness ? 'Woechentliche KPI' : isStudy ? 'Lernfortschritt' : isFitness ? 'Fitnessfortschritt' : 'Output-Fortschritt', type: 'number', trackingFrequency: 'weekly' },
      { id: uid('metric'), name: 'Umsetzbarkeit', type: 'scale', minLabel: 'zu schwer', maxLabel: 'passend', trackingFrequency: 'weekly' },
    ],
    firstAction: { title: steps[0].title, description: steps[0].description, estimatedMinutes: 25, reason: 'Der Startwert entscheidet, welcher Plan realistisch ist.' },
    reviewSystem: {
      dailyCheckInQuestions: ['Was ist heute der kleinste konkrete Fortschritt?', 'Was blockiert gerade?'],
      weeklyReviewQuestions: ['Was wurde messbar erreicht?', 'Welcher Schritt war zu schwer oder zu vage?', 'Was wird naechste Woche angepasst?'],
      failureRecoveryRule: 'Bei niedriger Umsetzung wird der naechste Schritt halbiert und ein neuer Kalenderblock gesetzt.',
    },
    personalizationNotes: profile?.tendsToOverplan ? ['Umfang bewusst begrenzt, weil zu harte Plaene eher scheitern.'] : [],
    userFacingSummary: `Dieser Blueprint uebersetzt "${rawGoal}" in Startwert, messbaren Zwischenoutput, wiederkehrende Fokusbloecke und einen Review-Mechanismus.`,
  });
}

export function buildFallbackBlueprint(input: {
  rawGoal: string;
  diagnosis: GoalDiagnosis;
  answers?: Record<string, string>;
  learningProfile?: UserGoalLearningProfile;
}): GoalBlueprint {
  if (input.diagnosis.shape === 'emotional_state_goal' || input.diagnosis.primaryDomain === 'mental_clarity') {
    return emotionalBlueprint(input.rawGoal, input.diagnosis, input.answers, input.learningProfile);
  }
  return operationalBlueprint(input.rawGoal, input.diagnosis, input.answers, input.learningProfile);
}

export async function generateAdaptiveBlueprint(input: {
  rawGoal: string;
  diagnosis: GoalDiagnosis;
  questionSet?: AdaptiveQuestionSet;
  answers?: Record<string, string>;
  learningProfile?: UserGoalLearningProfile;
  existingGoals?: unknown[];
  existingTodos?: unknown[];
  existingHabits?: unknown[];
  existingEvents?: unknown[];
}): Promise<GoalBlueprint> {
  try {
    const data = await postAdaptiveGoalApi<unknown>('/api/ai/adaptive-goal/blueprint', input);
    return GoalBlueprintSchema.parse(data);
  } catch {
    return buildFallbackBlueprint(input);
  }
}
