const REMOTE_IMAGES = "bateleur.remoteImages";

export function loadRemoteImagesPref(): boolean {
  try {
    return window.localStorage.getItem(REMOTE_IMAGES) === "1";
  } catch {
    return false;
  }
}

export function saveRemoteImagesPref(on: boolean) {
  try {
    window.localStorage.setItem(REMOTE_IMAGES, on ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

const COMPOSE_BLEED = "bateleur.composeBleed";

export function loadComposeBleedPref(): boolean {
  try {
    return window.localStorage.getItem(COMPOSE_BLEED) === "1";
  } catch {
    return false;
  }
}

export function saveComposeBleedPref(on: boolean) {
  try {
    window.localStorage.setItem(COMPOSE_BLEED, on ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

export type StaffProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "compatible";

export function defaultStaffModel(provider: StaffProvider): string {
  switch (provider) {
    case "openai":
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-3-5-haiku-latest";
    case "gemini":
      return "gemini-2.0-flash";
    case "openrouter":
      return "openai/gpt-4o-mini";
    case "compatible":
      return "llama3.2";
  }
}

const STAFF_PROVIDER = "bateleur.staffProvider";
const STAFF_ENDPOINT = "bateleur.staffEndpoint";

const PROVIDERS = new Set<StaffProvider>([
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
  "compatible",
]);

export function loadStaffProvider(): StaffProvider {
  try {
    const raw = window.localStorage.getItem(STAFF_PROVIDER);
    if (raw && PROVIDERS.has(raw as StaffProvider)) return raw as StaffProvider;
  } catch {
    /* ignore */
  }
  return "openai";
}

export function loadStaffEndpoint(): string {
  try {
    return window.localStorage.getItem(STAFF_ENDPOINT) ?? "";
  } catch {
    return "";
  }
}
