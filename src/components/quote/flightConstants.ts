import type { FlightFare, FlightSegment, LegacyQuoteFlight, QuoteFlight } from '@/types';

/** Tiền tố số hiệu (IATA airline code) → tên hãng. Mở rộng dần khi gặp mã mới. */
export const AIRLINE_BY_CODE: Record<string, string> = {
  VN: 'Vietnam Airlines', VJ: 'Vietjet Air', QH: 'Bamboo Airways', BL: 'Pacific Airlines',
  CX: 'Cathay Pacific', SQ: 'Singapore Airlines', KE: 'Korean Air', OZ: 'Asiana Airlines',
  JL: 'Japan Airlines', NH: 'ANA', QR: 'Qatar Airways', EK: 'Emirates', EY: 'Etihad Airways',
  TG: 'Thai Airways', TR: 'Scoot', '3K': 'Jetstar Asia', AK: 'AirAsia', FD: 'Thai AirAsia',
  CI: 'China Airlines', BR: 'EVA Air', MH: 'Malaysia Airlines', PR: 'Philippine Airlines',
  GA: 'Garuda Indonesia', CZ: 'China Southern', MU: 'China Eastern', CA: 'Air China',
  HX: 'Hong Kong Airlines', TK: 'Turkish Airlines', AF: 'Air France', LH: 'Lufthansa',
  BA: 'British Airways', AA: 'American Airlines', UA: 'United Airlines', DL: 'Delta Air Lines',
  QF: 'Qantas', NZ: 'Air New Zealand', SU: 'Aeroflot', D7: 'AirAsia X',
};

/** Mã sân bay IATA → thành phố. Mở rộng dần. */
export const AIRPORT_BY_CODE: Record<string, string> = {
  HAN: 'Hanoi', SGN: 'Ho Chi Minh City', DAD: 'Da Nang', CXR: 'Nha Trang (Cam Ranh)',
  PQC: 'Phu Quoc', HPH: 'Hai Phong', HUI: 'Hue', VII: 'Vinh', VCA: 'Can Tho', DLI: 'Da Lat',
  UIH: 'Quy Nhon', VDO: 'Van Don', BMV: 'Buon Ma Thuot', THD: 'Thanh Hoa', VCS: 'Con Dao',
  TBB: 'Tuy Hoa', VKG: 'Rach Gia', CAH: 'Ca Mau',
  BKK: 'Bangkok', DMK: 'Bangkok (Don Mueang)', SIN: 'Singapore', KUL: 'Kuala Lumpur',
  HKG: 'Hong Kong', MFM: 'Macau', ICN: 'Seoul (Incheon)', GMP: 'Seoul (Gimpo)',
  NRT: 'Tokyo (Narita)', HND: 'Tokyo (Haneda)', KIX: 'Osaka', NGO: 'Nagoya', FUK: 'Fukuoka',
  CTS: 'Sapporo', OKA: 'Okinawa', TPE: 'Taipei', KHH: 'Kaohsiung',
  PVG: 'Shanghai (Pudong)', PEK: 'Beijing', PKX: 'Beijing (Daxing)', CAN: 'Guangzhou',
  CTU: 'Chengdu', KMG: 'Kunming', NNG: 'Nanning', SZX: 'Shenzhen',
  DOH: 'Doha', DXB: 'Dubai', AUH: 'Abu Dhabi', IST: 'Istanbul',
  CDG: 'Paris', LHR: 'London', LGW: 'London (Gatwick)', FRA: 'Frankfurt', MUC: 'Munich',
  AMS: 'Amsterdam', FCO: 'Rome', MXP: 'Milan (Malpensa)', LIN: 'Milan (Linate)',
  VCE: 'Venice', NAP: 'Naples', BCN: 'Barcelona', MAD: 'Madrid', ZRH: 'Zurich',
  GVA: 'Geneva', VIE: 'Vienna', BRU: 'Brussels', CPH: 'Copenhagen', ARN: 'Stockholm',
  OSL: 'Oslo', HEL: 'Helsinki', PRG: 'Prague', BUD: 'Budapest', WAW: 'Warsaw',
  ATH: 'Athens', LIS: 'Lisbon', DUB: 'Dublin', MAN: 'Manchester',
  SYD: 'Sydney', MEL: 'Melbourne', BNE: 'Brisbane', PER: 'Perth', AKL: 'Auckland',
  LAX: 'Los Angeles', SFO: 'San Francisco', JFK: 'New York', EWR: 'Newark', SEA: 'Seattle',
  ORD: 'Chicago', IAH: 'Houston', BOS: 'Boston', IAD: 'Washington D.C.', YVR: 'Vancouver',
  YYZ: 'Toronto',
  MNL: 'Manila', CEB: 'Cebu', CGK: 'Jakarta', DPS: 'Bali (Denpasar)', SUB: 'Surabaya',
  RGN: 'Yangon', PNH: 'Phnom Penh', REP: 'Siem Reap', VTE: 'Vientiane', LPQ: 'Luang Prabang',
  DEL: 'Delhi', BOM: 'Mumbai', MAA: 'Chennai', BLR: 'Bangalore', CMB: 'Colombo',
  DAC: 'Dhaka', KTM: 'Kathmandu',
};

/** Tách tiền tố hãng (2 ký tự đầu) từ số hiệu chuyến bay. */
export function deriveAirline(flightNo: string): { code: string; name: string } {
  const m = /^([A-Z0-9]{2})/.exec((flightNo || '').trim().toUpperCase());
  const code = m?.[1] ?? '';
  return { code, name: AIRLINE_BY_CODE[code] ?? '' };
}

/** Suy tên thành phố từ mã IATA sân bay. */
export function deriveAirport(code: string): string {
  return AIRPORT_BY_CODE[(code || '').trim().toUpperCase()] ?? '';
}

let seq = 0;
const uid = (p: string) => p + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 4);

export const newFare = (over: Partial<FlightFare> = {}): FlightFare =>
  ({ id: uid('ff'), label: 'Phổ thông', amount: 0, cur: 'VND', ...over });

/** Tổng giá 1 hạng = Fare + Thuế/phí. */
export const fareTotal = (fr: FlightFare): number => (fr.amount || 0) + (fr.tax || 0);

/** Một chặng trống — suy hãng/thành phố khi hiển thị, không cần lưu sẵn. */
export const newSegment = (over: Partial<FlightSegment> = {}): FlightSegment =>
  ({ date: '', flightNo: '', depAirport: '', arrAirport: '', depTime: '', arrTime: '', ...over });

/** Một booking mới = 1 chặng trống + 1 hạng giá. */
export const newFlight = (over: Partial<QuoteFlight> = {}): QuoteFlight =>
  ({ id: uid('fl'), segments: [newSegment()], fares: [newFare()], ...over });

/** Suy hãng + thành phố cho 1 chặng (không ghi đè giá trị đã có). */
export const enrichSegment = (s: FlightSegment): FlightSegment => {
  const air = deriveAirline(s.flightNo);
  return {
    ...s,
    airlineCode: s.airlineCode ?? (air.code || undefined),
    airlineName: s.airlineName ?? (air.name || undefined),
    depCity: s.depCity ?? (deriveAirport(s.depAirport) || undefined),
    arrCity: s.arrCity ?? (deriveAirport(s.arrAirport) || undefined),
  };
};

/** Chuẩn hoá 1 booking về dạng có `segments`. Hỗ trợ dữ liệu CŨ:
 *  phẳng (1 chặng) + chiều về `ret*` (khứ hồi) → mảng chặng. */
export function migrateFlight(raw: QuoteFlight | LegacyQuoteFlight): QuoteFlight {
  const r = raw as LegacyQuoteFlight;
  const id = r.id || uid('fl');
  const fares = r.fares && r.fares.length ? r.fares : [newFare()];
  if (Array.isArray(r.segments) && r.segments.length) {
    return { id, segments: r.segments, fares, note: r.note };
  }
  const segs: FlightSegment[] = [];
  if (r.flightNo || r.depAirport || r.arrAirport) {
    segs.push(newSegment({
      date: r.date ?? '', flightNo: r.flightNo ?? '', depAirport: r.depAirport ?? '', arrAirport: r.arrAirport ?? '',
      depTime: r.depTime ?? '', arrTime: r.arrTime ?? '', depDayOffset: r.depDayOffset, arrDayOffset: r.arrDayOffset,
      airlineCode: r.airlineCode, airlineName: r.airlineName, depCity: r.depCity, arrCity: r.arrCity,
    }));
  }
  if (r.retFlightNo || r.retDepAirport || r.retArrAirport) {
    segs.push(newSegment({
      date: r.retDate ?? '', flightNo: r.retFlightNo ?? '', depAirport: r.retDepAirport ?? '', arrAirport: r.retArrAirport ?? '',
      depTime: r.retDepTime ?? '', arrTime: r.retArrTime ?? '', depDayOffset: r.retDepDayOffset, arrDayOffset: r.retArrDayOffset,
    }));
  }
  return { id, segments: segs.length ? segs : [newSegment()], fares, note: r.note };
}
