export type TimeListState = "loading" | "error" | "empty" | "populated";

export function getTimeListState({
  isLoading,
  isError,
  rowCount,
}: {
  isLoading: boolean;
  isError: boolean;
  rowCount: number;
}): TimeListState {
  if (isLoading) return "loading";
  if (isError) return "error";
  return rowCount === 0 ? "empty" : "populated";
}