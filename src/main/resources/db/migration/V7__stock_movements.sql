create table stock_account (
    plant_id varchar(255) not null,
    material_id uuid not null,
    material_code longtext not null,
    material_name longtext not null,
    unit_id uuid not null,
    unit_code longtext not null,
    primary key (plant_id, material_id),
    foreign key (plant_id) references plant(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;

create table stock_movement (
    sequence_id bigint auto_increment primary key,
    plant_id varchar(255) not null,
    material_id uuid not null,
    request_id uuid not null,
    kind varchar(10) not null,
    quantity decimal(18,6) not null,
    source_id uuid,
    actor_issuer longtext not null,
    actor_subject longtext not null,
    occurred_at datetime(6) not null default (utc_timestamp(6)),
    unique (plant_id, request_id),
    unique (plant_id, material_id, request_id),
    unique (plant_id, material_id, source_id),
    foreign key (plant_id, material_id) references stock_account(plant_id, material_id),
    foreign key (plant_id, material_id, source_id) references stock_movement(plant_id, material_id, request_id),
    check ((kind in ('opening','receipt') and quantity > 0 and source_id is null)
        or (kind = 'reversal' and quantity < 0 and source_id is not null))
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
