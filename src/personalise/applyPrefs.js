// Merges a buyer's live preferences into their profile so every API (feed, bundles,
// cart pricing) works off the latest personalised view of the shopper.
export function applyPrefs(persona, prefs) {
  if (!persona || persona.type !== 'buyer' || !prefs) return persona
  return {
    ...persona,
    affinity: { ...persona.affinity, ...prefs.categoryWeights },
    priceBand: prefs.priceBand ?? persona.priceBand,
    preferredTags: prefs.preferredTags?.length ? prefs.preferredTags : persona.preferredTags,
    styles: prefs.styles?.length ? prefs.styles : persona.styles,
    subBoost: prefs.subcategoryBoost ?? {},
    avoid: prefs.avoid ?? { subcategories: [], productIds: [] },
    reengage: prefs.reengage ?? [],
    offer: prefs.discount?.pct ? prefs.discount : null,
    bundlePct: prefs.bundle?.discountPct,
    bundleFocus: prefs.bundle?.focusSubcategories ?? [],
  }
}
