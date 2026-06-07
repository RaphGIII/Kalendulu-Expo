import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import type { StudyPlan, StudyProject, KnowledgeUnit } from '../types';

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').slice(0, 60);
}

function renderPlanText(project: StudyProject, units: KnowledgeUnit[], plan: StudyPlan) {
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
    ...units.map((unit) => `- ${unit.title} (${unit.coverageStatus}, S${unit.difficulty}/W${unit.importance}, ${unit.estimatedMinutes} Min)`),
    '',
    'Tagesplan',
    ...plan.sessions.map((session) => `- ${new Date(session.scheduledStart).toLocaleString()}: ${session.title} (${session.estimatedMinutes} Min)`),
    '',
    'Spaced Repetition',
    ...plan.repetitionItems.map((item) => `- ${new Date(item.dueAt).toLocaleString()}: Review ${item.unitId} (${item.estimatedMinutes} Min)`),
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
    const isTitle = line === 'Kalendulu Lernplan' || ['Priorisierte Stoffuebersicht', 'Tagesplan', 'Spaced Repetition'].includes(line);
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
