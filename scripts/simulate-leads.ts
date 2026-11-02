// Simulates one lead from each origin against a LOCAL copy of the app, so the Pedidos screen can be
// checked without a real lead, with fictional data only. It refuses any address that isn't local.
//
// 1. Start the app with the same secrets as this script, plus the stand-in for Meta's Graph API:
//      META_GRAPH_BASE_URL=http://localhost:4599 META_PAGE_ACCESS_TOKEN=local npm run dev
// 2. In another terminal:
//      npx tsx --env-file=.env.local scripts/simulate-leads.ts
//
// Needs META_APP_SECRET, GOOGLE_LEADS_WEBHOOK_KEY and WEBSITE_LEADS_SECRET. APP_URL picks the address
// (default http://localhost:3000). Each run sends new leads, then a retry and a repeat of the first.
import { createHmac, randomInt } from "node:crypto";
import { createServer } from "node:http";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const GRAPH_PORT = 4599;
const PAGE_ID = "205413115997902";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const { hostname } = new URL(APP_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) throw new Error(`Refusing to send fake leads to ${hostname}: this script is for a local copy only.`);

const run = Date.now();
// 555-01XX is reserved for fiction. A new pair each run, so an earlier run isn't a "repeat".
const fictionalPhone = () => `+1508555${String(100 + randomInt(100)).padStart(4, "0")}`;
const metaId = String(run);
const metaPhone = fictionalPhone();

// Answers what the webhook asks the Graph API, the way Meta would.
const graph = createServer((req, res) => {
  const id = new URL(req.url ?? "/", "http://localhost").pathname.split("/").pop();
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      id,
      created_time: new Date().toISOString(),
      field_data: [
        { name: "full_name", values: ["Maria Exemplo"] },
        { name: "phone_number", values: [metaPhone] },
        { name: "email", values: ["maria.exemplo@example.com"] },
        { name: "what_type_of_service_do_you_need?", values: ["cabinet_painting_/_refinishing"] },
        { name: "town", values: ["Hyannis"] },
      ],
      ad_id: "1001",
      ad_name: "Cabinets — Cape Cod (simulado)",
      adset_id: "2001",
      adset_name: "Cape Cod (simulado)",
      campaign_id: "3001",
      campaign_name: "Campanha simulada",
      form_id: "4001",
    })
  );
});

async function post(label: string, path: string, body: string, headers: Record<string, string>): Promise<void> {
  const res = await fetch(`${APP_URL}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
  console.log(`${label.padEnd(34)} ${res.status} ${await res.text()}`);
  if (!res.ok) process.exitCode = 1;
}

function sendMeta(label: string): Promise<void> {
  const body = JSON.stringify({ object: "page", entry: [{ id: PAGE_ID, changes: [{ field: "leadgen", value: { leadgen_id: metaId, page_id: PAGE_ID } }] }] });
  const signature = `sha256=${createHmac("sha256", required("META_APP_SECRET")).update(body, "utf8").digest("hex")}`;
  return post(label, "/api/webhooks/meta-leads", body, { "x-hub-signature-256": signature });
}

async function main() {
  const websiteHeaders = { "x-webhook-secret": required("WEBSITE_LEADS_SECRET") };
  await new Promise<void>((resolve) => graph.listen(GRAPH_PORT, resolve));
  try {
    await sendMeta("Meta: novo pedido");
    await post(
      "Google: novo pedido",
      "/api/webhooks/google-leads",
      JSON.stringify({
        lead_id: `google-${run}`,
        google_key: required("GOOGLE_LEADS_WEBHOOK_KEY"),
        form_id: 5001,
        campaign_id: 6001,
        adgroup_id: 7001,
        creative_id: 8001,
        gcl_id: "gclid-simulado",
        user_column_data: [
          { column_id: "FULL_NAME", column_name: "Full Name", string_value: "João Exemplo" },
          { column_id: "PHONE_NUMBER", column_name: "User Phone", string_value: fictionalPhone() },
          { column_id: "EMAIL", column_name: "User Email", string_value: "joao.exemplo@example.com" },
        ],
      }),
      {}
    );
    await post(
      "Site: novo pedido",
      "/api/webhooks/website-leads",
      JSON.stringify({ leadId: `site-${run}`, nome: "Ana Exemplo", telefone: fictionalPhone(), email: "ana.exemplo@example.com", cep: "02332", cidade: "Duxbury", servico: "Exterior", utm_source: "google", utm_campaign: "simulada", utm_content: "v1", gclid: "gclid-simulado" }),
      websiteHeaders
    );
    await post(
      "Site: fora da área (Boston)",
      "/api/webhooks/website-leads",
      JSON.stringify({ leadId: `boston-${run}`, nome: "Bruno Exemplo", telefone: fictionalPhone(), cidade: "Boston", servico: "Interior" }),
      websiteHeaders
    );
    await sendMeta("Meta: mesma entrega de novo");
    await post(
      "Site: mesmo telefone da Maria",
      "/api/webhooks/website-leads",
      JSON.stringify({ leadId: `repeat-${run}`, nome: "Maria Exemplo", telefone: metaPhone, servico: "Cabinets" }),
      websiteHeaders
    );
  } finally {
    graph.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
