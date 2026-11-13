import { Resend } from "resend";
import type { LeadSource } from "@prisma/client";
import { SERVICE_AREA, readable } from "@/lib/orion-lead-card";
import type { LeadIntake } from "./normalize";

// The owner's email about a new lead. A problem with the email never costs the lead, which is
// already saved, and nothing about the customer goes to the logs.
const OWNER_EMAIL = "contact.ispainting@gmail.com";
const BLANK = "Não preenchido";

const SOURCE_LABEL: Record<LeadSource, string> = {
  META: "Meta (Facebook/Instagram)",
  GOOGLE_ADS: "Google Ads",
  WEBSITE: "site",
  MANUAL: "cadastro manual",
};

export function buildLeadEmail(lead: LeadIntake, serviceType: string | null, leadsUrl: string): { subject: string; text: string } {
  const { [SERVICE_AREA]: serviceArea, ...answers } = lead.details ?? {};
  const row = (label: string, value: string | null | undefined) => `${label}: ${value?.trim() || BLANK}`;
  const ad = lead.origin.adName ?? lead.origin.campaignName ?? lead.origin.utmCampaign ?? lead.origin.adId ?? lead.origin.campaignId;
  const headline = [lead.name || "Sem nome", serviceType].filter(Boolean).join(" · ").replace(/\s+/g, " ");
  return {
    subject: `I.S Painting: ${serviceArea ? "fora da área, " : ""}novo pedido — ${headline}`,
    text: [
      `Novo pedido pelo ${SOURCE_LABEL[lead.source]}.`,
      ...(serviceArea ? ["Fora da área de atendimento: não conta como lead."] : []),
      "",
      row("Cidade", lead.city),
      row("Serviço", serviceType),
      row("Nome", lead.name),
      row("Telefone", lead.phone),
      row("E-mail", lead.email),
      row("CEP", lead.zipCode),
      row("Anúncio", ad),
      ...(lead.origin.campaignName && lead.origin.campaignName !== ad ? [row("Campanha", lead.origin.campaignName)] : []),
      ...(lead.address ? [row("Endereço", lead.address)] : []),
      ...(lead.message ? [row("Mensagem", lead.message)] : []),
      ...Object.entries(answers).map(([label, value]) => row(readable(label), value)),
      "",
      `Abrir os pedidos: ${leadsUrl}`,
    ].join("\n"),
  };
}

export async function notifyNewLead(lead: LeadIntake, serviceType: string | null): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[leads/notify] RESEND_API_KEY not set — skipping the new lead email");
    return;
  }
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || "https://is-painting-app.vercel.app";
    const from = process.env.RESEND_FROM_EMAIL || "I.S Painting Manager <onboarding@resend.dev>";
    // Resend reports a refused email in the result; it doesn't throw.
    const { error } = await new Resend(key).emails.send({ from, to: OWNER_EMAIL, ...buildLeadEmail(lead, serviceType, `${base}/leads`) });
    if (error) console.error("[leads/notify] Resend refused the email", error.name);
  } catch (err) {
    console.error("[leads/notify] email failed", err instanceof Error ? err.name : "unknown");
  }
}
