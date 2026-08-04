/**
 * AR / AP aging buckets
 */

import type { AgingBucket } from "./types";

export interface OpenBalance {
  id: string;
  partyName: string;
  dueDate: string;
  balance: number;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

export function buildAging(
  items: OpenBalance[],
  asOf: string = new Date().toISOString().slice(0, 10)
): AgingBucket & { rows: (OpenBalance & { bucket: string; daysPastDue: number })[] } {
  const bucket: AgingBucket = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
    total: 0,
  };
  const rows: (OpenBalance & { bucket: string; daysPastDue: number })[] = [];

  for (const item of items) {
    const days = daysBetween(item.dueDate, asOf);
    let key: keyof AgingBucket = "current";
    let label = "current";
    if (days <= 0) {
      key = "current";
      label = "current";
    } else if (days <= 30) {
      key = "days1to30";
      label = "1-30";
    } else if (days <= 60) {
      key = "days31to60";
      label = "31-60";
    } else if (days <= 90) {
      key = "days61to90";
      label = "61-90";
    } else {
      key = "over90";
      label = "90+";
    }
    bucket[key] += item.balance;
    bucket.total += item.balance;
    rows.push({ ...item, bucket: label, daysPastDue: Math.max(0, days) });
  }

  for (const k of Object.keys(bucket) as (keyof AgingBucket)[]) {
    bucket[k] = Math.round(bucket[k] * 100) / 100;
  }

  return { ...bucket, rows };
}
