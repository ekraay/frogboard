# Groups Epic: Managed Groups, Membership, and Group-First Events

**Epic design doc.** This supersedes the single free-text `Person.group` model shipped on the roster-rsvp branch. It is an epic, not one spec: each sub-project below gets its own spec, plan, and build cycle. This doc fixes the shared model and the decomposition so the sub-projects stay consistent.

## Why

Two realizations reshaped the roster/RSVP work:

1. **The roster is per-org, not per-event.** `Person` carries an `orgId`, never an `eventId`. Importing "on an event" writes people into the org's standing directory, shared across every event. Only RSVPs and leads are per-event. The event page was just where import happened to live.
2. **Event-first design creates overhead.** Today `getGroupRollups(eventId)` pulls every active person in the org, so every event shows a card for every group. A scoutmaster who runs mostly Scouts events must reach across all of BCSF's groups and prune the rest each time. That is the clutter and the friction.

The fix is the Slack model: a centralized directory of people, groups you manage once, and a group-first surface so work scoped to a group carries no per-event selection cost.

## The model

Org at the top; relationships kept general so no cardinality choice becomes a one-way door.

- **Org** (BCSF) owns everything. Unchanged.
- **Group** is a first-class entity (Scouts/Troop 29, Taiko, BWA, YAO), created once and renamable. Replaces the free-text `Person.group`.
- **Membership**: a `Person`-`Group` join, many-to-many. A person can belong to Scouts and Taiko. The **patrol/subGroup moves onto the membership**, since a patrol is a fact about a person within one group, not a global attribute.
- **Event participation**: an `Event`-`Group` join, many-to-many, zero or more groups per event. One group is a Scouts event; several is a festival; none or all is an org-wide temple standing board.

RSVPs and leads stay per-event.

### Why many-to-many is the safe choice

A hard 1:1 (an event requires exactly one group, or a person belongs to exactly one group) is the one-way door: escaping it later means a migration. Many-to-many joins represent every case as a different fill of the same tables, including the org-wide temple standing board (an event tied to all groups or none). Group-first is then only a default and a navigation lens, fully reversible, layered on a general model.

## Decomposition

Three sub-projects, each its own spec and plan. Build order below; sub-project 1 is the foundation the others need.

### Sub-project 1: Managed groups and membership (foundation)

Promote the free-text `Person.group` into `Group` and `Membership` rows. Move patrol onto the membership. Migrate existing data: create one `Group` per distinct group value in the org, one `Membership` per person, carrying the current subGroup.

Delivers the original request: a centralized directory where the organizer creates groups, adds and removes people, and clicks into a group to confirm who imported. Import re-points at the directory (add or update people, attach memberships) instead of writing a string.

### Sub-project 2: Group-first navigation and home group

A group is a home base. The organizer works inside a group, and creating an event there defaults to that group. Removes the re-selection overhead for the common single-group case.

### Sub-project 3: Event-group participation

Attach one or more groups to an event. Rollups and the group roster show only participating groups, which fixes the clutter. This is also where org-wide and temple standing events slot in (an event with all groups or none). Aligns with the frog-marketplace standing-board spec, which is the org-wide case.

## Migration and continuity

The roster, RSVP, and lead work shipped this session stays. Sub-project 1 carries the migration from the `group` string to the join tables and re-points reads (`getGroupRollups`, `getLeadChaseView`, import, lead scoping) at `Group`/`Membership`. No RSVP or lead data is lost.

## Relationship to existing specs

- **roster-rsvp** (`2026-07-08-roster-rsvp-design.md`): shipped the single-group model this epic normalizes.
- **frog-marketplace standing board** (`2026-07-11-frog-marketplace-design.md`): the org-wide, no-single-group case that sub-project 3's participation model must accommodate.
- **BACKLOG**: "Normalized Group entity + group-organizer role" is the placeholder this epic fleshes out.

## Next step

Brainstorm sub-project 1 through the normal design flow and write its detailed spec (migration steps, directory page, import rewrite, and the group detail/import-confirmation view) before any planning.
