import {
  generateMasterBlueprint,
  type Domain,
  type GoalStateSignal,
  type MasterBlueprintOutput,
} from './coachEngine';
import { callOpenAiJsonText } from './openai/chatJson';
import { selectOpenAiModel } from './openai/modelSelection';
import { unzipSync, strFromU8 } from 'fflate';

export interface Env {
  OPENAI_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  OPENAI_MODEL_CHEAP?: string;
  OPENAI_MODEL_BALANCED?: string;
  OPENAI_MODEL_STRONG?: string;
  OPENAI_STUDY_ENHANCEMENT_MODEL?: string;
  OPENAI_STUDY_ENHANCEMENT_MAX_COST_USD?: string;
}

type GoalQuestion = {
  id: string;
  title: string;
  type: 'text' | 'single_choice' | 'multi_choice' | 'long_text';
  required: boolean;
  options?: Array<{ id: string; label: string }>;
  placeholder?: string;
  helpText?: string;
  whyAsked?: string;
  priority?: number;
  section?: string;
};

type GoalRefinementResponse = {
  goalLabel: string;
  goalType:
    | 'fitness'
    | 'study'
    | 'language'
    | 'career'
    | 'business'
    | 'mindset'
    | 'research'
    | 'writing'
    | 'project'
    | 'other';
  questions: GoalQuestion[];
  analysis?: {
    category?: string;
    complexity?: 'simple' | 'moderate' | 'advanced' | 'high_complexity';
    difficulty?: 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard';
    rationale?: string[];
    missingInformation?: string[];
    recommendedQuestionCount?: number;
    targetQuestionCount?: number;
  };
};

type PlannerReasonedText = {
  title: string;
  reason: string;
  instruction?: string;
  expectedEffect?: string;
};

type PlannerCalendarBlock = {
  title: string;
  start: string;
  end: string;
  reason: string;
  instruction?: string;
};

type PlannerRoutineBlock = {
  title: string;
  start: string;
  end: string;
};

type PlannerRoutine = {
  title: string;
  reason: string;
  instruction?: string;
  frequencyPerWeek: number;
  durationMinutes?: number;
  reviewAfterDays?: number;
  blocks: PlannerRoutineBlock[];
};

type PlannerExecutionChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

type PlannerExecutionStep = {
  id: string;
  order: number;
  title: string;
  explanation: string;
  whyItMatters: string;
  estimatedDays?: number;
  checklist: PlannerExecutionChecklistItem[];
  linkedTodoTitles: string[];
  linkedHabitTitles: string[];
};

type PlannerBundle = {
  primary: {
    todo: PlannerReasonedText;
    habit: PlannerReasonedText;
    calendar: PlannerCalendarBlock;
    routines: PlannerRoutine[];
  };
  alternatives?: Array<{
    label: string;
    todo: PlannerReasonedText;
    habit: PlannerReasonedText;
    calendar: PlannerCalendarBlock;
  }>;
  executionSteps: PlannerExecutionStep[];
  systemMap?: {
    rootProblem: string;
    problemNodes: Array<{
      id: string;
      label: string;
      kind: string;
      severity: number;
      explanation: string;
    }>;
    dependencyEdges: Array<{
      from: string;
      to: string;
      relation: string;
      weight: number;
    }>;
    patternInsights: Array<{
      label: string;
      explanation: string;
      repetitionLikelihood: 'low' | 'medium' | 'high';
      coachingValue: 'low' | 'medium' | 'high';
    }>;
    leverageInsights: Array<{
      label: string;
      explanation: string;
      expectedImpact: 'low' | 'medium' | 'high';
      whyHighLeverage: string;
    }>;
    failureScenarios: Array<{
      label: string;
      trigger: string;
      consequence: string;
      prevention: string;
    }>;
  };
  planMeta?: {
    depth?: 'compact' | 'balanced' | 'deep' | 'full_system';
    difficulty?: 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard';
    complexity?: 'simple' | 'moderate' | 'advanced' | 'high_complexity';
    summary?: string;
    targetStepCount?: number;
    coachStyle?: string;
  };
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function errorResponse(message: string, status = 400, extra?: Record<string, unknown>) {
  return jsonResponse({ error: message, ...extra }, status);
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function stripCodeFences(text: string): string {
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
}

function extractFirstJsonObject(text: string): string | null {
  const cleaned = stripCodeFences(text);
  const start = cleaned.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;

    if (depth === 0) {
      return cleaned.slice(start, i + 1);
    }
  }

  return null;
}

function parseModelJsonLoose<T>(rawText: string): T | null {
  try {
    return JSON.parse(stripCodeFences(rawText)) as T;
  } catch {
    const extracted = extractFirstJsonObject(rawText);
    if (!extracted) return null;
    try {
      return JSON.parse(extracted) as T;
    } catch {
      return null;
    }
  }
}

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

function inferGoalType(goal: string): GoalRefinementResponse['goalType'] {
  const g = goal.toLowerCase();

  if (
    g.includes('abnehm') ||
    g.includes('fett') ||
    g.includes('muskel') ||
    g.includes('fitness') ||
    g.includes('lauf') ||
    g.includes('gesund') ||
    g.includes('zunehmen')
  ) {
    return 'fitness';
  }

  if (g.includes('doktor') || g.includes('master') || g.includes('stud') || g.includes('prüfung')) {
    return 'study';
  }

  if (g.includes('paper') || g.includes('forschung') || g.includes('dissertation')) {
    return 'research';
  }

  if (g.includes('buch') || g.includes('schreib') || g.includes('roman')) {
    return 'writing';
  }

  if (g.includes('unternehmen') || g.includes('startup') || g.includes('firma')) {
    return 'business';
  }

  if (g.includes('karriere') || g.includes('bewerb') || g.includes('job')) {
    return 'career';
  }

  if (g.includes('sprache') || g.includes('englisch') || g.includes('deutsch')) {
    return 'language';
  }

  if (g.includes('projekt') || g.includes('app') || g.includes('produkt')) {
    return 'project';
  }

  return 'other';
}

function inferDomain(goal: string): Domain {
  const g = goal.toLowerCase();

  if (g.includes('schach') || g.includes('elo')) return 'chess';
  if (
    g.includes('mondscheinsonate') ||
    g.includes('klavier') ||
    g.includes('gitarre') ||
    g.includes('beethoven') ||
    g.includes('musik')
  ) {
    return 'music';
  }
  if (
    g.includes('abnehm') ||
    g.includes('fett') ||
    g.includes('muskel') ||
    g.includes('fitness') ||
    g.includes('lauf') ||
    g.includes('zunehmen')
  ) {
    return 'fitness';
  }
  if (
    g.includes('doktor') ||
    g.includes('master') ||
    g.includes('stud') ||
    g.includes('prüfung') ||
    g.includes('lernen')
  ) {
    return 'study';
  }
  if (
    g.includes('unternehmen') ||
    g.includes('startup') ||
    g.includes('firma') ||
    g.includes('business')
  ) {
    return 'business';
  }
  if (g.includes('schreib') || g.includes('roman') || g.includes('buch')) {
    return 'writing';
  }
  if (g.includes('projekt') || g.includes('app') || g.includes('produkt')) {
    return 'project';
  }
  return 'other';
}

function buildDomainRequirements(goalType: GoalRefinementResponse['goalType']) {
  switch (goalType) {
    case 'fitness':
      return [
        'Pflicht bei Körperzielen: aktueller Stand, Zielstand, verfügbare Zeit, Trainingshistorie, gesundheitliche Grenzen, Engpässe.',
        'Wenn das Ziel Abnehmen oder Zunehmen ist, müssen später konkrete Kalorien-, Protein-, Trainings- und Kontrollparameter ableitbar sein.',
      ];
    case 'research':
      return [
        'Pflicht bei Forschung/Promotion: Fachgebiet, Status quo, Thema, institutionelle Vorgaben, Deadline, Daten/Literatur, Betreuerstatus, Wochenstunden, Kapitelstatus.',
      ];
    case 'business':
      return [
        'Pflicht bei Unternehmensaufbau: Branche, Angebot, Startstatus, Budget, verfügbare Stunden, Vertriebsweg, Zielgruppe, monetäres Ziel.',
      ];
    case 'writing':
      return [
        'Pflicht bei Schreibzielen: Format, Umfang, Deadline, vorhandenes Material, Schreibstatus, verfügbare Schreibblöcke, Qualitätsanspruch.',
      ];
    case 'study':
      return [
        'Pflicht bei Lern-/Schach-/Leistungszielen: aktueller Stand, Zielniveau, Wochenstunden, Hauptfehlerquellen, Trainingshistorie, Messkriterien.',
      ];
    default:
      return [
        'Fragen müssen Outcome, Ausgangslage, Zeitrahmen, verfügbare Zeit, Ressourcen, Hindernisse, Messkriterium und realistische Umsetzung klären.',
      ];
  }
}

function refinementSystemPrompt(targetQuestionCount: number, goalType: string) {
  return `
Du bist die Diagnose- und Coaching-KI für Kalendulu.
Antworte NUR mit gültigem JSON.

AUFGABE:
- Analysiere das Ziel.
- Erstelle GENAU ${targetQuestionCount} Fragen auf Deutsch.
- Die Fragen werden von der KI als echte Diagnose erzeugt: klug, zielfuehrend, nicht banal.
- Die Fragen müssen tief genug sein, damit danach ein hochpräziser Blueprint mit Problembaum, Mustererkennung, Hebeln, Failure Modes und milestone-basiertem Plan erzeugt werden kann.
- Schwierige Ziele brauchen deutlich tiefere Diagnostik.
- Die Fragen müssen nach Relevanz priorisiert sein.
- Nutze Fragearten: text, long_text, single_choice, multi_choice.
- Jede Frage muss eine Planvariable klaeren, die spaeter eine konkrete Entscheidung veraendert: Zeitbudget, Engpass, Startniveau, Messkriterium, Ressource, Risiko, naechster Output oder harte Deadline.
- whyAsked darf nie generisch sein. Erklaere kurz, welche Planentscheidung von der Antwort abhaengt.
- Keine Frage darf dieselbe Bedeutung wie eine andere Frage haben.
- Jede Frage muss das konkrete Ziel sprachlich aufgreifen. Keine generischen Coachingfragen, die fuer jedes Ziel gleich passen.
- Stelle bei komplexen Zielen mehr Diagnosefragen zu Sequenz, Skill-Luecken, Ressourcen, Abbruchrisiko, Messung, Review-Rhythmus und erstem sichtbarem Output.
- Single-Choice-Optionen muessen echte Strategieentscheidungen abbilden, nicht nur weich klingende Vorlieben.

COACHING-HALTUNG:
- Denke wie ein fordernder Elite-Coach.
- Gehe davon aus, dass der Benutzer extrem anspruchsvoll und perfektionistisch ist.
- Lieber analytisch, präzise und leicht zu hart als banal oder weich.
- Jede Frage soll helfen, Hauptproblem, Unterprobleme, Muster, Mikroskills, Engpässe oder Failure Modes sichtbar zu machen.

DOMÄNENREGELN:
${buildDomainRequirements(goalType as any).join('\n')}

JSON-SHAPE:
{
  "goalLabel": "string",
  "goalType": "fitness|study|language|career|business|mindset|research|writing|project|other",
  "questions": [
    {
      "id": "string",
      "title": "string",
      "type": "text|long_text|single_choice|multi_choice",
      "required": true,
      "section": "string",
      "whyAsked": "string",
      "priority": 1,
      "placeholder": "string optional",
      "helpText": "string optional",
      "options": [{"id":"string","label":"string"}]
    }
  ],
  "analysis": {
    "category": "string",
    "complexity": "simple|moderate|advanced|high_complexity",
    "difficulty": "very_easy|easy|medium|hard|very_hard",
    "rationale": ["string"],
    "missingInformation": ["string"],
    "recommendedQuestionCount": ${targetQuestionCount},
    "targetQuestionCount": ${targetQuestionCount}
  }
}
`.trim();
}

function scoreLabel(value: number): 'low' | 'medium' | 'high' {
  if (value >= 0.76) return 'high';
  if (value >= 0.42) return 'medium';
  return 'low';
}

function buildNextCalendarWindow(targetDateIso: string) {
  const now = new Date();
  const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  start.setHours(18, 0, 0, 0);

  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const target = new Date(targetDateIso);
  if (Number.isFinite(target.getTime()) && end.getTime() > target.getTime()) {
    const adjustedStart = new Date(target.getTime() - 60 * 60 * 1000);
    return {
      start: adjustedStart.toISOString(),
      end: target.toISOString(),
    };
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function buildRoutineBlocks(frequencyPerWeek: number, durationMinutes: number) {
  const count = clamp(frequencyPerWeek, 1, 5);
  const blocks: PlannerRoutineBlock[] = [];
  const base = new Date();
  base.setHours(19, 0, 0, 0);

  for (let i = 0; i < count; i += 1) {
    const start = new Date(base.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    blocks.push({
      title: `Routine Block ${i + 1}`,
      start: start.toISOString(),
      end: end.toISOString(),
    });
  }

  return blocks;
}

const vagueActionPattern =
  /^(fortschrittsphase\s+\d+|phase\s+\d+|umsetzungsphase|wichtige phase|weiterarbeiten|fortschritt sichern|strukturieren|dranbleiben)$/i;

function isWeakActionText(value?: string) {
  const text = safeString(value).trim();
  if (!text) return true;
  if (text.length < 12) return true;
  return vagueActionPattern.test(text);
}

function concreteChecklistFor(goal: string, stepTitle: string, stepIndex: number) {
  const cleanStep = safeString(stepTitle).trim() || `Schritt ${stepIndex + 1}`;

  return [
    {
      id: `c_${stepIndex + 1}_1`,
      label: `Ergebnis fuer "${cleanStep}" vor dem Start schriftlich festlegen`,
      done: false,
    },
    {
      id: `c_${stepIndex + 1}_2`,
      label: `Einen ungestoerten Arbeitsblock nur fuer "${goal}" abschliessen`,
      done: false,
    },
    {
      id: `c_${stepIndex + 1}_3`,
      label: `Sichtbares Ergebnis speichern und den naechsten konkreten Schritt notieren`,
      done: false,
    },
  ];
}

function convertBlueprintToBundle(
  blueprint: MasterBlueprintOutput,
  goal: string,
  targetDateIso: string,
  targetStepCount: number,
): PlannerBundle {
  const nextCalendar = buildNextCalendarWindow(targetDateIso);

  const mainStep = blueprint.executionSteps[0];
  const mainRoutine = blueprint.routines[0];

  const todoTitle =
    mainStep?.title ||
    `Ersten messbaren Output fuer "${goal}" fertigstellen`;

  const habitTitle =
    mainRoutine?.title ||
    `Fokusblock fuer "${goal}" absolvieren`;

  const systemMap = {
    rootProblem: blueprint.rootProblem,
    problemNodes: blueprint.graph.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
      severity: node.severity,
      explanation: node.description,
    })),
    dependencyEdges: blueprint.graph.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      relation: edge.relation,
      weight: edge.weight,
    })),
    patternInsights: blueprint.patternInsights.map((pattern) => ({
      label: pattern.label,
      explanation: pattern.explanation,
      repetitionLikelihood: scoreLabel(pattern.repetitionLikelihood),
      coachingValue: scoreLabel(pattern.coachingValue),
    })),
    leverageInsights: blueprint.leverageInsights.map((lev) => ({
      label: lev.label,
      explanation: lev.explanation,
      expectedImpact: scoreLabel(lev.expectedImpact),
      whyHighLeverage: `Urgency ${lev.urgency.toFixed(2)} · Compounding ${lev.compoundingValue.toFixed(2)} · Difficulty ${lev.difficulty.toFixed(2)}`,
    })),
    failureScenarios: blueprint.failureScenarios.map((failure) => ({
      label: failure.label,
      trigger: failure.triggerNodeIds.join(', ') || 'unbekannt',
      consequence: failure.consequenceNodeIds.join(', ') || 'unbekannt',
      prevention: failure.preventionActionHints.join(' · '),
    })),
  };

  const routines: PlannerRoutine[] = blueprint.routines.map((routine) => ({
    title: routine.title,
    reason: routine.reason,
    instruction: routine.reason,
    frequencyPerWeek: routine.frequencyPerWeek,
    durationMinutes: routine.durationMinutes,
    reviewAfterDays: 7,
    blocks: buildRoutineBlocks(routine.frequencyPerWeek, routine.durationMinutes),
  }));

  const executionSteps: PlannerExecutionStep[] = blueprint.executionSteps
    .slice(0, targetStepCount)
    .map((step, index) => {
      const title = isWeakActionText(step.title)
        ? `${goal}: konkreten Teil-Output ${index + 1} fertigstellen`
        : step.title;
      const generatedChecklist = step.checklist
        .map((item, itemIndex) => ({
          id: item.id || `c_${index + 1}_${itemIndex + 1}`,
          label: item.label,
          done: false,
        }))
        .filter((item) => !isWeakActionText(item.label));

      return {
        id: step.id || `step_${index + 1}`,
        order: index + 1,
        title,
        explanation: isWeakActionText(step.explanation)
          ? `Arbeite diesen Schritt so ab, dass am Ende ein pruefbares Zwischenergebnis fuer "${goal}" sichtbar ist.`
          : step.explanation,
        whyItMatters: isWeakActionText(step.whyItMatters)
          ? `Dieser Schritt reduziert einen konkreten Engpass und macht den naechsten Schritt fuer "${goal}" leichter.`
          : step.whyItMatters,
        estimatedDays: step.estimatedDays,
        checklist: generatedChecklist.length >= 2
          ? generatedChecklist
          : concreteChecklistFor(goal, title, index),
        linkedTodoTitles: [todoTitle],
        linkedHabitTitles: [habitTitle],
      };
    });

  return {
    primary: {
      todo: {
        title: todoTitle,
        reason:
          blueprint.rootProblem ||
          `Hauptengpass für "${goal}" muss zuerst sauber angegangen werden.`,
        instruction:
          mainStep?.explanation ||
          `Lege den kleinsten pruefbaren Output fuer "${goal}" fest und arbeite ihn im naechsten Fokusblock fertig.`,
        expectedEffect:
          'Die Hauptengstelle wird reduziert und spätere Phasen werden leichter.',
      },
      habit: {
        title: habitTitle,
        reason:
          mainRoutine?.reason ||
          'Ein stabiles wiederkehrendes System trägt die milestone-basierten Phasen.',
        instruction:
          mainRoutine?.reason ||
          `Plane feste Arbeitsbloecke fuer "${goal}" und beende jeden Block mit einem dokumentierten Ergebnis.`,
        expectedEffect:
          'Mehr Konstanz und weniger Zerfall zwischen den Phasen.',
      },
      calendar: {
        title: mainStep?.title || `${goal}: konkreter Arbeitsblock`,
        start: nextCalendar.start,
        end: nextCalendar.end,
        reason:
          'Der wichtigste Hebel braucht einen realen Zeitslot statt nur Absicht.',
        instruction:
          mainStep?.explanation ||
          `Arbeite in diesem Block nur an dem naechsten sichtbaren Ergebnis fuer "${goal}".`,
      },
      routines,
    },
    alternatives: [],
    executionSteps,
    systemMap,
    planMeta: {
      depth: blueprint.executionSteps.length >= 30 ? 'full_system' : blueprint.executionSteps.length >= 20 ? 'deep' : 'balanced',
      difficulty:
        blueprint.scoreBreakdown.totalScore >= 28
          ? 'hard'
          : blueprint.scoreBreakdown.totalScore >= 18
            ? 'medium'
            : 'easy',
      complexity:
        blueprint.graph.nodes.length >= 10
          ? 'high_complexity'
          : blueprint.graph.nodes.length >= 7
            ? 'advanced'
            : 'moderate',
      summary: `Blueprint für "${goal}" mit Root Problem, Musterstruktur, Hebeln, Failure Modes und ${executionSteps.length} konkreten Handlungsschritten.`,
      targetStepCount: executionSteps.length,
      coachStyle: 'elite_demanding_precision_problem_tree',
    },
  };
}

function plannerSystemPrompt(targetStepCount: number, blueprintBundle: PlannerBundle) {
  return `
Language: German.
Role: You are the elite execution coach for Kalendulu.
Return ONLY valid JSON.

HARD RULES:
1. Output EXACTLY ${targetStepCount} executionSteps.
2. executionSteps are milestone-like phases, not trivial habits.
3. Keep the deep structure from the provided blueprint.
4. Preserve the root problem, leverage orientation, and failure-awareness.
5. Do not soften the plan.
6. Prefer precision, causal structure and demanding realism over generic advice.
7. Routines belong in routines, not as shallow standalone steps.
8. The user is highly demanding and perfectionistic.
9. Every step title must be specific to the user's goal. Never use placeholder titles like "Fortschrittsphase 4".
10. Questions and steps must not repeat the same meaning with different words.
11. Every executionStep.title must start with a concrete action verb and name a deliverable, object, metric, session, document, workout, output, or decision.
12. Every explanation must say exactly what the user should do in the next session or week.
13. Every whyItMatters must connect the action to the final goal outcome.
14. Checklist labels must be physical or digital actions the user can mark done. Never write "Phase umsetzen", "Fortschritt sichern", "Struktur aufbauen", or similar vague labels.
15. Use time, frequency, output quantity, quality threshold, deadline, or measurement wherever the available answers make that possible.
16. Use the user's answers, free slots, profile, past goals, and constraints from the user payload. Do not ignore them.
17. Avoid abstract coaching prose. Prefer "Erstelle X", "Trainiere Y", "Schreibe Z", "Buche A", "Teste B", "Miss C".
18. Each step needs enough detail that the user can execute it without asking "how exactly?". Include the concrete sub-output, acceptance criteria, and next review point.
19. For every checklist, include 3-5 items when possible: prepare, execute, measure, document, decide next action.
20. If the goal is domain-specific, use domain-specific nouns and actions from that domain instead of generic productivity language.

YOU MUST IMPROVE THIS BLUEPRINT, NOT REPLACE IT WITH GENERIC ADVICE:
${JSON.stringify(blueprintBundle)}

JSON SHAPE:
{
  "primary": {
    "todo": { "title": "string", "reason": "string", "instruction": "string optional", "expectedEffect": "string optional" },
    "habit": { "title": "string", "reason": "string", "instruction": "string optional", "expectedEffect": "string optional" },
    "calendar": { "title": "string", "start": "ISO string", "end": "ISO string", "reason": "string", "instruction": "string optional" },
    "routines": [
      {
        "title": "string",
        "reason": "string",
        "instruction": "string optional",
        "frequencyPerWeek": 3,
        "durationMinutes": 30,
        "blocks": [
          { "title": "string", "start": "ISO string", "end": "ISO string" }
        ]
      }
    ]
  },
  "alternatives": [],
  "executionSteps": [
    {
      "id": "step_1",
      "order": 1,
      "title": "string",
      "explanation": "string",
      "whyItMatters": "string",
      "estimatedDays": 3,
      "checklist": [
        { "id": "c1", "label": "string", "done": false }
      ],
      "linkedTodoTitles": ["string"],
      "linkedHabitTitles": ["string"]
    }
  ],
  "systemMap": {
    "rootProblem": "string",
    "problemNodes": [],
    "dependencyEdges": [],
    "patternInsights": [],
    "leverageInsights": [],
    "failureScenarios": []
  },
  "planMeta": {
    "depth": "compact|balanced|deep|full_system",
    "difficulty": "very_easy|easy|medium|hard|very_hard",
    "complexity": "simple|moderate|advanced|high_complexity",
    "summary": "string",
    "targetStepCount": ${targetStepCount},
    "coachStyle": "elite_demanding_precision_problem_tree"
  }
}
`.trim();
}

function adaptiveGoalSystemPrompt(kind: 'analyze' | 'questions' | 'blueprint' | 'learn' | 'regenerate') {
  const base = `
You are Kalendulu Adaptive Goal Intelligence.
Return ONLY valid JSON. No markdown. No prose outside JSON.
You are not a static form assistant. Analyze goal semantics, quality, missing dimensions, risk, user history and fit.
Use cheap-model discipline: concise reasoningSummary, strong structure, no long hidden reasoning.
Emotional, identity and spiritual goals need qualitative markers and reflective routines, not fake hard numbers.
Fitness, finance, study and business goals need concrete metrics, resources, constraints and next outputs.
`;

  if (kind === 'analyze') {
    return `${base}
Return a GoalDiagnosis JSON with: id, rawGoal, interpretedGoal, domains, primaryDomain, shape, measurability, control, qualityScores 0-1, missingDimensions, riskFlags, recommendedQuestionDepth, shouldAskQuestions, shouldGenerateBlueprint, reasoningSummary.
Use domains: fitness, health, study, career, business, finance, relationship, emotional, mental_clarity, identity, spiritual, creative, productivity, lifestyle, other.
Use shape: outcome_goal, process_goal, identity_goal, emotional_state_goal, avoidance_goal, exploration_goal, maintenance_goal, transformation_goal.
`.trim();
  }

  if (kind === 'questions') {
    return `${base}
Return an AdaptiveQuestionSet JSON. Max 9 questions, usually 3-6.
Every question must be derived from diagnosis and change the later blueprint.
Use fields: diagnosisId, introMessage, questions[], canProceedWithoutAnswers, suggestedMode.
Each question: id, question, whyItMatters, dimension, answerType, options optional, priority 0-100, isRequiredForBlueprint.
No redundant generic questions.
`.trim();
  }

  if (kind === 'blueprint') {
    return `${base}
Return a GoalBlueprint JSON. Build a dynamic goal system with successDefinition, strategy, phases, milestones, routines, steps, calendarBlocks, progressMetrics, firstAction, reviewSystem, personalizationNotes, userFacingSummary <= 1800 chars.
All routines need reason and failureFallback. All steps need canBeRegenerated=true where useful.
For emotional goals: qualitative indicators, trigger observation, reflection, gentle routines.
For operational goals: concrete metrics, outputs, time blocks, weekly reviews.
`.trim();
  }

  if (kind === 'learn') {
    return `${base}
Return a UserGoalLearningProfile JSON. Store only abstract patterns, not sensitive details.
Learn from skipped/completed/refreshed feedback. Update planningStyle, routine duration, failure patterns and domain preferences.
`.trim();
  }

  return `${base}
Return a RegenerationResult JSON. Change only requested target.
too_hard/low_completion: smaller and easier. too_easy: slightly stronger. too_vague: concrete verb + measurable output. boring: more attractive. time_conflict: shorter/movable. not_relevant: closer to refinedGoal.
Fields: targetType, replacedTargetId optional, explanation, newItems, updatedBlueprint optional.
`.trim();
}

async function runAdaptiveGoalEndpoint(params: {
  kind: 'analyze' | 'questions' | 'blueprint' | 'learn' | 'regenerate';
  body: Record<string, unknown>;
  env: Env;
}) {
  const rawGoal = safeString(params.body.rawGoal || params.body.goal || '');
  const difficultyLevel = clamp(safeNumber(params.body.difficultyLevel, rawGoal.length > 80 ? 7 : 4), 1, 10);
  const targetCount =
    params.kind === 'blueprint'
      ? stepCountForDifficulty(difficultyLevel)
      : params.kind === 'questions'
        ? 6
        : 3;
  const selectedModel = selectOpenAiModel({
    purpose: params.kind === 'blueprint' ? 'plan' : 'refine',
    difficultyLevel,
    targetCount,
    env: params.env,
  });

  const raw = await callPlannerModelRaw({
    env: params.env,
    model: selectedModel.model,
    system: adaptiveGoalSystemPrompt(params.kind),
    user: JSON.stringify({
      ...params.body,
      modelRouting: selectedModel.reason,
      generatedAt: new Date().toISOString(),
    }),
    maxCompletionTokens:
      params.kind === 'blueprint'
        ? Math.max(selectedModel.maxCompletionTokens, 5200)
        : selectedModel.maxCompletionTokens,
  });

  return parseModelJsonLoose<unknown>(raw);
}

async function callPlannerModelRaw(params: {
  env: Env;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxCompletionTokens?: number;
}) {
  return callOpenAiJsonText({
    apiKey: params.env.OPENAI_API_KEY,
    model: params.model,
    system: params.system,
    user: params.user,
    temperature: params.temperature,
    maxCompletionTokens: params.maxCompletionTokens,
  });
}

function buildFallbackRefinement(goal: string, difficultyLevel: number): GoalRefinementResponse {
  const count = questionCountForDifficulty(difficultyLevel);
  const goalType = inferGoalType(goal);

  const baseQuestions: GoalQuestion[] = [
    {
      id: 'target_outcome',
      title: 'Was genau willst du konkret erreichen?',
      type: 'long_text',
      required: true,
      section: 'Ziel',
      whyAsked: 'Ohne exakt definiertes Endergebnis kann kein präziser Blueprint gebaut werden.',
      priority: 10,
      placeholder: 'Beschreibe das Ziel messbar und konkret.',
    },
    {
      id: 'starting_point',
      title: 'Wo stehst du aktuell genau in Bezug auf dieses Ziel?',
      type: 'long_text',
      required: true,
      section: 'Ausgangslage',
      whyAsked: 'Der Plan hängt stark vom echten Startpunkt ab.',
      priority: 10,
      placeholder: 'Beschreibe deinen Ist-Zustand.',
    },
    {
      id: 'deadline',
      title: 'Bis wann willst du das Ziel erreichen?',
      type: 'text',
      required: true,
      section: 'Zeitrahmen',
      whyAsked: 'Tempo, Phasen und Belastung hängen von der Deadline ab.',
      priority: 9,
      placeholder: 'z. B. 2026-10-31',
    },
    {
      id: 'weekly_time',
      title: 'Wie viele Stunden pro Woche kannst du realistisch investieren?',
      type: 'text',
      required: true,
      section: 'Ressourcen',
      whyAsked: 'Das System muss auf echter verfügbarer Zeit basieren.',
      priority: 9,
      placeholder: 'z. B. 8',
    },
    {
      id: 'root_bottleneck_guess',
      title: 'Was ist dein größtes Hindernis oder dein größter Engpass?',
      type: 'long_text',
      required: true,
      section: 'Engpass',
      whyAsked: 'Ein guter Coach beginnt mit dem wahrscheinlich größten Downstream-Problem.',
      priority: 8,
      placeholder: 'z. B. Technik, Zeitmangel, Fokus, fehlende Struktur, fehlendes Wissen',
    },
  ];

  const extraQuestions: GoalQuestion[] = [
    {
      id: 'success_metric',
      title: 'Woran erkennst du messbar, dass dieses Ziel wirklich erreicht ist?',
      type: 'text',
      required: true,
      section: 'Messung',
      whyAsked: 'Der Plan braucht ein klares Erfolgskriterium statt nur ein Gefühl.',
      priority: 7,
      placeholder: 'z. B. Zahl, Abgabe, Ergebnis, Niveau, sichtbarer Output',
    },
    {
      id: 'available_days',
      title: 'An welchen Tagen kannst du realistisch daran arbeiten?',
      type: 'multi_choice',
      required: true,
      section: 'Zeit',
      whyAsked: 'Kalenderblöcke müssen zu deinem echten Wochenrhythmus passen.',
      priority: 7,
      options: [
        { id: 'mon', label: 'Montag' },
        { id: 'tue', label: 'Dienstag' },
        { id: 'wed', label: 'Mittwoch' },
        { id: 'thu', label: 'Donnerstag' },
        { id: 'fri', label: 'Freitag' },
        { id: 'sat', label: 'Samstag' },
        { id: 'sun', label: 'Sonntag' },
      ],
    },
    {
      id: 'failure_pattern',
      title: 'Woran sind ähnliche Ziele bei dir bisher gescheitert?',
      type: 'long_text',
      required: true,
      section: 'Risiko',
      whyAsked: 'Wiederkehrende Scheitermuster sind wichtiger als generische Motivation.',
      priority: 6,
      placeholder: 'Beschreibe typische Auslöser, Abbrüche oder Ablenkungen.',
    },
    {
      id: 'first_constraint',
      title: 'Welche Einschränkung darf der Plan auf keinen Fall ignorieren?',
      type: 'long_text',
      required: true,
      section: 'Grenzen',
      whyAsked: 'Ein Plan ist nur brauchbar, wenn er echte Grenzen respektiert.',
      priority: 6,
      placeholder: 'z. B. Arbeit, Gesundheit, Budget, Energie, Familie, Skills',
    },
    {
      id: 'minimum_viable_progress',
      title: 'Was wäre der kleinste Fortschritt, der diese Woche schon zählen würde?',
      type: 'text',
      required: true,
      section: 'Start',
      whyAsked: 'Der erste Schritt muss klein genug sein, um wirklich zu passieren.',
      priority: 5,
      placeholder: 'Ein konkretes Ergebnis für die nächsten 7 Tage.',
    },
  ];

  for (const question of extraQuestions) {
    if (baseQuestions.length >= count) break;
    baseQuestions.push(question);
  }

  return {
    goalLabel: goal || 'Neues Ziel',
    goalType,
    questions: baseQuestions.slice(0, count),
    analysis: {
      category: goalType,
      complexity: difficultyLevel >= 8 ? 'high_complexity' : difficultyLevel >= 5 ? 'advanced' : 'moderate',
      difficulty:
        difficultyLevel >= 9 ? 'very_hard' :
        difficultyLevel >= 7 ? 'hard' :
        difficultyLevel >= 4 ? 'medium' : 'easy',
      rationale: ['Fallback-Fragenset wurde erzeugt, weil das Modell keine saubere JSON-Antwort geliefert hat.'],
      missingInformation: ['Weitere Mikrodetails werden in der nächsten Planungsstufe modelliert.'],
      recommendedQuestionCount: count,
      targetQuestionCount: count,
    },
  };
}

function extractWeeklyHours(body: Record<string, unknown>) {
  const direct = safeNumber(body.weeklyHours, NaN);
  if (Number.isFinite(direct)) return clamp(direct, 1, 40);

  const answers = body.answers as Record<string, unknown> | undefined;
  if (answers) {
    const fromWeeklyHours = Number(answers.weekly_hours);
    if (Number.isFinite(fromWeeklyHours)) return clamp(fromWeeklyHours, 1, 40);

    const fromMinutesPerDay = Number(answers.minutes_per_day);
    const fromDaysPerWeek = Number(answers.days_per_week);
    if (Number.isFinite(fromMinutesPerDay) && Number.isFinite(fromDaysPerWeek)) {
      return clamp((fromMinutesPerDay * fromDaysPerWeek) / 60, 1, 40);
    }
  }

  return 8;
}

function buildSignalsFromBody(body: Record<string, unknown>) {
  const signals: GoalStateSignal[] = [];

  const answers = (body.answers ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(answers)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      signals.push({
        key,
        value,
        confidence: 0.85,
      });
    } else if (Array.isArray(value)) {
      signals.push({
        key,
        value: value.join(', '),
        confidence: 0.75,
      });
    }
  }

  const profile = (body.profile ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(profile)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      signals.push({
        key: `profile_${key}`,
        value,
        confidence: 0.75,
      });
    }
  }

  const userPlanningProfile = (body.userPlanningProfile ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(userPlanningProfile)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      signals.push({
        key: `planning_${key}`,
        value,
        confidence: 0.72,
      });
    }
  }

  const goalLearningProfile = (body.goalLearningProfile ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(goalLearningProfile)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      signals.push({
        key: `goal_learning_${key}`,
        value,
        confidence: 0.8,
      });
    } else if (Array.isArray(value) && value.length) {
      signals.push({
        key: `goal_learning_${key}`,
        value: value.slice(0, 8).join(', '),
        confidence: 0.76,
      });
    }
  }

  return signals;
}

function normalizePlannerBundle(
  bundle: PlannerBundle,
  targetStepCount: number,
): PlannerBundle {
  const normalizedSteps = ensureArray<PlannerExecutionStep>(bundle.executionSteps)
    .slice(0, targetStepCount)
    .filter((step) => !/^fortschrittsphase\s+\d+$/i.test(step.title.trim()))
    .map((step, index) => {
      const title = isWeakActionText(step.title)
        ? `Konkreten Teil-Output ${index + 1} fertigstellen`
        : step.title;
      const checklist = ensureArray<PlannerExecutionChecklistItem>(step.checklist)
        .slice(0, 4)
        .map((item, itemIndex) => ({
          id: item.id || `c_${index + 1}_${itemIndex + 1}`,
          label: item.label,
          done: false,
        }))
        .filter((item) => !isWeakActionText(item.label));

      return {
        id: step.id || `step_${index + 1}`,
        order: index + 1,
        title,
        explanation: isWeakActionText(step.explanation)
          ? 'Arbeite diesen Schritt so ab, dass am Ende ein pruefbares Ergebnis sichtbar ist.'
          : step.explanation,
        whyItMatters: isWeakActionText(step.whyItMatters)
          ? 'Dieser Schritt entfernt einen konkreten Engpass und macht den naechsten Schritt leichter.'
          : step.whyItMatters,
        estimatedDays: step.estimatedDays,
        checklist: checklist.length >= 2
          ? checklist
          : concreteChecklistFor('dein Ziel', title, index),
        linkedTodoTitles: ensureArray<string>(step.linkedTodoTitles),
        linkedHabitTitles: ensureArray<string>(step.linkedHabitTitles),
      };
    });

  return {
    ...bundle,
    executionSteps: normalizedSteps,
    planMeta: {
      ...bundle.planMeta,
      targetStepCount: normalizedSteps.length,
    },
  };
}

async function requireAuthenticatedUser(request: Request, env: Env) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = match?.[1];

  if (!accessToken) {
    throw new Error('Missing bearer token');
  }

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Invalid bearer token: Supabase returned ${res.status} ${body.slice(0, 180)}`);
  }

  const user = (await res.json()) as { id?: string; email?: string };
  if (!user.id) {
    throw new Error('Invalid authenticated user payload');
  }

  return user;
}

type StudyTier = 'free' | 'student' | 'premium';
type ExtractionJob = {
  jobId: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  progress: { currentPage: number; totalPages: number; percent: number; stage: string };
  warnings: string[];
  result?: {
    pageCount: number;
    sections: Array<{
      title: string;
      content: string;
      orderIndex: number;
      sourcePageStart?: number;
      sourcePageEnd?: number;
      sourceSectionTitle?: string;
    }>;
    compactText?: string;
  };
  error?: string;
  ownerId: string;
  createdAt: number;
};

type ExtractionSection = NonNullable<ExtractionJob['result']>['sections'][number];

const studyExtractionJobs = new Map<string, ExtractionJob>();

const studyTierLimits: Record<StudyTier, { maxPagesPerFile: number; maxFileSizeMb: number }> = {
  free: { maxPagesPerFile: 10, maxFileSizeMb: 10 },
  student: { maxPagesPerFile: 100, maxFileSizeMb: 30 },
  premium: { maxPagesPerFile: 300, maxFileSizeMb: 100 },
};

function stripXml(value: string) {
  return value
    .replace(/<w:p[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanExtractedText(text: string) {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^\d+$/.test(line) && !/^seite\s+\d+/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sectionsFromText(text: string, pageCount: number) {
  const lines = cleanExtractedText(text).split('\n').filter(Boolean);
  const sections: ExtractionSection[] = [];
  let currentTitle = '';
  let current: string[] = [];

  const push = () => {
    if (!currentTitle && !current.length) return;
    const title = currentTitle || current[0]?.slice(0, 80) || `Abschnitt ${sections.length + 1}`;
    const content = current.join('\n') || title;
    sections.push({
      title,
      content: content.length > 900 ? content.slice(0, 900) : content,
      orderIndex: sections.length,
      sourcePageStart: pageCount ? Math.min(pageCount, sections.length + 1) : undefined,
      sourcePageEnd: pageCount ? Math.min(pageCount, sections.length + 1) : undefined,
      sourceSectionTitle: title,
    });
    currentTitle = '';
    current = [];
  };

  for (const line of lines) {
    const heading = line.length <= 90 && /^[A-ZÄÖÜ0-9][^.!?]{2,}$/.test(line);
    if (heading) {
      push();
      currentTitle = line;
    } else {
      current.push(line);
      if (current.join(' ').length > 900) push();
    }
  }
  push();
  return sections.length ? sections : [{ title: 'Lernstoff', content: cleanExtractedText(text).slice(0, 900), orderIndex: 0 }];
}

function extractDocxText(bytes: Uint8Array) {
  const unzipped = unzipSync(bytes);
  const document = unzipped['word/document.xml'];
  if (!document) throw new Error('DOCX enthaelt kein word/document.xml.');
  return cleanExtractedText(stripXml(strFromU8(document)));
}

function estimatePdfPageCount(raw: string) {
  const matches = raw.match(/\/Type\s*\/Page\b/g);
  return Math.max(1, matches?.length ?? 1);
}

function extractPdfText(raw: string) {
  const textMatches = [...raw.matchAll(/\(([^()]{2,500})\)\s*Tj/g)].map((match) => match[1]);
  const arrayMatches = [...raw.matchAll(/\[((?:\([^()]{1,300}\)\s*)+)\]\s*TJ/g)]
    .map((match) => [...match[1].matchAll(/\(([^()]{1,300})\)/g)].map((inner) => inner[1]).join(''));
  return cleanExtractedText([...textMatches, ...arrayMatches].join('\n'));
}

async function runStudyExtraction(request: Request, userId: string) {
  const form = await request.formData() as any;
  const file = form.get('file');
  const tier = safeString(form.get('tier')).trim() as StudyTier || 'free';
  const fileName = safeString(form.get('fileName')).trim().toLowerCase();
  const fileSize = safeNumber(form.get('fileSize'), 0);
  const limits = studyTierLimits[tier] ?? studyTierLimits.free;

  if (!(file instanceof File)) {
    return errorResponse('File is required.', 400);
  }

  if (!/\.(pdf|docx|txt|md)$/i.test(fileName || file.name)) {
    return errorResponse('Unsupported study file type.', 400);
  }

  if (fileSize > limits.maxFileSizeMb * 1024 * 1024) {
    return errorResponse('File exceeds current tier size limit.', 402, { paywallReason: 'file_size' });
  }

  const jobId = `study_job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const warnings: string[] = [];
  let text = '';
  let pageCount = 1;

  try {
    if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      text = cleanExtractedText(new TextDecoder().decode(bytes));
    } else if (fileName.endsWith('.docx')) {
      text = extractDocxText(bytes);
      pageCount = Math.max(1, Math.ceil(text.length / 2600));
    } else if (fileName.endsWith('.pdf')) {
      const raw = new TextDecoder('latin1').decode(bytes);
      pageCount = estimatePdfPageCount(raw);
      text = extractPdfText(raw);
      if (text.length / pageCount < 40) {
        throw new Error('Diese PDF scheint gescannt zu sein und enthaelt keinen auswaehlbaren Text. OCR ist noch nicht aktiviert.');
      }
    }

    if (pageCount > limits.maxPagesPerFile) {
      return errorResponse('File exceeds current tier page limit.', 402, { paywallReason: 'large_document', pageCount });
    }

    if (!text.trim()) {
      throw new Error('Das Dokument enthaelt keinen verwertbaren Text.');
    }

    const sections = sectionsFromText(text, pageCount);
    const compactText = sections.map((section: ExtractionSection) => `${section.title}\n${section.content}`).join('\n\n');
    const job: ExtractionJob = {
      jobId,
      ownerId: userId,
      status: 'done',
      progress: { currentPage: pageCount, totalPages: pageCount, percent: 100, stage: 'done' },
      warnings,
      result: { pageCount, sections, compactText },
      createdAt: Date.now(),
    };
    studyExtractionJobs.set(jobId, job);
    return jsonResponse(job);
  } catch (error: any) {
    const job: ExtractionJob = {
      jobId,
      ownerId: userId,
      status: 'failed',
      progress: { currentPage: 0, totalPages: pageCount, percent: 0, stage: 'failed' },
      warnings,
      error: error?.message ?? 'Study extraction failed.',
      createdAt: Date.now(),
    };
    studyExtractionJobs.set(jobId, job);
    return jsonResponse(job, 422);
  }
}

async function runStudyAiEnhancement(body: Record<string, unknown>, env: Env) {
  const userPayload = JSON.stringify(body);
  const estimatedInputTokens = Math.ceil(userPayload.length / 4);
  const estimatedOutputTokens = 1400;
  const estimatedCostUsd = (estimatedInputTokens + estimatedOutputTokens) * 0.0000001;
  const maxCostUsd = Number(env.OPENAI_STUDY_ENHANCEMENT_MAX_COST_USD || '0.002');

  if (estimatedCostUsd > maxCostUsd) {
    return {
      skipped: true,
      reason: 'cost_guard',
      estimatedCostUsd,
      maxCostUsd,
    };
  }

  const raw = await callPlannerModelRaw({
    env,
    model: env.OPENAI_STUDY_ENHANCEMENT_MODEL || env.OPENAI_MODEL_CHEAP || 'gpt-5-nano',
    system: [
      'Du bist Kalendulu Study Enhancer.',
      'Antworte nur mit JSON.',
      'Nutze nur die kompakten Lerneinheiten und Plan-Metadaten.',
      'Keine neuen Themen erfinden, keine Themen entfernen, keinen Scheduler ersetzen.',
      'Verbessere nur Titel, kurze summaries, Aufgabenformulierungen, Session-Titel und Wiederholungs-Hinweise.',
      'Gib ausschliesslich JSON mit optionalen Feldern units und plan zurueck.',
      'Behalte IDs, Zeiten, Dauer, unitIds und Reihenfolge bei.',
      'Nutze deutsche Nutzertexte: Lerneinheiten, Wiederholen, Kernstoff, Wichtig, Zusatz.',
    ].join('\n'),
    user: userPayload,
    maxCompletionTokens: estimatedOutputTokens,
  });
  return {
    ...(parseModelJsonLoose<Record<string, unknown>>(raw) ?? {}),
    estimatedCostUsd,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return jsonResponse({ ok: true });
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return jsonResponse({
          ok: true,
          worker: 'kalendulu-planner',
          supabaseHost: new URL(env.SUPABASE_URL).host,
          hasSupabaseKey: Boolean(env.SUPABASE_PUBLISHABLE_KEY),
          hasOpenAiKey: Boolean(env.OPENAI_API_KEY),
        });
      }

      const isStudyExtractionRoute = url.pathname.startsWith('/study/extractions');
      if (request.method !== 'POST' && !(isStudyExtractionRoute && (request.method === 'GET' || request.method === 'DELETE'))) {
        return errorResponse('Method not allowed', 405);
      }

      let authUser: { id?: string; email?: string };
      try {
        authUser = await requireAuthenticatedUser(request, env);
      } catch (error: any) {
        return errorResponse('Unauthorized', 401, {
          authDebug: error?.message ?? 'Unknown auth error',
          supabaseHost: (() => {
            try {
              return new URL(env.SUPABASE_URL).host;
            } catch {
              return 'invalid_supabase_url';
            }
          })(),
        });
      }

      if (isStudyExtractionRoute) {
        if (request.method === 'POST' && url.pathname === '/study/extractions') {
          return runStudyExtraction(request, authUser.id ?? '');
        }

        const jobId = url.pathname.split('/').filter(Boolean).slice(-1)[0];
        const job = studyExtractionJobs.get(jobId);
        if (!job || job.ownerId !== authUser.id) {
          return errorResponse('Extraction job not found.', 404);
        }

        if (request.method === 'DELETE') {
          studyExtractionJobs.delete(jobId);
          return jsonResponse({ ok: true });
        }

        return jsonResponse(job);
      }

      const body = (await request.json()) as Record<string, unknown>;

      if (url.pathname === '/study/ai/enhance') {
        try {
          const enhanced = await runStudyAiEnhancement({
            ...body,
            userId: authUser.id,
          }, env);
          return jsonResponse(enhanced);
        } catch (error: any) {
          return errorResponse(error?.message ?? 'Study AI enhancement failed.', 502);
        }
      }

      const adaptivePrefix = '/api/ai/adaptive-goal/';
      if (url.pathname.startsWith(adaptivePrefix)) {
        const kind = url.pathname.slice(adaptivePrefix.length);
        if (
          kind === 'analyze' ||
          kind === 'questions' ||
          kind === 'blueprint' ||
          kind === 'learn' ||
          kind === 'regenerate'
        ) {
          try {
            const generated = await runAdaptiveGoalEndpoint({
              kind,
              body: {
                ...body,
                userId: authUser.id,
              },
              env,
            });

            if (!generated || typeof generated !== 'object') {
              return errorResponse('Adaptive Goal model returned invalid JSON.', 502);
            }

            return jsonResponse(generated);
          } catch (error: any) {
            return errorResponse(error?.message ?? 'Adaptive Goal request failed.', 502);
          }
        }
      }

      if (url.pathname === '/goal/refine') {
        const goal = safeString(body.goal).trim();
        const difficultyLevel = clamp(safeNumber(body.difficultyLevel, 5), 1, 10);
        const targetQuestionCount = questionCountForDifficulty(difficultyLevel);
        const goalType = inferGoalType(goal);

        if (!goal) {
          return errorResponse('Goal is required.', 400);
        }

        const system = refinementSystemPrompt(targetQuestionCount, goalType);
        const user = JSON.stringify({
          goal,
          difficultyLevel,
          targetQuestionCount,
          targetDate: safeString(body.targetDate),
          pastGoals: ensureArray(body.pastGoals),
          profile: body.profile ?? {},
          existingAnswers: body.existingAnswers ?? {},
          userId: authUser.id,
        });

        try {
          const selectedModel = selectOpenAiModel({
            purpose: 'refine',
            difficultyLevel,
            targetCount: targetQuestionCount,
            env,
          });

          const raw = await callPlannerModelRaw({
            env,
            model: selectedModel.model,
            system,
            user,
            maxCompletionTokens: selectedModel.maxCompletionTokens,
          });

          const parsed = parseModelJsonLoose<GoalRefinementResponse>(raw);

          if (!parsed || !Array.isArray(parsed.questions) || !parsed.questions.length) {
            return jsonResponse(buildFallbackRefinement(goal, difficultyLevel));
          }

          const normalized: GoalRefinementResponse = {
            goalLabel: parsed.goalLabel || goal,
            goalType: parsed.goalType || goalType,
            questions: parsed.questions.slice(0, targetQuestionCount),
            analysis: {
              category: parsed.analysis?.category || goalType,
              complexity:
                parsed.analysis?.complexity ||
                (difficultyLevel >= 8 ? 'high_complexity' : difficultyLevel >= 5 ? 'advanced' : 'moderate'),
              difficulty:
                parsed.analysis?.difficulty ||
                (difficultyLevel >= 9 ? 'very_hard' : difficultyLevel >= 7 ? 'hard' : difficultyLevel >= 4 ? 'medium' : 'easy'),
              rationale: ensureArray<string>(parsed.analysis?.rationale),
              missingInformation: ensureArray<string>(parsed.analysis?.missingInformation),
              recommendedQuestionCount: targetQuestionCount,
              targetQuestionCount,
            },
          };

          return jsonResponse(normalized);
        } catch {
          return jsonResponse(buildFallbackRefinement(goal, difficultyLevel));
        }
      }

      if (url.pathname === '/planner/suggest') {
        const goal = safeString(body.goal).trim();
        const difficultyLevel = clamp(safeNumber(body.difficultyLevel, 5), 1, 10);
        const targetStepCount = stepCountForDifficulty(difficultyLevel);
        const targetDate = safeString(body.targetDate) || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        if (!goal) {
          return errorResponse('Goal is required.', 400);
        }

        const domain = inferDomain(goal);
        const weeklyHours = extractWeeklyHours(body);
        const signals = buildSignalsFromBody(body);

        const blueprint = generateMasterBlueprint({
          goalTitle: goal,
          domain,
          targetDateIso: targetDate,
          difficultyLevel,
          weeklyHours,
          signals,
          userStyle: {
            ambition: 0.88,
            perfectionism: 0.92,
            pressureTolerance: 0.76,
            consistency: 0.62,
          },
        });

        const deterministicBundle = convertBlueprintToBundle(
          blueprint,
          goal,
          targetDate,
          targetStepCount,
        );

        try {
          const system = plannerSystemPrompt(targetStepCount, deterministicBundle);
          const user = JSON.stringify({
            goal,
            difficultyLevel,
            targetStepCount,
            targetDate,
            profile: body.profile ?? {},
            signals: body.signals ?? {},
            freeSlots: body.freeSlots ?? [],
            answers: body.answers ?? {},
            userPlanningProfile: body.userPlanningProfile ?? {},
            goalLearningProfile: body.goalLearningProfile ?? {},
            pastGoals: body.goals ?? [],
            deterministicBlueprint: deterministicBundle,
            userId: authUser.id,
          });

          const selectedModel = selectOpenAiModel({
            purpose: 'plan',
            difficultyLevel,
            targetCount: targetStepCount,
            signalCount: signals.length,
            env,
          });

          const raw = await callPlannerModelRaw({
            env,
            model: selectedModel.model,
            system,
            user,
            maxCompletionTokens: selectedModel.maxCompletionTokens,
          });

          const parsed = parseModelJsonLoose<PlannerBundle>(raw);

          if (!parsed || !parsed.primary || !Array.isArray(parsed.executionSteps)) {
            return jsonResponse(deterministicBundle);
          }

          const merged: PlannerBundle = {
            primary: {
              todo: parsed.primary.todo ?? deterministicBundle.primary.todo,
              habit: parsed.primary.habit ?? deterministicBundle.primary.habit,
              calendar: parsed.primary.calendar ?? deterministicBundle.primary.calendar,
              routines: ensureArray<PlannerRoutine>(parsed.primary.routines).length
                ? ensureArray<PlannerRoutine>(parsed.primary.routines)
                : deterministicBundle.primary.routines,
            },
            alternatives: [],
            executionSteps: parsed.executionSteps,
            systemMap: parsed.systemMap ?? deterministicBundle.systemMap,
            planMeta: {
              depth:
                parsed.planMeta?.depth ??
                deterministicBundle.planMeta?.depth,
              difficulty:
                parsed.planMeta?.difficulty ??
                deterministicBundle.planMeta?.difficulty,
              complexity:
                parsed.planMeta?.complexity ??
                deterministicBundle.planMeta?.complexity,
              summary:
                parsed.planMeta?.summary ??
                deterministicBundle.planMeta?.summary,
              targetStepCount,
              coachStyle:
                `${parsed.planMeta?.coachStyle ?? deterministicBundle.planMeta?.coachStyle}__${selectedModel.reason}`,
            },
          };

          return jsonResponse(normalizePlannerBundle(merged, targetStepCount));
        } catch {
          return jsonResponse(deterministicBundle);
        }
      }

      return errorResponse('Not found', 404);
    } catch (error: any) {
      return errorResponse(error?.message ?? 'Unknown error', 500);
    }
  },
};
