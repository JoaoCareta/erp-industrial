create table sector (id text primary key, name text not null);
create table account (
    id uuid primary key, issuer text not null, subject text not null,
    name text not null, active boolean not null default true, sector_id text references sector,
    unique (issuer, subject)
);
create table entitlement (
    account_id uuid references account, action text not null, scope text not null,
    primary key (account_id, action, scope)
);
create table access_audit (
    id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
    actor text not null, action text not null, target text not null, result text not null,
    reason text not null, correlation uuid not null
);
