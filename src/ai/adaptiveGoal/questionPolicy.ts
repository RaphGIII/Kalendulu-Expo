import { AdaptiveQuestionSetSchema } from './schemas';
import { postAdaptiveGoalApi } from './api';
import type {
  AdaptiveQuestion,
  AdaptiveQuestionSet,
  GoalDiagnosis,
  GoalDomain,
  MissingDimension,
  UserGoalLearningProfile,
} from './types';

function q(
  id: string,
  question: string,
  dimension: MissingDimension,
  priority: number,
  whyItMatters: string,
  answerType: AdaptiveQuestion['answerType'] = 'free_text',
  options?: string[],
): AdaptiveQuestion {
  return {
    id,
    question,
    whyItMatters,
    dimension,
    answerType,
    options,
    priority,
    isRequiredForBlueprint: priority >= 70,
  };
}

function depthLimit(depth: GoalDiagnosis['recommendedQuestionDepth']) {
  switch (depth) {
    case 'none':
      return 0;
    case 'light':
      return 3;
    case 'medium':
      return 5;
    case 'deep':
      return 7;
    case 'multi_step':
      return 9;
  }
}

function buildEmotionalQuestions(rawGoal: string) {
  return [
    q('emotional_success', `Woran wuerdest du im Alltag merken, dass "${rawGoal}" wirklich besser geworden ist?`, 'definition_of_success', 95, 'Diese Antwort bestimmt die qualitativen Marker und Review-Fragen.'),
    q('emotional_trigger', 'In welchen Situationen, Tageszeiten oder Beziehungen ist das Thema aktuell am staerksten spuerbar?', 'emotional_trigger', 88, 'Damit der Plan an echten Ausloesern ansetzt statt abstrakt zu bleiben.'),
    q('preferred_method', 'Welcher Zugang passt besser: praktisch-strukturiert, psychologisch-reflektierend, koerperorientiert, spirituell oder stoisch?', 'preferred_method', 82, 'Der Zugang veraendert Routinen, Sprache und Intensitaet des Blueprints.', 'single_choice', ['praktisch-strukturiert', 'psychologisch-reflektierend', 'koerperorientiert', 'spirituell', 'stoisch']),
    q('gentle_or_strict', 'Soll der Plan sanft beginnen oder bewusst diszipliniert aufgebaut sein?', 'constraints', 72, 'Das verhindert, dass emotionale Ziele zu hart oder zu weich geplant werden.', 'single_choice', ['sanft', 'balanced', 'diszipliniert']),
    q('previous_attempts_emotional', 'Was hast du bisher versucht, und was hat davon kurzfristig geholfen oder nicht geholfen?', 'previous_attempts', 64, 'Vorherige Versuche zeigen, welche Interventionen nicht wiederholt werden sollten.'),
  ];
}

function buildOutcomeQuestions(rawGoal: string) {
  return [
    q('current_value', `Was ist dein aktueller Ausgangswert oder aktueller Stand fuer "${rawGoal}"?`, 'current_state', 94, 'Ohne Startwert kann kein realistischer Fortschrittspfad entstehen.'),
    q('target_value', 'Was ist der konkrete Zielwert oder das sichtbare Endergebnis?', 'target_state', 90, 'Der Zielwert bestimmt Metriken, Meilensteine und Tempo.'),
    q('deadline', 'Bis wann soll dieses Ergebnis erreicht sein?', 'time_horizon', 84, 'Die Deadline veraendert Intensitaet und Kalenderbloecke.', 'date'),
    q('available_time', 'Wie viel Zeit pro Woche kannst du realistisch investieren?', 'available_time', 78, 'Der Plan muss zum echten Wochenbudget passen.', 'number'),
    q('constraints', 'Welche Einschraenkung darf der Plan auf keinen Fall ignorieren?', 'constraints', 70, 'Echte Grenzen verhindern einen unrealistischen Blueprint.'),
  ];
}

function buildIdentityQuestions(rawGoal: string) {
  return [
    q('identity_behavior', `In welchen konkreten Situationen soll "${rawGoal}" sichtbar werden?`, 'environment', 92, 'Identitaetsziele brauchen beobachtbare Situationen.'),
    q('identity_proof', 'Welches kleine Verhalten waere ein taeglicher Beweis, dass du diesem Ziel naeher kommst?', 'definition_of_success', 86, 'Der Blueprint braucht kleine Beweise statt grosse Selbstbilder.'),
    q('counter_pattern', 'Was ist dein haeufigstes Gegenmuster?', 'previous_attempts', 82, 'Das Gegenmuster bestimmt Failure-Fallbacks und Routinen.'),
    q('support_system_identity', 'Wer oder was in deinem Umfeld unterstuetzt oder erschwert diese Veraenderung?', 'support_system', 62, 'Umfeldfaktoren koennen das Ziel staerken oder sabotieren.'),
  ];
}

function buildBusinessQuestions() {
  return [
    q('offer', 'Was ist dein aktuelles Angebot oder Produkt?', 'desired_outcome', 94, 'Business-Plaene brauchen ein konkretes Angebot.'),
    q('audience', 'Wer ist die konkrete Zielgruppe?', 'environment', 90, 'Zielgruppe bestimmt Vertrieb, Sprache und erste Tests.'),
    q('current_business_state', 'Was existiert schon: Idee, Prototyp, Nutzer, Umsatz oder zahlende Kunden?', 'current_state', 88, 'Der Startstatus veraendert den gesamten Blueprint.', 'single_choice', ['Idee', 'Prototyp', 'Nutzer', 'Umsatz', 'zahlende Kunden']),
    q('business_bottleneck', 'Wo liegt aktuell der Hauptengpass: Produkt, Reichweite, Vertrauen, Zahlungsbereitschaft, Vertrieb oder Lieferung?', 'constraints', 84, 'Der Engpass entscheidet, welcher Hebel zuerst bearbeitet wird.', 'single_choice', ['Produkt', 'Reichweite', 'Vertrauen', 'Zahlungsbereitschaft', 'Vertrieb', 'Lieferung']),
    q('money_target', 'Welches Umsatz- oder Gewinnziel waere fuer die naechste Etappe sinnvoll?', 'measurement_method', 74, 'Ohne KPI bleibt der Plan zu weich.'),
  ];
}

function buildStudyQuestions() {
  return [
    q('study_target', 'Fuer welches Fach, welche Pruefung oder welche Kompetenz lernst du genau?', 'desired_outcome', 92, 'Lernplaene muessen Stoff und Pruefungsformat kennen.'),
    q('study_deadline', 'Wann ist die Pruefung oder der naechste harte Leistungsnachweis?', 'time_horizon', 86, 'Die Deadline bestimmt Wiederholungsintervalle und Intensitaet.', 'date'),
    q('study_level', 'Wo stehst du aktuell: Verstehen, Anwenden, Klausurtraining oder Luecken schliessen?', 'current_state', 82, 'Der aktuelle Level bestimmt die Lernmethode.', 'single_choice', ['Verstehen', 'Anwenden', 'Klausurtraining', 'Luecken schliessen']),
    q('weaknesses', 'Welche Themen oder Aufgabentypen machen dir aktuell am meisten Probleme?', 'constraints', 78, 'Schwachstellen bestimmen die ersten Lernbloecke.'),
    q('study_time', 'Wie viele konzentrierte Lernstunden pro Woche sind realistisch?', 'available_time', 74, 'Der Plan muss zu deiner echten Lernzeit passen.', 'number'),
  ];
}

function buildFitnessQuestions() {
  return [
    q('current_body_state', 'Was ist dein aktueller Stand: Gewicht, Fitnesslevel, Trainingserfahrung oder gesundheitliche Einschraenkungen?', 'current_state', 94, 'Fitnessplaene brauchen Startpunkt und Sicherheit.'),
    q('fitness_target', 'Was ist der genaue Zielwert oder die konkrete Ziel-Faehigkeit?', 'target_state', 88, 'Das Ziel entscheidet ueber Training, Ernaehrung und Metriken.'),
    q('training_days', 'An wie vielen Tagen pro Woche kannst du realistisch trainieren?', 'available_time', 82, 'Die Frequenz bestimmt Kalenderbloecke und Erholung.', 'number'),
    q('nutrition_constraint', 'Welche Ernaehrungs- oder Alltagsgrenze muss beruecksichtigt werden?', 'constraints', 72, 'Ohne Alltagstauglichkeit scheitert der Plan schnell.'),
  ];
}

function buildProductivityQuestions() {
  return [
    q('procrastination_trigger', 'Bei welchen Aufgaben oder Tageszeiten passiert das Aufschieben am haeufigsten?', 'environment', 90, 'Der Plan muss den konkreten Ausloeser treffen.'),
    q('desired_workflow', 'Wie soll ein guter Arbeitstag konkret aussehen?', 'definition_of_success', 82, 'Produktivitaet braucht ein sichtbares Zielverhalten.'),
    q('available_focus', 'Wie viele ungestoerte Fokusbloecke pro Woche sind realistisch?', 'available_time', 78, 'Fokuszeit bestimmt Planumfang und Routinen.', 'number'),
    q('failure_pattern', 'Was bringt dich am ehesten vom Plan weg?', 'previous_attempts', 74, 'Das bestimmt die Recovery-Regeln.'),
  ];
}

function domainQuestions(domain: GoalDomain, rawGoal: string) {
  if (domain === 'mental_clarity' || domain === 'emotional' || domain === 'spiritual') return buildEmotionalQuestions(rawGoal);
  if (domain === 'business' || domain === 'finance') return buildBusinessQuestions();
  if (domain === 'study') return buildStudyQuestions();
  if (domain === 'fitness' || domain === 'health') return buildFitnessQuestions();
  if (domain === 'productivity' || domain === 'lifestyle') return buildProductivityQuestions();
  return buildOutcomeQuestions(rawGoal);
}

export function buildFallbackQuestionSet(
  diagnosis: GoalDiagnosis,
  rawGoal: string,
): AdaptiveQuestionSet {
  if (!diagnosis.shouldAskQuestions) {
    return {
      diagnosisId: diagnosis.id,
      introMessage: 'Das Ziel ist konkret genug fuer einen ersten Blueprint.',
      questions: [],
      canProceedWithoutAnswers: true,
      suggestedMode: 'quick',
    };
  }

  const base =
    diagnosis.shape === 'identity_goal'
      ? buildIdentityQuestions(rawGoal)
      : diagnosis.shape === 'outcome_goal'
        ? buildOutcomeQuestions(rawGoal)
        : domainQuestions(diagnosis.primaryDomain, rawGoal);
  const missing = new Set(diagnosis.missingDimensions);
  const limit = depthLimit(diagnosis.recommendedQuestionDepth);
  const questions = base
    .sort((a, b) => {
      const aBoost = missing.has(a.dimension) ? 25 : 0;
      const bBoost = missing.has(b.dimension) ? 25 : 0;
      return b.priority + bBoost - (a.priority + aBoost);
    })
    .slice(0, limit);

  return AdaptiveQuestionSetSchema.parse({
    diagnosisId: diagnosis.id,
    introMessage:
      diagnosis.shape === 'emotional_state_goal'
        ? 'Ich frage zuerst nach Alltag, Ausloesern und passendem Zugang, damit der Plan nicht mechanisch wird.'
        : 'Ich frage nur die Punkte ab, die den spaeteren Blueprint wirklich verbessern.',
    questions,
    canProceedWithoutAnswers: diagnosis.qualityScores.executionReadiness >= 0.45,
    suggestedMode:
      diagnosis.shape === 'emotional_state_goal' || diagnosis.shape === 'identity_goal'
        ? 'reflective'
        : questions.length >= 5
          ? 'deep'
          : 'quick',
  });
}

export async function generateAdaptiveQuestions(input: {
  diagnosis: GoalDiagnosis;
  rawGoal: string;
  learningProfile?: UserGoalLearningProfile;
}): Promise<AdaptiveQuestionSet> {
  if (!input.diagnosis.shouldAskQuestions) {
    return buildFallbackQuestionSet(input.diagnosis, input.rawGoal);
  }

  try {
    const data = await postAdaptiveGoalApi<unknown>('/api/ai/adaptive-goal/questions', input);
    return AdaptiveQuestionSetSchema.parse(data);
  } catch {
    return buildFallbackQuestionSet(input.diagnosis, input.rawGoal);
  }
}
