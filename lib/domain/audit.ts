export interface ClaimAuditInput {
  signupId: string;
  name: string;
  group: string | null;
}

export interface ReleaseAuditInput {
  signupId: string;
  name: string;
  group: string | null;
  email: string | null;
  phone: string | null;
  minor: boolean | null;
}

export function claimAuditDetails(input: ClaimAuditInput) {
  return {
    summary: `${input.name} claimed a slot`,
    signupId: input.signupId,
    name: input.name,
    group: input.group,
  };
}

/** Release stores the full signup snapshot so a future revert can recreate it. */
export function releaseAuditDetails(input: ReleaseAuditInput) {
  return {
    summary: `${input.name} was removed`,
    signupId: input.signupId,
    name: input.name,
    group: input.group,
    email: input.email,
    phone: input.phone,
    minor: input.minor,
  };
}
