-- Reverting multi-school support per product decision: sticking to a
-- single school (PDSB pilot) for now. email_domain was added purely to
-- support per-school signup validation, which the app no longer does.

alter table schools drop column if exists email_domain;
