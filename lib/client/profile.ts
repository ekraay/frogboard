"use client";

// Device-local memory of what a volunteer typed last, so signing up for several
// shifts on the same device prefills instead of retyping. Name and group only:
// no contact details, and nothing leaves the device.
const KEY = "frogboard.profile";

export interface Profile {
  name: string;
  group: string;
}

export function rememberProfile(p: Profile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify({ name: p.name, group: p.group }));
}

export function getProfile(): Profile {
  if (typeof window === "undefined") return { name: "", group: "" };
  try {
    const p = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    return {
      name: typeof p.name === "string" ? p.name : "",
      group: typeof p.group === "string" ? p.group : "",
    };
  } catch {
    return { name: "", group: "" };
  }
}
