import type { IsolationMode, RuntimeProfile } from "../types.js";

export interface RuntimeProfileAsset {
  profile: RuntimeProfile;
  path: string;
}

export interface RuntimeBootstrapOptions {
  image: string;
  imageRecipePath: string;
  imageBuildDir: string;
  profiles: RuntimeProfileAsset[];
}

export interface RuntimeBootstrapResult {
  image: "ready" | "built" | "skipped";
  profiles: Array<{
    profile: RuntimeProfile;
    status: "ready" | "created";
  }>;
}

export interface RuntimeSessionOptions {
  name: string;
  workspacePath: string;
  profile: RuntimeProfile;
  isolation: IsolationMode;
  image: string;
}

export interface RuntimeProvider {
  readonly name: string;
  ensureHost(): Promise<void>;
  bootstrap(options: RuntimeBootstrapOptions): Promise<RuntimeBootstrapResult>;
  pullOrBuildImage(image: string): Promise<void>;
  createSession(options: RuntimeSessionOptions): Promise<void>;
  start(name: string): Promise<void>;
  snapshot(name: string, label: string): Promise<void>;
  restore(name: string, label: string): Promise<void>;
  stop(name: string): Promise<void>;
  destroy(name: string): Promise<void>;
  status(name?: string): Promise<string>;
}
