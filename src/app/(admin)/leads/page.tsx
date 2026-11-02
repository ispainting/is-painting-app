"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Globe, PenLine, Phone } from "lucide-react";
import { toast } from "sonner";
import type { LeadSource, LeadStatus } from "@prisma/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/trpc/react";
import { BUSINESS_TIME_ZONE, STATUS_LABEL, type LeadPeriod } from "@/lib/leads/status";
import { formatCurrency } from "@/lib/utils";
import styles from "./leads.module.css";

type LeadRow = inferRouterOutputs<AppRouter>["leads"]["list"]["leads"][number];

const SOURCE_LABEL: Record<LeadSource, string> = { META: "Meta", GOOGLE_ADS: "Google", WEBSITE: "Site", MANUAL: "Manual" };
const PERIOD_LABEL: Record<LeadPeriod, string> = { today: "Hoje", "7d": "7 dias", "30d": "30 dias", "90d": "90 dias", all: "Tudo" };
const QUICK_STATUSES: LeadStatus[] = ["REAL", "NOT_REAL", "NO_ANSWER", "WON", "LOST"];
const PAGE_SIZE = 50;

const dateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// E.164 to how a person reads it. Numbers from other countries stay as they are.
function displayPhone(phone: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : phone;
}

function SourceBadge({ source }: { source: LeadSource }) {
  return (
    <span className={styles.source}>
      {source === "META" && <span className={styles.sourceMark} aria-hidden="true">f</span>}
      {source === "GOOGLE_ADS" && <span className={styles.sourceMark} aria-hidden="true">G</span>}
      {source === "WEBSITE" && <Globe className={styles.sourceIcon} aria-hidden="true" />}
      {source === "MANUAL" && <PenLine className={styles.sourceIcon} aria-hidden="true" />}
      {SOURCE_LABEL[source]}
    </span>
  );
}

function Counter({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={styles.counter}>
      <div className={styles.counterValue}>{value}</div>
      <div className={styles.counterLabel}>{label}</div>
      {hint && <div className={styles.counterHint}>{hint}</div>}
    </div>
  );
}

function LeadItem({ lead, onStatus, onWon, busy }: { lead: LeadRow; onStatus: (status: LeadStatus) => void; onWon: () => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const ad = lead.adName ?? lead.campaignName ?? lead.utmCampaign ?? (lead.adId ? `Anúncio ${lead.adId}` : lead.campaignId ? `Campanha ${lead.campaignId}` : null);
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.cell} data-label="Data">{dateFormat.format(lead.createdAt)}</div>
        <div className={styles.cellName}>
          <button type="button" className={styles.name} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {lead.fullName || "Sem nome"}
          </button>
          {lead.repeatCount > 0 && <span className={styles.flag}>Repetiu {lead.repeatCount}x</span>}
          {lead.outOfMap && <span className={styles.flagWarn}>Fora da área</span>}
        </div>
        <div className={styles.cell} data-label="Telefone">
          {lead.phone ? (
            <a className={styles.phone} href={`tel:${lead.phone}`}>
              <Phone className={styles.sourceIcon} aria-hidden="true" />
              {displayPhone(lead.phone)}
            </a>
          ) : (
            <span className={styles.muted}>Sem telefone válido</span>
          )}
        </div>
        <div className={styles.cell} data-label="Serviço">{lead.serviceType ?? <span className={styles.muted}>Não informado</span>}</div>
        <div className={styles.cell} data-label="Origem"><SourceBadge source={lead.source} /></div>
        <div className={styles.cell} data-label="Anúncio" title={lead.campaignName ?? undefined}>{ad ?? <span className={styles.muted}>Sem registro</span>}</div>
        <div className={styles.cell} data-label="Status">
          <span className={lead.status === "NEW" ? styles.statusNew : styles.status}>{STATUS_LABEL[lead.status]}</span>
          {lead.status === "WON" && lead.jobValue !== null && <span className={styles.value}> {formatCurrency(lead.jobValue)}</span>}
        </div>
      </div>

      <div className={styles.actions} role="group" aria-label={`Status de ${lead.fullName || "pedido sem nome"}`}>
        {QUICK_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={lead.status === status ? styles.actionActive : styles.action}
            aria-pressed={lead.status === status}
            disabled={busy}
            onClick={() => (status === "WON" ? onWon() : lead.status !== status && onStatus(status))}
          >
            {STATUS_LABEL[status]}
          </button>
        ))}
      </div>

      {open && (
        <div className={styles.card}>
          {lead.notes && <pre className={styles.cardText}>{lead.notes}</pre>}
          {lead.repeatCount > 0 && lead.lastRepeatAt && (
            <p className={styles.muted}>Pediu de novo {lead.repeatCount}x. Última vez em {dateFormat.format(lead.lastRepeatAt)}.</p>
          )}
          {lead.campaignName && <p className={styles.muted}>Campanha: {lead.campaignName}</p>}
          {lead.opportunity && <Link className={styles.link} href={`/customers/${lead.opportunity.customerId}`}>Abrir cliente no CRM</Link>}
        </div>
      )}
    </li>
  );
}

export default function LeadsPage() {
  const [source, setSource] = useState<LeadSource | "">("");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [period, setPeriod] = useState<LeadPeriod>("30d");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [wonLead, setWonLead] = useState<LeadRow | null>(null);
  const [wonValue, setWonValue] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // A new filter starts from the first page again.
  useEffect(() => setLimit(PAGE_SIZE), [source, status, period, search]);

  useEffect(() => {
    if (wonLead) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [wonLead]);

  const utils = api.useUtils();
  const list = api.leads.list.useQuery({ source: source || undefined, status: status || undefined, period, search: search || undefined, limit });
  const stats = api.leads.stats.useQuery({ source: source || undefined, period });
  const setLeadStatus = api.leads.setStatus.useMutation({
    onSuccess: () => {
      utils.leads.list.invalidate();
      utils.leads.stats.invalidate();
      toast.success("Status atualizado");
    },
    onError: () => toast.error("Não foi possível atualizar o status. Tente de novo."),
  });

  const leads = list.data?.leads ?? [];
  const pct = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${value}%`);
  const judgedHint = stats.data ? `de ${stats.data.judged} avaliados · ${PERIOD_LABEL[period].toLowerCase()}` : undefined;

  function confirmWon(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(wonValue);
    if (!wonLead || !(value > 0)) return;
    setLeadStatus.mutate({ id: wonLead.id, status: "WON", jobValue: value }, { onSuccess: () => setWonLead(null) });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Pedidos</h1>
        <p className={styles.subtitle}>Todo pedido de anúncio e do site, com a origem.</p>
      </header>

      <section className={styles.counters} aria-label="Contadores">
        <Counter label="Pedidos hoje" value={stats.data ? String(stats.data.today) : "—"} />
        <Counter label="Esta semana" value={stats.data ? String(stats.data.week) : "—"} />
        <Counter label="% reais" value={pct(stats.data?.realPct)} hint={judgedHint} />
        <Counter label="% não atendeu" value={pct(stats.data?.noAnswerPct)} hint={judgedHint} />
      </section>

      <section className={styles.filters} aria-label="Filtros">
        <label className={styles.field}>
          <span>Buscar</span>
          <input type="search" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Nome ou telefone" enterKeyHint="search" />
        </label>
        <label className={styles.field}>
          <span>Origem</span>
          <select value={source} onChange={(e) => setSource(e.target.value as LeadSource | "")}>
            <option value="">Todas</option>
            {(Object.keys(SOURCE_LABEL) as LeadSource[]).map((key) => (
              <option key={key} value={key}>{SOURCE_LABEL[key]}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as LeadStatus | "")}>
            <option value="">Todos</option>
            {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((key) => (
              <option key={key} value={key}>{STATUS_LABEL[key]}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Período</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as LeadPeriod)}>
            {(Object.keys(PERIOD_LABEL) as LeadPeriod[]).map((key) => (
              <option key={key} value={key}>{PERIOD_LABEL[key]}</option>
            ))}
          </select>
        </label>
      </section>

      {list.isLoading ? (
        <p className={styles.empty}>Carregando…</p>
      ) : list.isError ? (
        <p className={styles.empty}>Não foi possível carregar os pedidos. Atualize a página.</p>
      ) : leads.length === 0 ? (
        <p className={styles.empty}>Nenhum pedido com esses filtros.</p>
      ) : (
        <>
          <div className={styles.listHead} aria-hidden="true">
            <span>Data</span>
            <span>Nome</span>
            <span>Telefone</span>
            <span>Serviço</span>
            <span>Origem</span>
            <span>Anúncio</span>
            <span>Status</span>
          </div>
          <ul className={styles.list}>
            {leads.map((lead) => (
              <LeadItem
                key={lead.id}
                lead={lead}
                busy={setLeadStatus.isPending}
                onStatus={(next) => setLeadStatus.mutate({ id: lead.id, status: next })}
                onWon={() => {
                  setWonValue(lead.jobValue === null ? "" : String(lead.jobValue));
                  setWonLead(lead);
                }}
              />
            ))}
          </ul>
          {list.data?.hasMore && (
            <button type="button" className={styles.more} onClick={() => setLimit((n) => Math.min(n + PAGE_SIZE, 500))} disabled={limit >= 500}>
              Carregar mais
            </button>
          )}
        </>
      )}

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="won-title" onClose={() => setWonLead(null)}>
        <form onSubmit={confirmWon}>
          <h2 id="won-title" className={styles.dialogTitle}>Virou cliente</h2>
          <p className={styles.muted}>{wonLead?.fullName || "Pedido sem nome"}</p>
          <label className={styles.field}>
            <span>Valor da obra (US$)</span>
            <input type="number" inputMode="decimal" min="0.01" step="0.01" required autoFocus value={wonValue} onChange={(e) => setWonValue(e.target.value)} />
          </label>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.action} onClick={() => setWonLead(null)}>Cancelar</button>
            <button type="submit" className={styles.actionActive} disabled={setLeadStatus.isPending}>Salvar</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
