import { LegalDocumentScreen } from "@/src/legal/LegalDocumentScreen";
import { supportSections } from "@/src/legal/legalContent";
import React from "react";

export default function SupportScreen() {
  return (
    <LegalDocumentScreen
      title="Support"
      subtitle="Kontakt, Hilfe und Datenanfragen"
      sections={supportSections}
    />
  );
}
