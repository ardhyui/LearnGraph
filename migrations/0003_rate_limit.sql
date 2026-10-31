-- Better Auth rate-limit counters (rateLimit.storage = "database").
-- Stored in Postgres so limits hold across serverless instances. Additive only.
create table if not exists "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);
