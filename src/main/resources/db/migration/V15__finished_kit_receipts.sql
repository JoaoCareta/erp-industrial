create table finished_kit_receipt (
    plant_id varchar(255) not null,
    order_id uuid not null,
    request_id uuid not null,
    quantity int not null check (quantity > 0),
    actor_name longtext not null,
    actor_subject longtext not null,
    actor_issuer longtext not null,
    received_at datetime(6) not null default (utc_timestamp(6)),
    primary key (plant_id,order_id,request_id),
    foreign key (plant_id,order_id) references production_order(plant_id,id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
