export interface Activity {
  id: string;
  time: string;
  text: string;
}

export interface Segment {
  id: string;
  groupLabel: string;
  transport: string;
  activities: Activity[];
}

export interface Day {
  id: string;
  dayNum: number;
  date: string;
  title: string;
  meals: { B: boolean; L: boolean; D: boolean };
  mealNote: string;
  segments: Segment[];
}

export interface Flight {
  id: string;
  group: string;
  leg: string;
  flightNo: string;
  dep: string;
  arr: string;
}

export type ItineraryType = 'NN' | 'ND';

export interface Itinerary {
  id: string;
  code?: string;
  type: ItineraryType;
  continent: string;
  country: string;
  seq: number;
  title: string;
  destination: string;
  days: number;
  nights: number;
  intro: string;
  flights: Flight[];
  schedule: Day[];
  includes: string[];
  excludes: string[];
  linkedQuoteId: string | null;
  linkedQuoteName: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ItineraryIndexEntry {
  id: string;
  code: string;
  title: string;
  destination: string;
  days: number;
  nights: number;
  linkedQuoteName: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy: string;
}
