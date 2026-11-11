export function getLeadBusinessDate(opportunity: { leadReceivedAt?: Date | string | null; createdAt: Date | string }): Date {
  const value = opportunity.leadReceivedAt ?? opportunity.createdAt;
  return value instanceof Date ? value : new Date(value);
}
