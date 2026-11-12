// packages/shared/types/location.ts

/**
 * South African Location Hierarchy
 * Province → City → Suburb → School
 * 
 * Data sources:
 * - Provinces: Static (9 provinces)
 * - Cities/Suburbs: Stats SA or simplemaps.com data
 * - Schools: DBE EMIS Master List (https://www.education.gov.za/Programmes/EMIS/EMISDownloads.aspx)
 */

// ============================================
// PROVINCES (Static - 9 SA Provinces)
// ============================================

export const PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
] as const;

export type Province = typeof PROVINCES[number];

export const PROVINCE_CODES: Record<Province, string> = {
  'Eastern Cape': 'EC',
  'Free State': 'FS',
  'Gauteng': 'GP',
  'KwaZulu-Natal': 'KZN',
  'Limpopo': 'LP',
  'Mpumalanga': 'MP',
  'Northern Cape': 'NC',
  'North West': 'NW',
  'Western Cape': 'WC',
};

// ============================================
// CITY
// ============================================

export interface City {
  id: string;
  name: string;
  provinceCode: Province;
  // Optional metadata
  latitude?: number;
  longitude?: number;
  population?: number;
}

// ============================================
// SUBURB
// ============================================

export interface Suburb {
  id: string;
  name: string;
  cityId: string;
  // Denormalized for faster queries (avoid joins)
  cityName: string;
  provinceCode: Province;
  // Optional metadata
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

// ============================================
// SCHOOL
// ============================================

export type SchoolType = 
  | 'PRIMARY'        // Grades R-7
  | 'SECONDARY'      // Grades 8-12
  | 'COMBINED'       // Grades R-12
  | 'INTERMEDIATE'   // Grades 4-7
  | 'ECD'            // Early Childhood Development
  | 'SPECIAL_NEEDS'  // Special needs education
  | 'COLLEGE'        // TVET College
  | 'UNIVERSITY';    // University

export type SchoolSector = 'PUBLIC' | 'INDEPENDENT';

export interface School {
  id: string;
  emisNumber: string;          // Official DBE EMIS number (unique identifier)
  name: string;
  type: SchoolType;
  sector: SchoolSector;
  
  // Location hierarchy
  suburbId: string;
  // Denormalized for faster queries
  suburbName: string;
  cityId: string;
  cityName: string;
  provinceCode: Province;
  
  // Address details
  streetAddress?: string;
  postalCode?: string;
  
  // Coordinates for distance calculations
  latitude?: number;
  longitude?: number;
  
  // DBE metadata
  quintile?: 1 | 2 | 3 | 4 | 5;  // Socioeconomic quintile (1=poorest, 5=wealthiest)
  noFeeSchool?: boolean;
  
  // Admin
  isVerified: boolean;         // Admin-verified school
  isActive: boolean;           // Currently operating
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// USER LOCATION (Required for all users)
// ============================================

export interface UserLocation {
  // Location hierarchy (ALL REQUIRED)
  provinceCode: Province;
  cityId: string;
  cityName: string;           // Denormalized
  suburbId: string;
  suburbName: string;         // Denormalized
  
  // Full address for shipping
  streetAddress: string;
  postalCode: string;
  
  // Coordinates for distance calculations
  latitude?: number;
  longitude?: number;
}

export interface UserSchool {
  schoolId: string;
  schoolName: string;         // Denormalized
  emisNumber: string;         // Official EMIS number
  schoolType: SchoolType;
  graduationYear?: number;    // Expected/actual graduation year
  isCurrentStudent: boolean;  // Currently attending vs alumni
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface LocationDropdownOption {
  id: string;
  name: string;
  // Additional display info
  subtitle?: string;          // e.g., province name for cities
}

export interface SchoolSearchResult extends LocationDropdownOption {
  emisNumber: string;
  type: SchoolType;
  sector: SchoolSector;
  // Full location path for display
  locationPath: string;       // e.g., "Sandton, Gauteng"
}

// ============================================
// LISTING FILTERS
// ============================================

export type LocationFilterMode = 
  | 'MY_SCHOOL'     // Only items from user's school
  | 'MY_SUBURB'     // Items from any school in user's suburb
  | 'MY_CITY'       // Items from any school in user's city
  | 'MY_PROVINCE'   // Items from any school in user's province
  | 'NEARBY'        // Within radius (requires coordinates)
  | 'ANYWHERE';     // No location filter

export interface LocationFilter {
  mode: LocationFilterMode;
  
  // For specific filtering (overrides mode)
  provinceCode?: Province;
  cityId?: string;
  suburbId?: string;
  schoolId?: string;
  
  // For NEARBY mode
  nearbyRadiusKm?: number;    // Default: 25km
  latitude?: number;
  longitude?: number;
}

// ============================================
// VALIDATION HELPERS
// ============================================

export function isValidProvince(value: string): value is Province {
  return PROVINCES.includes(value as Province);
}

export function getProvinceCode(province: Province): string {
  return PROVINCE_CODES[province];
}

export function getProvinceFromCode(code: string): Province | undefined {
  const entry = Object.entries(PROVINCE_CODES).find(([, c]) => c === code);
  return entry ? entry[0] as Province : undefined;
}
