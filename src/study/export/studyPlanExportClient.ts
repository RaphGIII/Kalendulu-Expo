import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

import type { StudyPlan, StudyProject, KnowledgeUnit } from '../types';

type PdfLibModule = typeof import('pdf-lib');

async function loadPdfLib() {
  // pdf-lib's ESM build crashes in Expo Web/Metro because of its nested tslib export.
  // CommonJS is loaded lazily so normal app startup never imports pdf-lib.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('pdf-lib/cjs') as PdfLibModule;
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').slice(0, 60);
}

function renderPlanText(project: StudyProject, units: KnowledgeUnit[], plan: StudyPlan) {
  const unitTitles = new Map(units.map((unit) => [unit.id, unit.title]));

  const sessionsByDay = new Map<string, typeof plan.sessions>();

  for (const session of plan.sessions) {
    const key = session.scheduledStart.slice(0, 10);
    sessionsByDay.set(key, [...(sessionsByDay.get(key) ?? []), session]);
  }

  const dayLines = [...sessionsByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([dateKey, sessions]) => {
      const title = new Date(`${dateKey}T12:00:00`).toLocaleDateString('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      const sorted = sessions.sort((a, b) =>
        a.scheduledStart.localeCompare(b.scheduledStart),
      );

      return [
        '',
        title,
        ...sorted.map((session) => {
          const start = new Date(session.scheduledStart).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
          });

          const end = new Date(session.scheduledEnd).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
          });

          const type = session.sessionType === 'review' ? 'Wiederholen' : 'Lernen';
          const cleanTitle = session.title
            .replace(/^Lernen:\s*/i, '')
            .replace(/^Wiederholen:\s*/i, '');

          return `- ${start}-${end}: ${type}: ${cleanTitle} (${session.estimatedMinutes} Min)`;
        }),
      ];
    });

  const repetitionLines = plan.repetitionItems.map((item) => {
    const title = unitTitles.get(item.unitId) ?? 'Lerneinheit';

    return `- ${new Date(item.dueAt).toLocaleDateString('de-DE')}: ${title} wiederholen (${item.estimatedMinutes} Min)`;
  });

  const lines = [
    'Kalendulu Lernplan',
    '',
    `Projekt: ${project.title}`,
    `Prüfung: ${project.examDate ?? 'ohne Datum'}`,
    `Zielniveau: ${project.targetLevel}`,
    `Gesamtaufwand: ${plan.requiredMinutes} Minuten`,
    `Verfügbare Zeit: ${plan.availableMinutes} Minuten`,
    `Machbarkeit: ${plan.feasible ? 'realistisch' : 'eng'}`,
    '',
    'Priorisierte Stoffübersicht',
    ...units.map((unit) => {
      const label =
        unit.coverageStatus === 'core'
          ? 'Kernstoff'
          : unit.coverageStatus === 'important'
            ? 'Wichtig'
            : 'Zusatz';

      const page =
        unit.sourcePageStart || unit.sourcePageEnd
          ? `, Seite ${unit.sourcePageStart ?? unit.sourcePageEnd}${unit.sourcePageEnd && unit.sourcePageEnd !== unit.sourcePageStart ? `-${unit.sourcePageEnd}` : ''}`
          : '';

      return `- ${unit.title} (${label}, Schwierigkeit ${unit.difficulty}/5, Wichtigkeit ${unit.importance}/5, ${unit.estimatedMinutes} Min${page})`;
    }),
    '',
    'Tagesplan',
    ...dayLines,
    '',
    'Wiederholungsplan',
    ...repetitionLines,
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
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
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
