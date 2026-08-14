import { NextResponse } from "next/server";

export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export function jsonResponse(
  data: unknown,
  status = 200,
  headers?: Record<string, string>
) {
  return NextResponse.json(data, { status, headers });
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

export function isValidRallyTime(value: string): boolean {
  const date = new Date(value);
  if (isNaN(date.getTime())) return false;
  return value.includes("T") && (value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value));
}

export function parseRallyTime(value: string): Date | null {
  if (!isValidRallyTime(value)) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date;
}
