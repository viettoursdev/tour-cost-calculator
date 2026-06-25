/**
 * Cầu nối kiểu dữ liệu giữa hồ sơ visa (`VisaApplicant`) và khách đoàn báo giá
 * (`Passenger`). Cho phép màn Visa dùng chung component bảng khách của báo giá,
 * và đồng bộ khách qua lại giữa hai nơi mà không mất dữ liệu (round-trip).
 */
import type { Passenger, VisaApplicant } from '@/types';

const GENDER_TO_PAX: Record<string, Passenger['gender']> = { Nam: 'M', 'Nữ': 'F', 'Khác': '', '': '' };
const GENDER_TO_VISA: Record<string, VisaApplicant['gender']> = { M: 'Nam', F: 'Nữ', '': '' };

/** VisaApplicant → Passenger (để hiển thị/sửa bằng bảng khách dùng chung). */
export function applicantToPassenger(a: VisaApplicant): Passenger {
  return {
    id: a.id,
    name: a.name,
    nameNoAccent: a.nameNoAccent,
    gender: GENDER_TO_PAX[a.gender ?? ''] ?? '',
    dob: a.dob,
    idType: a.passport ? 'passport' : '',
    idNo: a.passport,
    passportIssue: a.passportIssue,
    passportExpiry: a.passportExpiry,
    countriesVisited: a.countriesVisited,
    docStatus: a.docStatus,
    result: a.result,
    visaStatus: a.visaStatus,
    visaTimeline: a.timeline,
    failReason: a.failReason,
    docs: a.docs,
    passportHistory: a.passportHistory,
    note: a.note,
    company: a.company,
    phone: a.phone,
    departurePoint: a.departurePoint,
    otherFlight: a.otherFlight,
    roomType: a.roomType ?? '',
    roomNo: a.roomNo,
  };
}

/** Passenger → VisaApplicant (lưu về dự án visa). Giữ giá trị mặc định hợp lệ
 *  cho `docStatus`/`result` (bắt buộc trên VisaApplicant). */
export function passengerToApplicant(p: Passenger): VisaApplicant {
  return {
    id: p.id,
    name: p.name,
    nameNoAccent: p.nameNoAccent ?? '',
    gender: GENDER_TO_VISA[p.gender ?? ''] ?? '',
    dob: p.dob,
    passport: p.idNo,
    passportIssue: p.passportIssue,
    passportExpiry: p.passportExpiry,
    countriesVisited: p.countriesVisited,
    docStatus: p.docStatus ?? 'missing',
    result: p.result ?? 'pending',
    visaStatus: p.visaStatus,
    timeline: p.visaTimeline,
    failReason: p.failReason,
    docs: p.docs,
    passportHistory: p.passportHistory,
    note: p.note,
    company: p.company,
    phone: p.phone,
    departurePoint: p.departurePoint,
    otherFlight: p.otherFlight,
    roomType: p.roomType ?? '',
    roomNo: p.roomNo,
  };
}

export const applicantsToPassengers = (list: VisaApplicant[]): Passenger[] => list.map(applicantToPassenger);
export const passengersToApplicants = (list: Passenger[]): VisaApplicant[] => list.map(passengerToApplicant);
