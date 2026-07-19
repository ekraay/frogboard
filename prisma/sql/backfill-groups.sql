-- One Group per distinct (orgId, group).
INSERT INTO "Group" ("id", "orgId", "name", "createdAt")
SELECT gen_random_uuid()::text, p."orgId", p."group", now()
FROM (SELECT DISTINCT "orgId", "group" FROM "Person" WHERE "group" IS NOT NULL) AS p
ON CONFLICT ("orgId", "name") DO NOTHING;

-- One Membership per grouped person, linked to that group, carrying subGroup.
INSERT INTO "Membership" ("id", "personId", "groupId", "subGroup", "createdAt")
SELECT gen_random_uuid()::text, p."id", g."id", p."subGroup", now()
FROM "Person" p
JOIN "Group" g ON g."orgId" = p."orgId" AND g."name" = p."group"
WHERE p."group" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Membership" m WHERE m."personId" = p."id" AND m."groupId" = g."id"
  );
