-- Signup hardcoded every new student to the pilot school (pdsb_code
-- 'PILOT01') and validated emails against '@pdsb.net' specifically, so a
-- second school could never actually onboard. schools.email_domain lets
-- signup validate against whichever school the student actually picks,
-- and the client now passes school_id through explicitly instead of the
-- server guessing it.

alter table schools add column if not exists email_domain text;

update schools set email_domain = 'pdsb.net' where pdsb_code = 'PILOT01' and email_domain is null;
