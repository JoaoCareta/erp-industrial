create table external_shipment (
    plant_id varchar(255) not null, id uuid not null, order_id uuid not null, piece_index int not null,
    partner varchar(160) not null, shipped date not null, quantity int not null check(quantity>0),
    unit_price decimal(15,2) not null, actor_subject longtext not null, actor_issuer longtext not null,
    primary key(plant_id,id), foreign key(plant_id,order_id) references production_order(plant_id,id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
create table external_return (
    plant_id varchar(255) not null, shipment_id uuid not null, id uuid not null, received date not null,
    returned int not null check(returned>=0), lost int not null check(lost>=0), note varchar(500) not null,
    actor_subject longtext not null, actor_issuer longtext not null, primary key(plant_id,shipment_id,id),
    foreign key(plant_id,shipment_id) references external_shipment(plant_id,id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
