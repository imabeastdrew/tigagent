/**
 * Guardrails utility functions
 * 
 * These functions handle the results from OpenAI guardrails and provide
 * safe text extraction and failure output formatting.
 */

/**
 * Check if any guardrail has triggered a tripwire
 */
export function guardrailsHasTripwire(results: any[]): boolean {
  return (results ?? []).some((r) => r?.tripwireTriggered === true);
}

/**
 * Extract safe text from guardrail results
 * Prefers checked_text as the generic safe/processed text
 * Falls back to PII-specific anonymized_text if present
 */
export function getGuardrailSafeText(results: any[], fallbackText: string): string {
  // Prefer checked_text as the generic safe/processed text
  for (const r of results ?? []) {
    if (r?.info && ("checked_text" in r.info)) {
      return r.info.checked_text ?? fallbackText;
    }
  }
  
  // Fall back to PII-specific anonymized_text if present
  const pii = (results ?? []).find((r) => r?.info && "anonymized_text" in r.info);
  return pii?.info?.anonymized_text ?? fallbackText;
}

/**
 * Build structured failure output for guardrail violations
 */
export function buildGuardrailFailOutput(results: any[]): any {
  const get = (name: string) => (results ?? []).find((r) => {
    const info = r?.info ?? {};
    const n = (info?.guardrail_name ?? info?.guardrailName);
    return n === name;
  });
  
  const pii = get("Contains PII");
  const mod = get("Moderation");
  const jb = get("Jailbreak");
  const hal = get("Hallucination Detection");
  
  const piiCounts = Object.entries(pii?.info?.detected_entities ?? {})
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => k + ":" + (v as any[]).length);
  
  const thr = jb?.info?.threshold;
  const conf = jb?.info?.confidence;

  return {
    pii: {
      failed: (piiCounts.length > 0) || pii?.tripwireTriggered === true,
      ...(piiCounts.length ? { detected_counts: piiCounts } : {}),
      ...(pii?.executionFailed && pii?.info?.error ? { error: pii.info.error } : {}),
    },
    moderation: {
      failed: mod?.tripwireTriggered === true || ((mod?.info?.flagged_categories ?? []).length > 0),
      ...(mod?.info?.flagged_categories ? { flagged_categories: mod.info.flagged_categories } : {}),
      ...(mod?.executionFailed && mod?.info?.error ? { error: mod.info.error } : {}),
    },
    jailbreak: {
      // Rely on runtime-provided tripwire; don't recompute thresholds
      failed: jb?.tripwireTriggered === true,
      ...(jb?.executionFailed && jb?.info?.error ? { error: jb.info.error } : {}),
    },
    hallucination: {
      // Rely on runtime-provided tripwire; don't recompute
      failed: hal?.tripwireTriggered === true,
      ...(hal?.info?.reasoning ? { reasoning: hal.info.reasoning } : {}),
      ...(hal?.info?.hallucination_type ? { hallucination_type: hal.info.hallucination_type } : {}),
      ...(hal?.info?.hallucinated_statements ? { hallucinated_statements: hal.info.hallucinated_statements } : {}),
      ...(hal?.info?.verified_statements ? { verified_statements: hal.info.verified_statements } : {}),
      ...(hal?.executionFailed && hal?.info?.error ? { error: hal.info.error } : {}),
    },
  };
}
