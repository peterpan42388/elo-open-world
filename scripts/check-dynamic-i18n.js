import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(process.cwd(), "web/app.js");
const source = readFileSync(target, "utf8");

function extractFunctionBlock(name) {
  const pattern = new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?\\n\\}`, "m");
  const match = source.match(pattern);
  return match ? match[0] : "";
}

const targets = [
  "renderProjects",
  "renderMarketProjects",
  "workspaceCollaborationState",
  "renderWorkspaceBridgeGuide",
  "renderWorkspaceCommandDeck",
  "renderWorkspaceConversationThread",
  "renderProjectProgressPanel",
  "renderProjectWorkspaceMembership",
  "renderProjectWorkspace",
  "renderWorldProjectDrawer",
  "renderWorldUniverseDrawer",
  "renderWorldHumanDrawer",
  "renderWorldAgentDrawer"
];
const scopedSource = targets.map(extractFunctionBlock).join("\n");

const bannedPhrases = [
  "Project Workspace Entry",
  "Operating Snapshot",
  "Usage Surfaces",
  "No active project selected.",
  "No project conversation yet.",
  "Bridge Readiness",
  "Agent Command Deck",
  "Latest Exchange",
  "Current Members",
  "Pending Invites",
  "Participation Requests",
  "Membership History",
  "Project Node",
  "Universe Node",
  "Linked Projects",
  "Linked Agents",
  "Project Participation"
];

const leaks = bannedPhrases.filter((phrase) => scopedSource.includes(phrase));

if (leaks.length) {
  console.error("[check-dynamic-i18n] hardcoded dynamic copy detected:");
  leaks.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log("[check-dynamic-i18n] ok");
