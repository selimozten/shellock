import type { RuntimeProfile } from "../types.js";

export const BUNDLED_RUNTIME_PROFILES: RuntimeProfile[] = ["base", "net-basic", "net-advanced", "lab", "vm-danger"];

export interface RuntimeToolGroup {
  name: string;
  tools: string[];
  profiles: RuntimeProfile[];
  required: boolean;
}

export const RUNTIME_TOOL_GROUPS: RuntimeToolGroup[] = [
  {
    name: "core",
    required: true,
    profiles: BUNDLED_RUNTIME_PROFILES,
    tools: ["bash", "git", "curl", "python3", "jq", "rg"],
  },
  {
    name: "recon",
    required: true,
    profiles: ["net-basic", "net-advanced", "lab", "vm-danger"],
    tools: ["nmap", "dig", "whois", "nc"],
  },
  {
    name: "web",
    required: true,
    profiles: ["net-advanced", "lab", "vm-danger"],
    tools: ["gobuster", "nikto", "sqlmap", "whatweb"],
  },
  {
    name: "network-support",
    required: false,
    profiles: ["net-advanced", "lab", "vm-danger"],
    tools: ["socat", "smbclient", "ldapsearch"],
  },
  {
    name: "binary",
    required: true,
    profiles: ["lab", "vm-danger"],
    tools: ["file", "strings", "objdump", "readelf", "gdb", "strace", "ltrace"],
  },
  {
    name: "forensics",
    required: false,
    profiles: ["lab", "vm-danger"],
    tools: ["yara", "binwalk"],
  },
  {
    name: "modern-security",
    required: false,
    profiles: ["lab", "vm-danger"],
    tools: ["ffuf", "nuclei", "gitleaks", "trufflehog", "semgrep", "syft", "grype"],
  },
  {
    name: "mobile",
    required: false,
    profiles: ["vm-danger"],
    tools: ["jadx", "apktool", "frida", "frida-trace"],
  },
];

export function toolGroupsForProfile(profile: RuntimeProfile): RuntimeToolGroup[] {
  return RUNTIME_TOOL_GROUPS.filter((group) => group.profiles.includes(profile));
}

export function parseRuntimeProfile(value: string | undefined, fallback: RuntimeProfile = "base"): RuntimeProfile {
  if (!value) return fallback;
  return BUNDLED_RUNTIME_PROFILES.includes(value as RuntimeProfile) ? (value as RuntimeProfile) : fallback;
}
