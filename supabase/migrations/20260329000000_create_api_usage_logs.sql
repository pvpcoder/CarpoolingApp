create table if not exists api_usage_logs (
  id          bigserial primary key,
  created_at  timestamptz default now() not null,
  function_name text not null,
  model       text not null,
  input_tokens  integer not null,
  output_tokens integer not null,
  input_cost_usd  numeric(12, 8) not null,
  output_cost_usd numeric(12, 8) not null,
  total_cost_usd  numeric(12, 8) not null
);
