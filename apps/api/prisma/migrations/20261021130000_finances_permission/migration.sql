-- Module « Finances » (prix, frais, budgets, dépenses, CA, profit) :
-- BUREAU le reçoit en entier, les autres rôles rien — l'admin le donne compte
-- par compte. Source : DEFAULT_ROLE_PERMISSIONS (packages/shared).
INSERT INTO "role_permission" ("role", "permission") VALUES
('BUREAU', 'finances.view'),
('BUREAU', 'finances.edit')
ON CONFLICT DO NOTHING;
