create table finished_stock (
    plant_id varchar(255) not null, product_id uuid not null,
    opening bigint not null default 0, produced bigint not null default 0, sold bigint not null default 0,
    opening_request uuid, opening_actor longtext, opening_issuer longtext, opened_at datetime(6),
    primary key (plant_id, product_id), unique (plant_id, opening_request),
    check (opening >= 0 and produced >= 0 and sold >= 0 and sold <= opening + produced),
    foreign key (plant_id) references plant(id), foreign key (product_id) references item(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;

insert into finished_stock(plant_id,product_id,produced)
select r.plant_id,o.product_id,sum(r.quantity) from finished_kit_receipt r
join production_order o on o.plant_id=r.plant_id and o.id=r.order_id group by r.plant_id,o.product_id;

create table product_sale (
    plant_id varchar(255) not null, request_id uuid not null, product_id uuid not null,
    sale_date date not null, channel varchar(120) not null, quantity int not null check(quantity > 0),
    unit_price decimal(15,2) not null check(unit_price >= 0), actor_subject longtext not null,
    actor_issuer longtext not null, created_at datetime(6) not null default (utc_timestamp(6)),
    primary key(plant_id,request_id), foreign key(plant_id,product_id) references finished_stock(plant_id,product_id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
