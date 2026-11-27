create table stock_reservation (
    plant_id varchar(255) not null,
    material_id uuid not null,
    order_id uuid not null,
    quantity decimal(18,6) not null check (quantity > 0),
    primary key (plant_id, material_id, order_id),
    foreign key (plant_id, material_id) references stock_account(plant_id, material_id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
