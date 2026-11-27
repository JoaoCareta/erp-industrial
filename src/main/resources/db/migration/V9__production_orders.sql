create table production_order (
    number bigint auto_increment primary key,
    plant_id varchar(255) not null, id uuid not null, unique(plant_id,id),
    product_id uuid not null, version int not null, quantity int not null check(quantity > 0),
    product_code longtext not null, product_name longtext not null,
    materials json not null, pieces json not null,
    created_at datetime(6) not null default (utc_timestamp(6)), created_by longtext not null, created_issuer longtext not null,
    released_at datetime(6), released_by longtext, released_issuer longtext,
    check ((released_at is null) = (released_by is null) and (released_at is null) = (released_issuer is null)),
    foreign key (plant_id) references plant(id),
    foreign key (product_id,version) references publication(product_id,version)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
