export interface Option {
  value: string
  label: string
}

export interface QuestionDef {
  id: keyof import('../types').NominationAnswers
  prompt: string
  hint?: string
  type: 'single' | 'multi'
  options: Option[]
}

/** The 7 scored questions from docs/BUILD_PLAN.md. Question 8 (demand) is handled separately — see payBandOptions. */
export const nominationQuestions: QuestionDef[] = [
  {
    id: 'placeType',
    prompt: 'What kind of place is it?',
    type: 'single',
    options: [
      { value: 'unused_land', label: 'Unused land' },
      { value: 'grass_field', label: 'Grass area or field' },
      { value: 'lay_by', label: 'Lay-by' },
      { value: 'car_park', label: 'Car park' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    id: 'ownerType',
    prompt: 'Who owns it, if you know?',
    type: 'single',
    options: [
      { value: 'council', label: 'Council' },
      { value: 'public_body', label: 'Other public body' },
      { value: 'business', label: 'Business' },
      { value: 'private_individual', label: 'Private individual' },
      { value: 'i_own_it', label: 'I own it' },
      { value: 'dont_know', label: "Don't know" },
    ],
  },
  {
    id: 'nearestHouse',
    prompt: 'How far is the nearest house?',
    type: 'single',
    options: [
      { value: 'under_20m', label: 'Under 20m' },
      { value: '20_50m', label: '20–50m' },
      { value: 'over_50m', label: 'Over 50m' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    id: 'slope',
    prompt: 'Is the ground fairly flat?',
    type: 'single',
    options: [
      { value: 'flat', label: 'Flat' },
      { value: 'gentle_slope', label: 'Gentle slope' },
      { value: 'steep', label: 'Steep' },
    ],
  },
  {
    id: 'roomForFive',
    prompt: 'Room for at least five motorhomes?',
    hint: 'A bit bigger than a tennis court',
    type: 'single',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'not_sure', label: 'Not sure' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    id: 'nearby',
    prompt: "What's within a 10-minute walk?",
    hint: 'Choose as many as apply',
    type: 'multi',
    options: [
      { value: 'pub', label: 'Pub' },
      { value: 'shop', label: 'Shop' },
      { value: 'town_centre', label: 'Town centre' },
      { value: 'attraction', label: 'Attraction' },
      { value: 'beach_or_trail', label: 'Beach or trail' },
      { value: 'none', label: 'None' },
    ],
  },
  {
    id: 'water',
    prompt: 'Is there water or drainage nearby?',
    type: 'single',
    options: [
      { value: 'toilet_block', label: 'Toilet block' },
      { value: 'water_tap', label: 'Water tap' },
      { value: 'both', label: 'Both' },
      { value: 'dont_know', label: "Don't know" },
    ],
  },
]

export const payBandOptions: Option[] = [
  { value: 'free_only', label: 'Yes, free only' },
  { value: 'up_to_10', label: 'Up to £10' },
  { value: '10_15', label: '£10–15' },
  { value: '15_20', label: '£15–20' },
  { value: '20_plus', label: '£20+ a night' },
]

export const howKnownOptions: Option[] = [
  { value: 'i_own_it', label: 'I own it' },
  { value: 'i_know_them', label: 'I know them' },
  { value: 'public_information', label: 'Public information (a sign, a website)' },
  { value: 'dont_know', label: "I don't know" },
]
