// Single source of truth for the Grid AI model.
// Override at runtime with the ANTHROPIC_MODEL env var (e.g. in Vercel) without a redeploy of code.
// The weekly maintenance agent bumps this default when a newer Sonnet-tier model ships.
export const CHAT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
