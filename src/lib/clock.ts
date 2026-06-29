export const WORK_TYPE_OPTIONS = [
  { value: "job_site", label: "Job Site" },
  { value: "shop", label: "Shop" },
  { value: "office", label: "Office" },
  { value: "travel", label: "Travel" },
  { value: "meeting", label: "Meeting" },
  { value: "training", label: "Training" },
  { value: "other", label: "Other" },
] as const;

export type WorkTypeValue = (typeof WORK_TYPE_OPTIONS)[number]["value"];

export function formatClockDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((safeSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

export function getWorkTypeLabel(workType: string | null | undefined) {
  return WORK_TYPE_OPTIONS.find((option) => option.value === workType)?.label ?? "Other";
}
