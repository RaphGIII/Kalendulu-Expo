import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import type { StudyPlan, StudyProject, KnowledgeUnit, StudySession } from '../types';

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').slice(0, 60);
}

function coverageLabel(status: KnowledgeUnit['coverageStatus']) {
  if (status === 'core') return 'Kernstoff';
  if (status === 'important') return 'Wichtig';
  return 'Zusatz';
}

function sessionTypeLabel(type: StudySession['sessionType']) {
  if (type === 'review') return 'Wiederholen';
  if (type === 'catchup') return 'Nachholen';
  if (type === 'quiz') return 'Quiz';
  return 'Lernen';
}

function groupSessionsByDate(sessions: StudySession[]) {
  const groups = new Map<string, StudySession[]>();
  for (const session of sessions) {
    const key = session.scheduledStart.slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, sessions: items.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)) }));
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderPlanText(project: StudyProject, units: KnowledgeUnit[], plan: StudyPlan) {
  const unitNames = new Map(units.map((unit) => [unit.id, unit.title]));
  const dayLines = groupSessionsByDate(plan.sessions).flatMap((day) => [
    '',
    day.date,
    ...day.sessions.map(
      (session) =>
        `- ${timeLabel(session.scheduledStart)}-${timeLabel(session.scheduledEnd)} ${sessionTypeLabel(session.sessionType)}: ${session.title} (${session.estimatedMinutes} Min)`,
    ),
  ]);
  const reviewLines = plan.repetitionItems.map((item) => {
    const title = unitNames.get(item.unitId) ?? 'Lerneinheit';
    return `- ${new Date(item.dueAt).toLocaleString()}: Wiederholen ${title} (${item.estimatedMinutes} Min)`;
  });
  const lines = [
    'Kalendulu Lernplan',
    '',
    `Projekt: ${project.title}`,
    `Pruefung: ${project.examDate ?? 'ohne Datum'}`,
    `Zielniveau: ${project.targetLevel}`,
    `Gesamtaufwand: ${plan.requiredMinutes} Minuten`,
    `Verfuegbare Zeit: ${plan.availableMinutes} Minuten`,
    `Machbarkeit: ${plan.feasible ? 'realistisch' : 'eng'}`,
    '',
    'Priorisierte Stoffuebersicht',
    ...units.map(
      (unit) =>
        `- ${unit.title} (${coverageLabel(unit.coverageStatus)}, Schwierigkeit ${unit.difficulty}/5, Wichtigkeit ${unit.importance}/5, ${unit.estimatedMinutes} Min)`,
    ),
    '',
    'Tagesplan',
    ...dayLines,
    '',
    'Spaced Repetition',
    ...reviewLines,
    '',
    'Hinweis: Dieser Lernplan wurde aus deinen Angaben algorithmisch erstellt.',
  ];
  return lines.join('\n');
}

export async function exportStudyPlanAsPdf(input: {
  project: StudyProject;
  units: KnowledgeUnit[];
  plan: StudyPlan;
}) {
  const name = `Kalendulu-Lernplan-${safeFilePart(input.project.title)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  const uri = `${FileSystem.cacheDirectory}${name}`;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const lines = renderPlanText(input.project, input.units, input.plan).split('\n');
  let page = pdf.addPage([595, 842]);
  let y = 800;

  for (const line of lines) {
    if (y < 48) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    const isTitle =
      line === 'Kalendulu Lernplan' || ['Priorisierte Stoffuebersicht', 'Tagesplan', 'Spaced Repetition'].includes(line);
    page.drawText(line.slice(0, 105), {
      x: 42,
      y,
      size: isTitle ? 16 : 10,
      font: isTitle ? bold : font,
      color: isTitle ? rgb(0.08, 0.16, 0.33) : rgb(0.12, 0.12, 0.12),
    });
    y -= isTitle ? 24 : 15;
  }

  const base64 = await pdf.saveAsBase64();
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Lernplan exportieren' });
  }
  return uri;
}

export async function exportStudyPlanAsDocx(input: {
  project: StudyProject;
  units: KnowledgeUnit[];
  plan: StudyPlan;
}) {
  const name = `Kalendulu-Lernplan-${safeFilePart(input.project.title)}-${new Date().toISOString().slice(0, 10)}.docx`;
  const uri = `${FileSystem.cacheDirectory}${name}`;
  const lines = renderPlanText(input.project, input.units, input.plan).split('\n');
  const doc = new Document({
    sections: [{
      children: lines.map((line) => {
        const heading = line === 'Kalendulu Lernplan'
          ? HeadingLevel.TITLE
          : ['Priorisierte Stoffuebersicht', 'Tagesplan', 'Spaced Repetition'].includes(line)
            ? HeadingLevel.HEADING_1
            : undefined;
        return new Paragraph({
          heading,
          children: [new TextRun(line || ' ')],
        });
      }),
    }],
  });
  const base64 = await Packer.toBase64String(doc);
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      dialogTitle: 'Lernplan exportieren',
    });
  }
  return uri;
}
