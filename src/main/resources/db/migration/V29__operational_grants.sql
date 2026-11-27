create table operational_action (
    action varchar(255) primary key
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
insert into operational_action(action) values
    ('production.read'),
    ('production.create'),
    ('production.release'),
    ('production.report'),
    ('production.receive'),
    ('production.correct'),
    ('production.close'),
    ('stock.read'),
    ('stock.write'),
    ('sales.read'),
    ('sales.write'),
    ('purchases.read'),
    ('purchases.write'),
    ('outsourcing.read'),
    ('outsourcing.write'),
    ('planning.read'),
    ('planning.write'),
    ('costs.read'),
    ('dashboard.read'),
    ('access.operations');
create table operational_grant (
    group_id varchar(255) not null, plant_id varchar(255) not null, account_id uuid not null,
    action varchar(255) not null, enabled boolean not null, primary key(plant_id,account_id,action),
    foreign key(group_id,plant_id) references plant(group_id,id),foreign key(group_id,account_id) references account(group_id,id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
create or replace view effective_action as
select r.*,ra.action from effective_role r join role_action ra on ra.role_id=r.role_id
where (ra.action not in ('engineering.edit','engineering.publish','account.suspend') or r.group_wide)
and not exists(select 1 from operational_grant g where g.plant_id=r.plant_id and g.account_id=r.account_id and g.action=ra.action and not g.enabled)
union
select r.account_id,r.issuer,r.subject,r.group_id,r.plant_id,null,r.role_id,false,g.action
from effective_role r join operational_grant g on g.account_id=r.account_id and g.plant_id=r.plant_id where g.enabled
union
select r.account_id,r.issuer,r.subject,r.group_id,r.plant_id,r.sector_id,r.role_id,r.group_wide,op.action
from effective_role r cross join operational_action op where r.role_id='admin' and r.sector_id is null;

create table operational_decision (
    plant_id varchar(255) not null, request_id uuid not null, account_id uuid not null,
    action varchar(255) not null, enabled boolean not null, reason varchar(500) not null,
    primary key(plant_id,request_id), foreign key(plant_id) references plant(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
