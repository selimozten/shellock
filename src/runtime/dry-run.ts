import type {
  RuntimeBootstrapOptions,
  RuntimeBootstrapResult,
  RuntimeProvider,
  RuntimeSessionOptions,
} from "./runtime.js";

type SessionState = "created" | "running" | "stopped";

interface DryRunSession {
  options: RuntimeSessionOptions;
  state: SessionState;
  snapshots: Set<string>;
}

export class DryRunRuntimeProvider implements RuntimeProvider {
  readonly name = "dry-run";
  private sessions = new Map<string, DryRunSession>();
  private images = new Set<string>();
  private profiles = new Set<string>();

  async ensureHost(): Promise<void> {}

  async bootstrap(options: RuntimeBootstrapOptions): Promise<RuntimeBootstrapResult> {
    const imageStatus = options.image ? (this.images.has(options.image) ? "ready" : "built") : "skipped";
    if (options.image) this.images.add(options.image);

    const profiles: RuntimeBootstrapResult["profiles"] = options.profiles.map((asset) => {
      const status: RuntimeBootstrapResult["profiles"][number]["status"] = this.profiles.has(asset.profile) ? "ready" : "created";
      this.profiles.add(asset.profile);
      return { profile: asset.profile, status };
    });

    return { image: imageStatus, profiles };
  }

  async pullOrBuildImage(_image: string): Promise<void> {}

  async createSession(options: RuntimeSessionOptions): Promise<void> {
    this.sessions.set(options.name, { options, state: "created", snapshots: new Set() });
  }

  async start(name: string): Promise<void> {
    const session = this.requireSession(name);
    session.state = "running";
  }

  async snapshot(name: string, label: string): Promise<void> {
    const session = this.requireSession(name);
    session.snapshots.add(label);
  }

  async restore(name: string, label: string): Promise<void> {
    const session = this.requireSession(name);
    if (!session.snapshots.has(label)) throw new Error(`snapshot ${label} does not exist for ${name}`);
    session.state = "stopped";
  }

  async stop(name: string): Promise<void> {
    const session = this.requireSession(name);
    session.state = "stopped";
  }

  async destroy(name: string): Promise<void> {
    this.sessions.delete(name);
  }

  async status(name?: string): Promise<string> {
    if (name) {
      const session = this.sessions.get(name);
      if (!session) return `${name}: missing`;
      return this.formatSession(name, session);
    }
    const sessions = [...this.sessions.entries()].map(([sessionName, session]) => this.formatSession(sessionName, session));
    return sessions.join("\n") || "no sessions";
  }

  private requireSession(name: string): DryRunSession {
    const session = this.sessions.get(name);
    if (!session) throw new Error(`session ${name} does not exist`);
    return session;
  }

  private formatSession(name: string, session: DryRunSession): string {
    const snapshotCount = session.snapshots.size;
    return [
      `${name}: ${session.state}`,
      `image=${session.options.image}`,
      `profile=${session.options.profile}`,
      `isolation=${session.options.isolation}`,
      `workspace=${session.options.workspacePath}`,
      `snapshots=${snapshotCount}`,
    ].join(" ");
  }
}
