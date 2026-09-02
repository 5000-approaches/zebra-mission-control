import { redirect } from "next/navigation";

/** The agent now lives on the home page; keep old links working. */
export default function AgentRedirect() {
  redirect("/");
}
