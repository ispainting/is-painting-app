import { normalizeLeadSourceForReport } from "./lead-source";
import { isTerminalStage } from "./pipeline-sync";
import { opportunityDateInput, opportunityLeadDate } from "./opportunity-values";

export type OpportunityVisibility = "active" | "archived" | "all";

export const OPPORTUNITY_BOARD_GROUPS = [
  { id: "leads", label: "Leads", stages: ["new_lead", "onboarding", "not_answered", "follow_up"] },
  { id: "sales", label: "Sales", stages: ["estimate_sent", "approval", "on_hold"] },
  { id: "production", label: "Production", stages: ["service_delivery", "review"] },
  { id: "closed", label: "Closed", stages: ["completed", "lost", "not_qualified", "invalid_duplicate", "spam_fraud", "no_reply"] },
] as const;

export type OpportunityBoardRecord = {
  name: string;
  stage: string;
  status: string;
  source?: string | null;
  serviceType?: string | null;
  notes?: string | null;
  archivedAt?: Date | string | null;
  followUpAt?: Date | string | null;
  leadReceivedAt?: Date | string | null;
  createdAt: Date | string;
  customer: { name: string; leadSource?: string | null; source?: string | null };
};

export type OpportunityBoardFilters = {
  visibility: OpportunityVisibility;
  search: string;
  source: string;
  service: string;
  stage: string;
  from: string;
  to: string;
  followUp: string;
  today: string;
};

export function filterOpportunityRecords<T extends OpportunityBoardRecord>(
  records: T[],
  filters: OpportunityBoardFilters
): T[] {
  return records.filter((opportunity) => {
    const leadDate = opportunityDateInput(opportunityLeadDate(opportunity));
    const due = opportunityDateInput(opportunity.followUpAt);
    const visible = filters.visibility === "all" ||
      (filters.visibility === "active" ? !opportunity.archivedAt : !!opportunity.archivedAt);
    return visible &&
      (!filters.search || `${opportunity.name} ${opportunity.customer.name} ${opportunity.notes ?? ""}`.toLowerCase().includes(filters.search.toLowerCase())) &&
      (!filters.source || normalizeLeadSourceForReport(opportunity.source ?? opportunity.customer.leadSource ?? opportunity.customer.source) === filters.source) &&
      (!filters.service || opportunity.serviceType === filters.service) &&
      (!filters.stage || opportunity.stage === filters.stage) &&
      (!filters.from || leadDate >= filters.from) &&
      (!filters.to || leadDate <= filters.to) &&
      (!filters.followUp || (
        !isTerminalStage(opportunity.stage) &&
        opportunity.status === "open" &&
        !!due &&
        (filters.followUp === "overdue" ? due < filters.today : due <= filters.today)
      ));
  });
}

export function filterOpportunityViews<T extends OpportunityBoardRecord>(
  records: T[],
  filters: OpportunityBoardFilters
): { kanban: T[]; table: T[] } {
  const filtered = filterOpportunityRecords(records, filters);
  return { kanban: filtered, table: filtered };
}

type InvalidatableQuery = { invalidate: () => Promise<unknown> };

export async function refreshOpportunityQueries(
  queries: Record<string, InvalidatableQuery>
): Promise<void> {
  await Promise.all(Object.values(queries).map((query) => query.invalidate()));
}
