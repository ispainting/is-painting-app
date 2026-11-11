export function jobCanonicalTotal(job: { contractAmount: unknown; totalEstimate: unknown }): number {
  const contract = Number(job.contractAmount);
  const estimate = Number(job.totalEstimate);
  return contract > 0 ? contract : estimate;
}
