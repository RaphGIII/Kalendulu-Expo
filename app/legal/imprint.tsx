import { LegalDocumentScreen } from "@/src/legal/LegalDocumentScreen";
import { imprintSections } from "@/src/legal/legalContent";
import React from "react";

export default function ImprintScreen() {
  return (
    <LegalDocumentScreen
      title="Impressum"
      subtitle="Betreiber- und Kontaktangaben"
      sections={imprintSections}
    />
  );
}
