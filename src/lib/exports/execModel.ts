/**
 * Chuẩn hoá dữ liệu cho file Itinerary Execution: gộp Chương trình tour
 * (`Itinerary`) + Thực đơn đã link (`Menu`) + contact Nhà hàng (`Restaurant`)
 * + khối vận hành (`Itinerary.exec`). Dùng chung cho cả PDF và Word.
 */
import { flightDepStr, flightArrStr } from '@/components/itinerary/flightFields';
import type {
  ExecChecklistItem, ExecContact, ExecGuest, Itinerary, Menu, Restaurant,
} from '@/types';

export interface ExecFlightVM {
  group: string;
  leg: string;
  flightNo: string;
  dep: string;   // "TSN 05:40"
  arr: string;   // "PEK 11:35" (+offset nếu qua đêm)
}

export interface ExecMealVM {
  mealType: string;
  restaurant: string;
  /** Địa chỉ · SĐT nhà hàng — gộp 1 dòng để in. */
  address?: string;
  dishes: string;
  contact?: string;
  note?: string;
}
export interface ExecDayVM {
  dayNum: number;
  date: string;
  title: string;
  meals: { B: boolean; L: boolean; D: boolean };
  mealNote: string;
  segments: { groupLabel: string; transport: string; activities: { time: string; text: string; ops?: string }[] }[];
  menuMeals: ExecMealVM[];
  hotelName?: string;
  hotelContact?: string;
  venues: ExecContact[];
  notes?: string;
  checklist: ExecChecklistItem[];
}
export interface ExecModel {
  title: string;
  code: string;
  destination: string;
  days: number;
  nights: number;
  departure: string;
  sos: { hotline?: string; operator?: string; insurance?: string; embassy?: string; medical?: string };
  guides: ExecContact[];
  drivers: ExecContact[];
  suppliers: ExecContact[];
  guests: ExecGuest[];
  guestNotes?: string;
  includes: string[];
  excludes: string[];
  generalNotes?: string;
  flights: ExecFlightVM[];
  dayVMs: ExecDayVM[];
}

export function buildExecModel(
  it: Itinerary,
  menu: Menu | null | undefined,
  restaurants: Restaurant[],
): ExecModel {
  const restById = new Map(restaurants.map((r) => [r.id, r]));
  const e = it.exec ?? {};
  const menuByDay = new Map((menu?.schedule ?? []).map((d) => [d.dayNum, d]));
  const opsByDay = new Map((e.dayOps ?? []).map((d) => [d.dayNum, d]));

  const dayVMs: ExecDayVM[] = (it.schedule ?? []).map((d) => {
    const md = menuByDay.get(d.dayNum);
    const ops = opsByDay.get(d.dayNum);
    const menuMeals: ExecMealVM[] = (md?.meals ?? []).map((m) => {
      const rest = m.restaurantId ? restById.get(m.restaurantId) : undefined;
      const addrBits = [rest?.address, rest?.contact].filter(Boolean).join('  ·  ');
      return {
        mealType: m.mealType,
        restaurant: m.restaurantName || rest?.name || '',
        address: addrBits || undefined,
        dishes: m.adjustedDishes || m.suggestedDishes || '',
        contact: rest?.website || undefined,
        note: [m.note, rest?.note].filter(Boolean).join(' · ') || undefined,
      };
    });
    return {
      dayNum: d.dayNum,
      date: d.date,
      title: d.title,
      meals: d.meals,
      mealNote: d.mealNote,
      segments: (d.segments ?? []).map((s) => ({
        groupLabel: s.groupLabel,
        transport: s.transport,
        activities: (s.activities ?? []).map((a) => ({ time: a.time, text: a.text, ops: a.ops })),
      })),
      menuMeals,
      hotelName: ops?.hotelName,
      hotelContact: ops?.hotelContact,
      venues: ops?.venues ?? [],
      notes: ops?.notes,
      checklist: ops?.checklist ?? [],
    };
  });

  return {
    title: it.title || 'Chương trình tour',
    code: it.code ?? '',
    destination: it.destination ?? '',
    days: it.days ?? it.schedule?.length ?? 0,
    nights: it.nights ?? 0,
    departure: it.schedule?.[0]?.date ?? '',
    sos: {
      hotline: e.sosHotline, operator: e.sosOperator, insurance: e.sosInsurance,
      embassy: e.sosEmbassy, medical: e.sosMedical,
    },
    guides: e.guides ?? [],
    drivers: e.drivers ?? [],
    suppliers: e.suppliers ?? [],
    guests: e.guests ?? [],
    guestNotes: e.guestNotes,
    includes: it.includes ?? [],
    excludes: it.excludes ?? [],
    generalNotes: e.generalNotes,
    flights: (it.flights ?? [])
      .map((f) => ({
        group: f.group?.trim() ?? '',
        leg: f.leg ?? '',
        flightNo: f.flightNo ?? '',
        dep: flightDepStr(f),
        arr: flightArrStr(f),
      }))
      .filter((f) => f.flightNo || f.dep || f.arr),
    dayVMs,
  };
}

/** Nhãn bữa ăn theo cờ B/L/D. */
export function mealsLabel(m: { B: boolean; L: boolean; D: boolean }): string {
  const parts: string[] = [];
  if (m.B) parts.push('Sáng');
  if (m.L) parts.push('Trưa');
  if (m.D) parts.push('Tối');
  return parts.length ? parts.join(' · ') : '—';
}
