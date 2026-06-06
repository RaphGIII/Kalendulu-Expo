export type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export const legalOperator = {
  appName: 'Kalendulu',
  operatorName: 'TODO: Betreibername eintragen',
  address: 'TODO: vollständige Anschrift eintragen',
  email: 'TODO: Support-E-Mail eintragen',
  country: 'TODO: Land eintragen',
  lastUpdated: '06.06.2026',
};

export const privacySections: LegalSection[] = [
  {
    title: '1. Verantwortlicher',
    paragraphs: [
      `${legalOperator.operatorName}, ${legalOperator.address}, E-Mail: ${legalOperator.email}.`,
      'Diese Angaben müssen vor der Veröffentlichung durch echte Betreiberangaben ersetzt werden.',
    ],
  },
  {
    title: '2. Verarbeitete Daten',
    bullets: [
      'Accountdaten: E-Mail-Adresse, User-ID, Name, Login-Informationen.',
      'Appdaten: Ziele, Todos, Habits, Kalenderdaten, Fortschritte, Einstellungen und Reflexionen.',
      'KI-Daten: Zieltexte, Antworten und Planungsdaten, soweit sie zur Erstellung von Fragen, Blueprints und Vorschlägen verarbeitet werden.',
      'Lokale Daten: Theme, Einstellungen, Profilbild-URI und lokale Appzustände.',
      'Benachrichtigungsdaten: lokale oder serverseitige Erinnerungsdaten, falls Benachrichtigungen aktiviert werden.',
      'Medienzugriff: Zugriff auf die Fotomediathek nur, wenn ein Profilbild ausgewählt wird.',
    ],
  },
  {
    title: '3. Zweck der Verarbeitung',
    bullets: [
      'Bereitstellung von Login und Synchronisierung.',
      'Speicherung und Anzeige persönlicher Ziele, Aufgaben, Gewohnheiten und Termine.',
      'Erstellung personalisierter KI-Zielpläne.',
      'Fortschrittsverfolgung und wöchentliche Reviews.',
      'Benachrichtigungen und Erinnerungen, sofern aktiviert.',
    ],
  },
  {
    title: '4. Technische Dienstleister',
    bullets: [
      'Supabase für Authentifizierung, Datenbank und serverseitige Account-Löschung.',
      'Cloudflare Worker für KI-Backend-Logik, falls aktiviert.',
      'OpenAI oder andere KI-Anbieter für die Verarbeitung von Zieltexten, falls aktiviert.',
      'Expo-Dienste für App-Entwicklung, Build und Benachrichtigungsfunktionen, soweit genutzt.',
    ],
  },
  {
    title: '5. Account- und Datenlöschung',
    paragraphs: [
      'Du kannst deinen Account in der App unter Einstellungen > Account > Account löschen dauerhaft löschen.',
      'Dabei werden dein Auth-Account sowie gespeicherte Kalendulu-Daten gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.',
      `Alternativ kannst du eine Löschanfrage an ${legalOperator.email} senden.`,
    ],
  },
  {
    title: '6. Nutzerrechte',
    bullets: [
      'Auskunft über gespeicherte personenbezogene Daten.',
      'Berichtigung unrichtiger Daten.',
      'Löschung personenbezogener Daten.',
      'Einschränkung der Verarbeitung.',
      'Widerspruch gegen bestimmte Verarbeitungen.',
      'Datenübertragbarkeit, soweit anwendbar.',
    ],
  },
  {
    title: '7. Hinweis zu KI-Inhalten',
    paragraphs: [
      'Kalendulu kann KI-generierte Zielpläne, Vorschläge und Reflexionsfragen anzeigen. Diese Inhalte können fehlerhaft sein und ersetzen keine medizinische, rechtliche, psychologische oder finanzielle Beratung.',
    ],
  },
];

export const imprintSections: LegalSection[] = [
  {
    title: 'Betreiber',
    paragraphs: [
      `App: ${legalOperator.appName}`,
      `Betreiber: ${legalOperator.operatorName}`,
      `Adresse: ${legalOperator.address}`,
      `E-Mail: ${legalOperator.email}`,
      `Land: ${legalOperator.country}`,
    ],
  },
  {
    title: 'Rechtlicher Hinweis',
    paragraphs: [
      'Dieses Impressum muss vor Veröffentlichung mit echten und vollständigen Anbieterangaben ergänzt werden.',
      'Je nach Land und Rechtsform können zusätzliche Angaben erforderlich sein, zum Beispiel Unternehmensregister, UID, Kammerzugehörigkeit oder berufsrechtliche Angaben.',
    ],
  },
  {
    title: 'Haftung für Inhalte',
    paragraphs: [
      'Die Inhalte der App werden sorgfältig erstellt. Für Richtigkeit, Vollständigkeit und Aktualität kann jedoch keine Gewähr übernommen werden.',
    ],
  },
];

export const supportSections: LegalSection[] = [
  {
    title: 'Kontakt und Support',
    paragraphs: [
      `Für Fragen, Supportanfragen oder Datenlöschanfragen kontaktiere uns unter: ${legalOperator.email}`,
    ],
  },
  {
    title: 'Account löschen',
    paragraphs: [
      'Du kannst deinen Account direkt in der App löschen:',
      'Einstellungen > Account > Account löschen',
    ],
  },
  {
    title: 'Bearbeitungszeit',
    paragraphs: [
      'Lösch- und Supportanfragen werden so schnell wie möglich bearbeitet. Vor Veröffentlichung muss hier eine reale Bearbeitungsfrist ergänzt werden.',
    ],
  },
];

export const deleteAccountSections: LegalSection[] = [
  {
    title: 'Account in der App löschen',
    paragraphs: [
      'Öffne Kalendulu und gehe zu:',
      'Einstellungen > Account > Account löschen',
      'Bestätige danach die endgültige Löschung.',
    ],
  },
  {
    title: 'Welche Daten gelöscht werden',
    bullets: [
      'Supabase Auth-Account.',
      'Profilinformationen.',
      'Gespeicherte Appdaten wie Ziele, Todos, Habits, Kalenderdaten, Fortschritte und Reflexionen.',
      'KI-Planungsdaten und Feedbackdaten, soweit sie deinem Account zugeordnet sind.',
      'Lokale Kalendulu-Appdaten auf dem Gerät, soweit technisch erreichbar.',
    ],
  },
  {
    title: 'Alternative Löschanfrage',
    paragraphs: [
      `Wenn du die App nicht mehr installiert hast, sende eine Löschanfrage an: ${legalOperator.email}`,
      'Bitte nutze dabei die E-Mail-Adresse deines Kalendulu-Accounts.',
    ],
  },
  {
    title: 'Wichtiger Hinweis',
    paragraphs: [
      'Vor Store-Veröffentlichung muss diese Seite über eine öffentliche Web-URL erreichbar sein, zum Beispiel https://kalendulu.com/delete-account.',
    ],
  },
];