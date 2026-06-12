import { prisma } from "@/lib/db";
import { validateClaim, validateRelease, type ClaimInput } from "@/lib/domain/claim";
import { claimAuditDetails, releaseAuditDetails } from "@/lib/domain/audit";
import { newClaimToken } from "@/lib/security/tokens";
import type { SlotInfo } from "@/lib/domain/types";

type CreateResult =
  | { ok: true; signupId: string; claimToken: string }
  | { ok: false; error: string };
type VoidResult = { ok: true } | { ok: false; error: string };

export async function createSignupWithAudit(
  taskId: string,
  input: ClaimInput,
): Promise<CreateResult> {
  return prisma.$transaction(async (tx) => {
    // Lock the task row so concurrent claims serialize here — prevents overfill.
    const locked = await tx.$queryRaw<{ id: string; eventId: string; neededCount: number }[]>`
      SELECT "id", "eventId", "neededCount" FROM "Task" WHERE "id" = ${taskId} FOR UPDATE
    `;
    if (locked.length === 0) {
      return { ok: false as const, error: "That task no longer exists." };
    }
    const { eventId, neededCount } = locked[0];

    const filled = await tx.signup.count({ where: { taskId } });
    const slot: SlotInfo = { filled, needed: neededCount, isFull: filled >= neededCount };

    const check = validateClaim(input, slot);
    if (!check.ok) return { ok: false as const, error: check.error };

    const claimToken = newClaimToken();
    const signup = await tx.signup.create({
      data: {
        taskId,
        name: check.value.name,
        email: check.value.email,
        phone: check.value.phone,
        group: check.value.group,
        minor: check.value.minor,
        claimToken,
      },
    });
    await tx.auditLog.create({
      data: {
        eventId,
        taskId,
        action: "claim",
        details: claimAuditDetails({
          signupId: signup.id, name: check.value.name, group: check.value.group,
        }),
      },
    });
    return { ok: true as const, signupId: signup.id, claimToken };
  });
}

export async function deleteSignupWithAudit(
  signupId: string,
  providedToken: string | null,
): Promise<VoidResult> {
  return prisma.$transaction(async (tx) => {
    const signup = await tx.signup.findUnique({
      where: { id: signupId },
      include: { task: { select: { eventId: true } } },
    });
    if (!signup) return { ok: false as const, error: "That signup is no longer here." };

    const check = validateRelease({ claimToken: signup.claimToken }, providedToken);
    if (!check.ok) return check;

    await tx.auditLog.create({
      data: {
        eventId: signup.task.eventId,
        taskId: signup.taskId,
        action: "release",
        details: releaseAuditDetails({
          signupId: signup.id, name: signup.name, group: signup.group,
          email: signup.email, phone: signup.phone, minor: signup.minor,
        }),
      },
    });
    await tx.signup.delete({ where: { id: signupId } });
    return { ok: true as const };
  });
}
