create table production_stage_report (
    sequence_id bigint auto_increment primary key,
    plant_id varchar(255) not null,
    order_id uuid not null,
    request_id uuid not null,
    piece_index int not null check (piece_index >= 0),
    step_index int not null check (step_index >= 0),
    quantity int not null check (quantity > 0),
    material_id uuid,
    consumed decimal(18,6),
    actor_name longtext not null,
    actor_issuer longtext not null,
    actor_subject longtext not null,
    occurred_at datetime(6) not null default (utc_timestamp(6)),
    unique (plant_id,order_id,request_id),
    key report_history (plant_id,order_id,sequence_id),
    foreign key (plant_id,order_id) references production_order(plant_id,id),
    check ((material_id is null and consumed is null) or
           (material_id is not null and consumed is not null and consumed > 0))
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
