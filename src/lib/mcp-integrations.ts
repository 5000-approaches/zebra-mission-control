import { listTools, type McpTool } from "./poweroffice-mcp";

export type Integration = {
  id: string;
  label: string;
  loadTools: () => Promise<McpTool[]>;
};

export const INTEGRATIONS: Integration[] = [
  {
    id: "poweroffice",
    label: "PowerOffice",
    loadTools: () => listTools({ fresh: true }),
  },
];
