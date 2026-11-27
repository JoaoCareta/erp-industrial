create table material_purchase (
    plant_id varchar(255) not null, id uuid not null, material_id uuid not null, unit_id uuid not null,
    movement_id uuid not null, reversal_id uuid not null, purchase_date date not null, supplier varchar(160) not null,
    quantity decimal(18,6) not null check(quantity>0), amount decimal(18,2) not null check(amount>=0),
    actor_subject longtext not null, actor_issuer longtext not null, created_at datetime(6) not null default (utc_timestamp(6)),
    primary key(plant_id,id), unique(plant_id,movement_id),
    foreign key(plant_id,material_id,movement_id) references stock_movement(plant_id,material_id,request_id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
