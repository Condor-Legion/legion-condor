UPDATE "TemporaryDiscordRoleGrant"
SET "assignedById" = 'BOT'
WHERE "assignedById" IS NULL
  AND "roleId" IN ('1479260838740099294', '1508964714577662063');
