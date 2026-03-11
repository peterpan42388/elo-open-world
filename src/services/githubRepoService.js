import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitHubRepoService {
  async createInitializedRepo({ owner, repo, sourceDir, visibility = "public" }) {
    const visibilityFlag = visibility === "private" ? "--private" : "--public";
    await execFileAsync("gh", [
      "repo",
      "create",
      `${owner}/${repo}`,
      visibilityFlag,
      "--source",
      sourceDir,
      "--remote",
      "origin",
      "--push"
    ]);
    return {
      repoFullName: `${owner}/${repo}`,
      repoUrl: `https://github.com/${owner}/${repo}`
    };
  }
}
