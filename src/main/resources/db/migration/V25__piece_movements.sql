create table piece_account (
    plant_id varchar(255) not null, part_id uuid not null, primary key(plant_id,part_id),
    foreign key(plant_id) references plant(id), foreign key(part_id) references item(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
create table piece_movement (
    plant_id varchar(255) not null, part_id uuid not null, id uuid not null, kind varchar(20) not null,
    quantity int not null check(quantity>0), physical_delta int not null, reserved_delta int not null,
    reason varchar(500) not null, origin uuid, actor_subject longtext not null, actor_issuer longtext not null,
    created_at datetime(6) not null default (utc_timestamp(6)), primary key(plant_id,id),unique(plant_id,origin),
    foreign key(plant_id,part_id) references piece_account(plant_id,part_id),foreign key(plant_id,origin) references piece_movement(plant_id,id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
