"use server";

import { revalidatePath } from "next/cache";
import { createSignupWithAudit, deleteSignupWithAudit } from "@/lib/repository/signups";

export type ClaimActionResult =
  | { ok: true; signupId: string; claimToken: string }
  | { ok: false; error: string };
export type ReleaseActionResult = { ok: true } | { ok: false; error: string };

export async function claimSlot(formData: FormData): Promise<ClaimActionResult> {
  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) return { ok: false, error: "Missing task." };

  const result = await createSignupWithAudit(taskId, {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    group: String(formData.get("group") ?? ""),
    minor: formData.get("minor") === "on" ? true : undefined,
    honeypot: String(formData.get("website") ?? ""), // hidden field named "website"
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true, signupId: result.signupId, claimToken: result.claimToken };
}

export async function releaseSignup(
  signupId: string,
  claimToken: string | null,
): Promise<ReleaseActionResult> {
  const result = await deleteSignupWithAudit(signupId, claimToken);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/");
  return { ok: true };
}
