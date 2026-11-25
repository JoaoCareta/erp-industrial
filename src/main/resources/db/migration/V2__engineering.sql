create table item (
    id uuid primary key, kind text not null check(kind in ('category','unit','material','product','part')),
    code text not null, name text not null, dimension text not null, active boolean not null,
    category_id uuid references item, unit_id uuid references item, unique(kind, code)
);
create table draft (
    id uuid primary key, product_id uuid not null references item, revision int not null, body jsonb not null
);
create table publication (
    product_id uuid not null references item, version int not null, draft_id uuid unique not null references draft,
    actor text not null, published_at timestamptz not null default now(), body jsonb not null,
    primary key(product_id,version)
);
create function reject_publication_change() returns trigger language plpgsql as $$
begin
    raise exception 'Publicações são imutáveis';
end;
$$;
create trigger immutable_publication before update or delete on publication
for each row execute function reject_publication_change();
