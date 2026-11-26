create table item (
    id uuid primary key, group_id varchar(255) not null,
    kind varchar(16) not null check(kind in ('category','unit','material','product','part')),
    code longtext not null, name longtext not null, dimension longtext not null,
    active boolean not null check(active in (0,1)),
    category_id uuid, unit_id uuid, unique(group_id,kind,code), unique(group_id,id),
    foreign key(group_id) references business_group(id),
    foreign key(group_id,category_id) references item(group_id,id),
    foreign key(group_id,unit_id) references item(group_id,id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
create table draft (
    id uuid primary key, product_id uuid not null, revision int not null, body json not null,
    foreign key(product_id) references item(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
create table publication (
    product_id uuid not null, version int not null, draft_id uuid unique not null,
    actor longtext not null, published_at datetime(6) not null default (utc_timestamp(6)), body json not null,
    primary key(product_id,version),
    foreign key(product_id) references item(id), foreign key(draft_id) references draft(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
create trigger immutable_publication_update before update on publication
for each row signal sqlstate '45000' set message_text = 'Publicações são imutáveis';
create trigger immutable_publication_delete before delete on publication
for each row signal sqlstate '45000' set message_text = 'Publicações são imutáveis';
