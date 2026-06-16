export type StudyBillingPlan =
  | 'free_demo'
  | 'starter'
  | 'plus'
  | 'premium_monthly'
  | 'premium_yearly';

export const STUDY_PLAN_LABELS: Record<StudyBillingPlan, string> = {
  free_demo: 'Free Demo',
  starter: 'Starter',
  plus: 'Plus',
  premium_monthly: 'Premium',
  premium_yearly: 'Premium Jahr',
};

export const STUDY_LIMIT_REACHED_COPY = {
  title: 'Monatliches KI-Limit erreicht',
  message:
    'Du hast dein monatliches KI-Budget ausgeschoepft. Du kannst zusaetzliche KI-Credits kaufen oder auf einen hoeheren Plan wechseln.',
  freeDemo:
    'Im kostenlosen Modus wurde nur eine Demo aus den ersten 5 Seiten erstellt. Upgrade, um das vollstaendige Dokument zu verarbeiten.',
};
