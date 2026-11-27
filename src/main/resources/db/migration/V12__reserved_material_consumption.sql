alter table stock_reservation
    add column consumed decimal(18,6) not null default 0,
    add constraint stock_reservation_consumed check (consumed >= 0 and consumed <= quantity);

-- V7's only CHECK was assigned CONSTRAINT_1 by MariaDB. Replace it in the same ALTER
-- so the existing movement history remains valid and every new consumption has an origin.
alter table stock_movement
    drop constraint CONSTRAINT_1,
    modify column kind varchar(16) not null,
    add column order_id uuid null,
    add column report_id uuid null,
    add unique key stock_report_movement (plant_id, order_id, report_id),
    add constraint stock_consumption_reservation foreign key (plant_id, material_id, order_id)
        references stock_reservation(plant_id, material_id, order_id),
    add constraint stock_movement_kind check (
        (kind in ('opening','receipt') and quantity > 0 and source_id is null and order_id is null and report_id is null)
        or (kind = 'reversal' and quantity < 0 and source_id is not null and order_id is null and report_id is null)
        or (kind = 'consumption' and quantity < 0 and source_id is null and order_id is not null and report_id is not null)
    );
