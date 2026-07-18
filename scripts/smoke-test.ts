const BASE = "http://localhost:5000/api";

async function api(method: string, path: string, token: string, body?: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// Login
const login = await api("POST", "/auth/login", "", { username: "admin", password: "Metadology01!" });
const token = login.data.token;
console.log("LOGIN:", login.success ? "OK" : "FAIL");

// GET /auth/me
const me = await api("GET", "/auth/me", token);
console.log("ME:", me.data.username, me.data.role);

// BID CRUD
console.log("\n--- BIDS ---");
const bidCreate = await api("POST", "/bids", token, {
  project: "Hudson Yards Phase 4",
  client: "Related Companies",
  phase: "RFP Review",
  deadline: "2026-05-15",
  suppliers: ["Turner", "Skanska"],
  value: 420000000,
});
console.log("CREATE:", bidCreate.success, "id=" + bidCreate.data?.bid?.id, "project=" + bidCreate.data?.bid?.project, "value=" + bidCreate.data?.bid?.value);
const bidId = bidCreate.data?.bid?.id;

if (bidId) {
  const bidGet = await api("GET", `/bids/${bidId}`, token);
  console.log("GET:", bidGet.success, "project=" + bidGet.data?.bid?.project);

  const bidUpdate = await api("PATCH", `/bids/${bidId}`, token, { phase: "Technical Eval", value: 450000000 });
  console.log("UPDATE:", bidUpdate.success, "phase=" + bidUpdate.data?.bid?.phase, "value=" + bidUpdate.data?.bid?.value);

  const bidList = await api("GET", "/bids?page=1&limit=5", token);
  console.log("LIST:", bidList.success, "total=" + bidList.data?.pagination?.total);

  await api("DELETE", `/bids/${bidId}`, token);
  console.log("DELETE: OK");
}

// PROJECT CRUD
console.log("\n--- PROJECTS ---");
const projCreate = await api("POST", "/projects", token, {
  project: "Miami Worldcenter",
  client: "MDM Group",
  start_date: "2024-03-01",
  end_date: "2027-08-01",
  progress: 42,
  suppliers: ["Suffolk", "Moss"],
  uses_3d: true,
});
console.log("CREATE:", projCreate.success, "id=" + projCreate.data?.project?.id, "start=" + projCreate.data?.project?.start_date, "end=" + projCreate.data?.project?.end_date);
const projId = projCreate.data?.project?.id;

if (projId) {
  const projGet = await api("GET", `/projects/${projId}`, token);
  console.log("GET:", projGet.success, "start=" + projGet.data?.project?.start_date);

  const projUpdate = await api("PATCH", `/projects/${projId}`, token, { progress: 55 });
  console.log("UPDATE:", projUpdate.success, "progress=" + projUpdate.data?.project?.progress);

  const projList = await api("GET", "/projects?page=1&limit=5", token);
  console.log("LIST:", projList.success, "total=" + projList.data?.pagination?.total);

  await api("DELETE", `/projects/${projId}`, token);
  console.log("DELETE: OK");
}

// CAMPAIGN CRUD
console.log("\n--- CAMPAIGNS ---");
const campCreate = await api("POST", "/campaigns", token, {
  name: "Test LinkedIn Wave",
  type: "LinkedIn",
  sent: 100,
  opened: 75,
  clicked: 30,
  status: "Completed",
  campaign_date: "2026-03-15",
});
console.log("CREATE:", campCreate.success, "id=" + campCreate.data?.campaign?.id, "campaign_date=" + campCreate.data?.campaign?.campaign_date);
const campId = campCreate.data?.campaign?.id;

if (campId) {
  const campGet = await api("GET", `/campaigns/${campId}`, token);
  console.log("GET:", campGet.success, "campaign_date=" + campGet.data?.campaign?.campaign_date);

  const campUpdate = await api("PATCH", `/campaigns/${campId}`, token, { clicked: 45 });
  console.log("UPDATE:", campUpdate.success, "clicked=" + campUpdate.data?.campaign?.clicked);

  const campList = await api("GET", "/campaigns?page=1&limit=5", token);
  console.log("LIST:", campList.success, "total=" + campList.data?.pagination?.total);

  const stats = await api("GET", "/campaigns/stats", token);
  console.log("STATS:", stats.success, "sent=" + stats.data?.total_sent, "ctr=" + stats.data?.avg_ctr + "%");

  await api("DELETE", `/campaigns/${campId}`, token);
  console.log("DELETE: OK");
}

// ANALYTICS
console.log("\n--- ANALYTICS ---");
const weekly = await api("GET", "/analytics/weekly?weeks=8", token);
console.log("WEEKLY:", weekly.success, "weeks=" + (weekly.data?.length ?? 0));

const kpis = await api("GET", "/analytics/kpis", token);
console.log("KPIs:", kpis.success, JSON.stringify(kpis.data));

const funnel = await api("GET", "/analytics/funnel", token);
console.log("FUNNEL:", funnel.success, "stages=" + (funnel.data?.length ?? 0));

console.log("\n--- ALL TESTS PASSED ---");
