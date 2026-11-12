import type { ListingCategory } from './types';

// RULE: Never hardcode commission rate — always read from PLATFORM_COMMISSION_RATE env var
// These defaults are fallbacks only — production must set the env variable explicitly
export const PLATFORM_DEFAULTS = {
  // RULE: auto-cancel + full refund if seller does not ship within 3 business days
  SELLER_SHIP_DAYS: 3,
  // RULE: buyer has 14 days from delivery confirmation to open a dispute
  BUYER_DISPUTE_DAYS: 14,
  // RULE: seller has 72 hours to respond before admin can rule in buyer's favour
  SELLER_RESPONSE_HOURS: 72,
  // RULE: funds auto-release to seller after 7 days if buyer does not dispute
  AUTO_CONFIRM_DAYS: 7,
  // RULE: debounce search input at 300ms to keep results fast
  SEARCH_DEBOUNCE_MS: 300,
} as const;

export const LISTING_CONDITIONS = ['new', 'like_new', 'good', 'fair', 'poor'] as const;
export type ListingCondition = typeof LISTING_CONDITIONS[number];

// Simplified condition options shown on the seller "sell item" form —
// reduces admin vs. the full LISTING_CONDITIONS list used elsewhere
export const SELLER_CONDITIONS = ['new', 'good', 'fair'] as const;

// Categories where the item belongs to a specific school (uniform, team kit)
// vs generic items sold nationwide (shoes, bags, books, equipment)
export const SCHOOL_SPECIFIC_CATEGORIES = ['School Uniforms', 'School Sports Kit'] as const;
export const NATIONWIDE_CATEGORIES = ['Shoes', 'Sports Equipment', 'Books & Stationery', 'University Textbooks', 'Bags & Accessories', 'Other'] as const;
export const ALL_CATEGORIES = [...SCHOOL_SPECIFIC_CATEGORIES, ...NATIONWIDE_CATEGORIES] as const;
// ListingCategory is exported from types.ts — do not re-export here

export const CATEGORY_EMOJI: Record<ListingCategory, string> = {
  'School Uniforms': '👕',
  'School Sports Kit': '🏆',
  'Shoes': '👟',
  'Sports Equipment': '⚽',
  'Books & Stationery': '📚',
  'University Textbooks': '🎓',
  'Bags & Accessories': '🎒',
  'Other': '📦',
};

export const SUBCATEGORIES: Record<ListingCategory, string[]> = {
  'School Uniforms': ['Tops & Shirts', 'Pants & Shorts', 'Skirts & Tunics', 'Dresses', 'Blazers & Jackets', 'Jerseys & Hoodies', 'Shoes', 'Ties & Accessories', 'Hats & Caps', 'Socks'],
  'School Sports Kit': ['Rugby', 'Soccer', 'Cricket', 'Hockey', 'Swimming', 'Athletics', 'Netball', 'Tennis', 'Other Sport'],
  'Shoes': ['Black School Shoes', 'PT / Takkies', 'Rugby Boots', 'Soccer Boots', 'Cricket Shoes', 'Hockey Shoes', 'Running Shoes', 'Other'],
  'Sports Equipment': ['Rackets & Bats', 'Balls', 'Protective Gear', 'Swimming Gear', 'Bags & Holdalls', 'Other'],
  'Books & Stationery': ['Textbooks', 'Study Guides', 'Stationery Sets', 'Calculators & Tech', 'Other'],
  'University Textbooks': ['First Year', 'Second Year', 'Third Year', 'Honours', 'Engineering', 'Law', 'Medicine', 'Commerce', 'Humanities', 'Other'],
  'Bags & Accessories': ['Backpacks', 'Sports Bags', 'Lunch Boxes', 'Water Bottles', 'Other'],
  'Other': ['Other'],
};

export const SPORTS = ['Rugby', 'Soccer', 'Cricket', 'Hockey', 'Swimming', 'Athletics', 'Netball', 'Tennis', 'Other'] as const;
export type Sport = typeof SPORTS[number];

export const SA_PROVINCES = [
  'Gauteng',
  'Western Cape',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Free State',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
] as const;
// SaProvince is exported from types.ts — do not re-export here

// SA school clothing sizes — age-based (children) then adult letter sizes
export const CLOTHING_SIZES = [
  '4', '6', '8', '10', '12', '14', '16', '18', '20',
  'XS', 'S', 'M', 'L', 'XL', 'XXL',
] as const;

// SA waist sizes for pants, shorts and skirts (inches)
export const BOTTOM_SIZES = [
  '20"', '22"', '24"', '26"', '28"', '30"', '32"', '34"', '36"', '38"',
] as const;

// SA shoe sizes — UK system (used in South Africa)
// Toddler: 3C–9C → Children: 10C–13C → Youth: 1–5 → Adult: 6–13
export const SHOE_SIZES = [
  '3C', '4C', '5C', '6C', '7C', '8C', '9C',
  '10C', '11C', '12C', '13C',
  '1', '2', '3', '4', '5',
  '6', '7', '8', '9', '10', '11', '12', '13',
] as const;

// Grouped for UI size pickers — toddler through adult
export const SHOE_SIZE_GROUPS = [
  { label: 'Toddler',  sizes: ['3C', '4C', '5C', '6C', '7C', '8C', '9C'] },
  { label: 'Children', sizes: ['10C', '11C', '12C', '13C'] },
  { label: 'Youth',    sizes: ['1', '2', '3', '4', '5'] },
  { label: 'Adult',    sizes: ['6', '7', '8', '9', '10', '11', '12', '13'] },
] as const;

export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

// Maps each subcategory to the right size picker.
// 'clothing' = tops/dresses, 'bottom' = waist/pants, 'shoe' = shoe sizes, 'none' = no size
// Sellers don't enter a title — it's derived from category/subcategory/size
// so listings still have a display name across browse, cart, orders, etc.
export function buildListingTitle(category: string, subcategory: string, size: string): string {
  const base = subcategory || category;
  return size ? `${base} - Size ${size}` : base;
}

export const SUBCATEGORY_SIZE_TYPE: Record<string, 'clothing' | 'bottom' | 'shoe' | 'none'> = {
  // School Uniforms
  'Tops & Shirts':      'clothing',
  'Pants & Shorts':     'bottom',
  'Skirts & Tunics':    'bottom',
  'Dresses':            'clothing',
  'Blazers & Jackets':  'clothing',
  'Jerseys & Hoodies':  'clothing',
  'Shoes':              'shoe',
  'Ties & Accessories': 'none',
  'Hats & Caps':        'none',
  'Socks':              'none',
  // School Sports Kit
  'Rugby':              'clothing',
  'Soccer':             'clothing',
  'Cricket':            'clothing',
  'Hockey':             'clothing',
  'Swimming':           'clothing',
  'Athletics':          'clothing',
  'Netball':            'clothing',
  'Tennis':             'clothing',
  // Shoes category
  'Black School Shoes': 'shoe',
  'PT / Takkies':       'shoe',
  'Rugby Boots':        'shoe',
  'Soccer Boots':       'shoe',
  'Cricket Shoes':      'shoe',
  'Hockey Shoes':       'shoe',
  'Running Shoes':      'shoe',
};

// POPIA child-data consent notice — single source of truth for the "Child Data Notice"
// shown before a parent can add a child profile (web + mobile render from this).
// RULE: bump POPIA_CHILD_CONSENT_VERSION any time the wording below changes. The API
// snapshots this exact text + version into popia_consents at the moment of consent, so
// past consents remain provable against the wording the user actually saw, even after
// this copy is edited later. Never edit the wording without bumping the version.
export const POPIA_CHILD_CONSENT_VERSION = 'v1' as const;

export const POPIA_CHILD_CONSENT_INTRO = 'Before adding a child profile, please confirm you agree to the following:';

export const POPIA_CHILD_CONSENT_POINTS = [
  'Only a nickname is stored — no real names.',
  'Size data is used only to generate personalised predictions for your family.',
  "Your child's data is never visible to other users.",
  'Anonymised, aggregated data may improve predictions for all families.',
] as const;

export const POPIA_CHILD_CONSENT_FOOTER = 'Required under the Protection of Personal Information Act (POPIA).';

// Flattened plain-text form stored verbatim in popia_consents.notice_text
export const POPIA_CHILD_CONSENT_NOTICE_TEXT =
  [POPIA_CHILD_CONSENT_INTRO, ...POPIA_CHILD_CONSENT_POINTS.map(p => `• ${p}`), POPIA_CHILD_CONSENT_FOOTER].join('\n');
