import { listTools, callTool } from "@/lib/poweroffice-mcp";

export type ForecastRow = {
  user: string;
  project: string;
  customer: string;
  week: string;
  hours: number;
  rate: number;
  revenue: number;
  status: "committed" | "projected" | "at-risk" | "unbilled";
};

export type ForecastResponse = {
  filters: {
    users: Array<{ id: string; name: string }>;
    projects: Array<{ id: string; name: string }>;
    customers: Array<{ id: string; name: string }>;
    departments: Array<{ id: string; name: string }>;
  };
  rows: ForecastRow[];
  summary: {
    totalHours: number;
    totalRevenue: number;
    utilization: number;
    atRiskRevenue: number;
  };
};

export async function GET(req: Request) {
  const apiSecret = process.env.FORECAST_API_SECRET;
  if (apiSecret) {
    const provided = req.headers.get("x-api-secret");
    if (provided !== apiSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const { searchParams } = new URL(req.url);
  const user = searchParams.get("user") ?? undefined;
  const project = searchParams.get("project") ?? undefined;
  const customer = searchParams.get("customer") ?? undefined;
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const department = searchParams.get("department") ?? undefined;

  // Validate date params
  if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    return new Response("Invalid dateFrom format, expected YYYY-MM-DD", { status: 400 });
  }
  if (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return new Response("Invalid dateTo format, expected YYYY-MM-DD", { status: 400 });
  }

  let tools;
  try {
    tools = await listTools();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `MCP tools/list failed: ${msg}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const toolNames = tools.map((t) => t.name);
  console.log("[billable-forecast] MCP tools available:", toolNames);

  // Prefer dedicated tools; fall back to generic names
  const employeeTool = toolNames.find((n) => /employee|user|member|staff/i.test(n));
  const projectTool = toolNames.find((n) => /project/i.test(n));
  const timeTool = toolNames.find((n) => /time.*entr|timesheet|hour/i.test(n));
  const rateTool = toolNames.find((n) => /rate|billing/i.test(n));

  const missingTools: string[] = [];
  if (!employeeTool) missingTools.push("employees");
  if (!projectTool) missingTools.push("projects");
  if (!timeTool) missingTools.push("time-entries");

  if (missingTools.length > 0) {
    return new Response(
      JSON.stringify({
        error: `No MCP tool found for: ${missingTools.join(", ")}. Available tools: ${toolNames.join(", ")}`,
      }),
      { status: 501, headers: { "Content-Type": "application/json" } }
    );
  }

  const filterArgs: Record<string, unknown> = {};
  if (user) filterArgs.user = user;
  if (project) filterArgs.project = project;
  if (customer) filterArgs.customer = customer;
  if (dateFrom) filterArgs.dateFrom = dateFrom;
  if (dateTo) filterArgs.dateTo = dateTo;
  if (status) filterArgs.status = status;
  if (department) filterArgs.department = department;

  try {
    const [employeesResult, projectsResult, timeResult] = await Promise.all([
      callTool(employeeTool!, filterArgs),
      callTool(projectTool!, filterArgs),
      callTool(timeTool!, filterArgs),
    ]);

    const rateResult = rateTool ? await callTool(rateTool, filterArgs) : null;

    const parseContent = (result: { content: Array<{ type: string; text?: string }> }) => {
      const text = result.content.map((c) => c.text ?? "").join("\n").trim();
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    };

    const employeesData = parseContent(employeesResult);
    const projectsData = parseContent(projectsResult);
    const timeData = parseContent(timeResult);
    const rateData = rateResult ? parseContent(rateResult) : null;

    // Normalize to arrays
    const employees: Array<{ id: string; name: string }> = Array.isArray(employeesData)
      ? employeesData
      : [];
    const projects: Array<{ id: string; name: string; customer?: string; department?: string }> =
      Array.isArray(projectsData) ? projectsData : [];
    const timeEntries: Array<{
      userId?: string;
      projectId?: string;
      week?: string;
      hours?: number;
      rate?: number;
      status?: string;
    }> = Array.isArray(timeData) ? timeData : [];
    const rates: Array<{ userId?: string; projectId?: string; rate?: number }> =
      Array.isArray(rateData) ? rateData : [];

    // Build lookup maps
    const employeeMap = new Map(employees.map((e) => [e.id, e.name]));
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    // Build rows
    const rows: ForecastRow[] = timeEntries.map((entry) => {
      const proj = entry.projectId ? projectMap.get(entry.projectId) : undefined;
      const userName = entry.userId ? (employeeMap.get(entry.userId) ?? entry.userId) : "Unknown";
      const projectName = proj?.name ?? entry.projectId ?? "Unknown";
      const customerName = proj?.customer ?? "Unknown";
      const rateEntry = rates.find(
        (r) => r.userId === entry.userId && r.projectId === entry.projectId
      );
      const rate = entry.rate ?? rateEntry?.rate ?? 0;
      const hours = entry.hours ?? 0;
      const revenue = hours * rate;
      const rawStatus = entry.status ?? "projected";
      const status: ForecastRow["status"] = ["committed", "projected", "at-risk", "unbilled"].includes(
        rawStatus
      )
        ? (rawStatus as ForecastRow["status"])
        : "projected";

      return {
        user: userName,
        project: projectName,
        customer: customerName,
        week: entry.week ?? "",
        hours,
        rate,
        revenue,
        status,
      };
    });

    // Build filter options from data
    const customers = Array.from(
      new Map(
        projects
          .filter((p) => p.customer)
          .map((p) => [p.customer!, { id: p.customer!, name: p.customer! }])
      ).values()
    );
    const departments = Array.from(
      new Map(
        projects
          .filter((p) => p.department)
          .map((p) => [p.department!, { id: p.department!, name: p.department! }])
      ).values()
    );

    const totalHours = rows.reduce((s, r) => s + r.hours, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const atRiskRevenue = rows
      .filter((r) => r.status === "at-risk")
      .reduce((s, r) => s + r.revenue, 0);
    const utilization =
      totalHours > 0 ? Math.round((rows.filter((r) => r.status !== "unbilled").reduce((s, r) => s + r.hours, 0) / totalHours) * 100) : 0;

    const response: ForecastResponse = {
      filters: {
        users: employees,
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
        customers,
        departments,
      },
      rows,
      summary: { totalHours, totalRevenue, utilization, atRiskRevenue },
    };

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `MCP call failed: ${msg}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
