alter table finished_stock add disputed bigint not null default 0 check(disputed >= 0);
alter table finished_kit_receipt add effective_quantity int, add revision int not null default 0;
update finished_kit_receipt set effective_quantity=quantity;
alter table finished_kit_receipt modify effective_quantity int not null check(effective_quantity >= 0);

create table kit_correction (
    plant_id varchar(255) not null, order_id uuid not null, id uuid not null, receipt_id uuid not null,
    revision int not null, prior int not null, counted int not null, reason varchar(500) not null,
    actor_subject longtext not null, actor_issuer longtext not null, created_at datetime(6) not null default (utc_timestamp(6)),
    state varchar(8) not null check(state in ('pending','applied')), resolution varchar(500),
    resolved_at datetime(6), resolved_by longtext, resolved_issuer longtext,
    primary key (plant_id,order_id,id), unique(plant_id,order_id,receipt_id,revision),
    foreign key(plant_id,order_id,receipt_id) references finished_kit_receipt(plant_id,order_id,request_id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
alter table production_order add closed_at datetime(6), add closed_by longtext, add closed_issuer longtext, add closure_reason varchar(500);
alter table stock_reservation add relinquished decimal(18,6) not null default 0,
    add check(relinquished >= 0 and relinquished+consumed <= quantity);
