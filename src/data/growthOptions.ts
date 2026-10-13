/**
 * Support page's "Help us grow" options — shared between SupportScreen
 * (which renders them) and the admin Growth screen (which needs to spot
 * the crowdfund option specifically to flag it for CRM follow-up).
 */
export const GROWTH_OPTION_CROWDFUND = "I'd support a crowdfund"
export const GROWTH_OPTION_RAFFLE = "I'd support a raffle or regular prize draw"
export const GROWTH_OPTION_HELPFUL_POSITION = 'I hold a helpful position'
export const GROWTH_OPTION_IDEA = 'I have an idea to help growth'

export const GROWTH_OPTIONS = [
  GROWTH_OPTION_CROWDFUND,
  GROWTH_OPTION_RAFFLE,
  GROWTH_OPTION_HELPFUL_POSITION,
  GROWTH_OPTION_IDEA,
]

// Options that are just a plain expression of interest — tapping submits
// immediately (same flow as GROWTH_OPTION_CROWDFUND), no "tell us more" text
// box, unlike GROWTH_OPTION_HELPFUL_POSITION/GROWTH_OPTION_IDEA which need
// detail to be useful.
export const GROWTH_OPTIONS_IMMEDIATE = [GROWTH_OPTION_CROWDFUND, GROWTH_OPTION_RAFFLE]
