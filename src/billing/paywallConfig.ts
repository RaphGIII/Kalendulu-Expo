import type { PaywallReason } from './types';

export const PAYWALL_COPY: Record<PaywallReason, { title: string; body: string }> = {
  large_document: {
    title: 'Grosses Skript automatisch planen',
    body: 'Mit Premium kannst du PDF- und DOCX-Dateien bis 300 Seiten hochladen. Kalendulu extrahiert die Hauptthemen, priorisiert den Stoff, erstellt deinen Tagesplan und exportiert ihn als PDF/DOCX.',
  },
  monthly_pages: {
    title: 'Monatslimit erreicht',
    body: 'Dieses Dokument ueberschreitet dein aktuelles Seitenlimit. Mit Premium kannst du bis zu 1.000 Seiten pro Monat verarbeiten.',
  },
  file_size: {
    title: 'Datei zu gross',
    body: 'Dein aktueller Plan erlaubt kleinere Dateien. Mit Premium kannst du grosse Skripte bis 100 MB verarbeiten.',
  },
  active_projects: {
    title: 'Mehr Lernprojekte',
    body: 'Mit Student oder Premium kannst du mehrere aktive Lernprojekte parallel planen und verfolgen.',
  },
  ai_enhancement: {
    title: 'KI-Veredelung freischalten',
    body: 'KI-Veredelung ist in Premium enthalten und verbessert Titel, Aufgaben und kurze Zusammenfassungen. Dein Plan funktioniert auch ohne KI.',
  },
  docx_export: {
    title: 'DOCX-Export freischalten',
    body: 'Mit Premium kannst du deinen Lernplan als DOCX exportieren und weiterbearbeiten.',
  },
  pdf_export: {
    title: 'PDF-Export freischalten',
    body: 'Mit Student oder Premium kannst du deinen Lernplan als PDF teilen.',
  },
};
