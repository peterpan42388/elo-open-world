import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const EMPTY_STATE = {
  humans: [],
  agents: [],
  plugins: [],
  projects: []
};

export class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return {
        humans: Array.isArray(parsed.humans) ? parsed.humans : [],
        agents: Array.isArray(parsed.agents) ? parsed.agents : [],
        plugins: Array.isArray(parsed.plugins) ? parsed.plugins : [],
        projects: Array.isArray(parsed.projects) ? parsed.projects : []
      };
    } catch (error) {
      if (error && error.code === "ENOENT") return { ...EMPTY_STATE };
      throw error;
    }
  }

  async save(snapshot) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const payload = JSON.stringify(snapshot, null, 2);
    await writeFile(this.filePath, `${payload}\n`, "utf8");
  }
}
