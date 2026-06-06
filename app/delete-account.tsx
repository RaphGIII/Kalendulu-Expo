import React from 'react';
import { LegalDocumentScreen } from '@/src/legal/LegalDocumentScreen';
import { deleteAccountSections } from '@/src/legal/legalContent';

export default function DeleteAccountInfoScreen() {
  return (
    <LegalDocumentScreen
      title="Account und Daten löschen"
      subtitle="Informationen zur Löschung deines Kalendulu-Accounts"
      sections={deleteAccountSections}
    />
  );
}