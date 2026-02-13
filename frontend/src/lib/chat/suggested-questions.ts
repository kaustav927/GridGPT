const QUESTION_SETS: string[][] = [
  [
    'Why are prices high right now?',
    'What is the current fuel mix?',
    'Is there enough supply to meet forecast demand?',
    'Are we importing or exporting power?',
  ],
  [
    'Compare today\'s prices to yesterday',
    'Which zone has the cheapest day-ahead price today?',
    'How much power are we trading with Quebec and New York?',
    'What does the day-ahead market look like?',
  ],
  [
    'Show me price spikes in the last week',
    'How does wind generation compare to last week?',
    'What\'s the weather across Ontario?',
    'What is the DA vs realtime price spread?',
  ],
];

// Deterministic default for SSR — always returns set 0
export function getSuggestedQuestions(): string[] {
  return QUESTION_SETS[0];
}

// Client-side only — returns a random set
export function getRandomSuggestedQuestions(): string[] {
  const idx = Math.floor(Math.random() * QUESTION_SETS.length);
  return QUESTION_SETS[idx];
}
