-- New permissions, granted so that nobody loses what they can do today:
-- * Packaging Configurator "manage packaging" (split from "manage packaging & shipping methods"): roles that had the combined one.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT "roleId", 'tool.packaging-configurator.packaging' FROM "RolePermission" WHERE "permission" = 'tool.packaging-configurator.catalog'
ON CONFLICT DO NOTHING;
-- * Packaging Configurator "run the sync & report": roles that manage its settings (who could run them before).
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT "roleId", 'tool.packaging-configurator.run' FROM "RolePermission" WHERE "permission" = 'tool.packaging-configurator.settings'
ON CONFLICT DO NOTHING;
-- * Shipping Rates Generator "run reports & pull data": roles with access to the tool (anyone with access could run them before).
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT rta."roleId", 'tool.shipping-rates.run' FROM "RoleToolAccess" rta JOIN "Tool" t ON t."id" = rta."toolId" WHERE t."slug" = 'shipping-rates'
ON CONFLICT DO NOTHING;
