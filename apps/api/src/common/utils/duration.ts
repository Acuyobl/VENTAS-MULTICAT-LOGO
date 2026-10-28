const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function durationToMs(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(value.trim());
  if (!match) throw new Error(`invalid_duration:${value}`);
  const amount = Number(match[1]);
  const unit = UNIT_MS[match[2] ?? 's'];
  if (!unit) throw new Error(`invalid_duration_unit:${value}`);
  return amount * unit;
}

export function addDuration(base: Date, value: string): Date {
  return new Date(base.getTime() + durationToMs(value));
}
