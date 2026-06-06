import { LegalDocumentScreen } from "@/src/legal/LegalDocumentScreen";
import { legalOperator, privacySections } from "@/src/legal/legalContent";
import React from "react";

export default function PrivacyScreen() {
  return (
    <LegalDocumentScreen
      title="Datenschutzerklärung"
      subtitle={`Stand: ${legalOperator.lastUpdated}`}
      sections={privacySections}
    />
  );
}
