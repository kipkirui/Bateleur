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
