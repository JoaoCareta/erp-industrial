create table item (
    id uuid primary key, group_id text not null references business_group, kind text not null check(kind in ('category','unit','material','product','part')),
    code text not null, name text not null, dimension text not null, active boolean not null,
    category_id uuid, unit_id uuid, unique(group_id,kind,code), unique(group_id,id),
    foreign key(group_id,category_id) references item(group_id,id), foreign key(group_id,unit_id) references item(group_id,id)
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
