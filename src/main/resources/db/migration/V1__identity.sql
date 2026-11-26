create table business_group (id text primary key, name text not null);
create table plant (
    id text primary key, group_id text not null references business_group,
    name text not null, unique(group_id,id), unique(group_id,name)
);
create table sector (
    plant_id text references plant, id text, name text not null, primary key(plant_id,id)
);
create table account (
    id uuid primary key, group_id text not null references business_group,
    issuer text not null, subject text not null, name text not null,
    active boolean not null default true, unique(issuer,subject), unique(group_id,id)
);
create table team_member (
    group_id text not null, plant_id text not null, sector_id text not null, account_id uuid not null,
    primary key(plant_id,sector_id,account_id), foreign key(group_id,plant_id) references plant(group_id,id),
    foreign key(plant_id,sector_id) references sector, foreign key(group_id,account_id) references account(group_id,id)
);
create table job_role (id text primary key, name text not null);
create table role_action (role_id text references job_role, action text, primary key(role_id,action));
create table assignment (
    group_id text not null, account_id uuid not null, role_id text not null references job_role,
    plant_id text, sector_id text, check(sector_id is null or plant_id is not null),
    unique nulls not distinct(account_id,role_id,plant_id,sector_id),
    foreign key(group_id,account_id) references account(group_id,id),
    foreign key(group_id,plant_id) references plant(group_id,id),
    foreign key(plant_id,sector_id) references sector
);
-- Expand group assignments only within their own group. Regional responsibility
-- is represented by one assignment per authorized plant.
create view effective_role as
select a.id as account_id,a.issuer,a.subject,p.group_id,p.id as plant_id,
       b.sector_id,b.role_id,b.plant_id is null as group_wide
from account a join assignment b on b.account_id=a.id
join plant p on p.group_id=b.group_id and (b.plant_id is null or b.plant_id=p.id)
where a.active;
create view effective_action as
select r.*,ra.action from effective_role r join role_action ra on ra.role_id=r.role_id
where ra.action not in ('engineering.edit','engineering.publish','account.suspend') or r.group_wide;
create table access_audit (
    id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
    actor text not null, action text not null, target text not null, result text not null,
    reason text not null, correlation uuid not null
);
insert into job_role values ('leader','Líder'),('manager','Gerente de unidade'),('regional','Gerente regional'),
('admin','Administrador do grupo'),('operator','Operador');
insert into role_action values ('leader','team.read'),('manager','team.read'),('manager','engineering.read'),
('regional','team.read'),('regional','engineering.read'),('admin','team.read'),('admin','engineering.read'),
('admin','engineering.edit'),('admin','engineering.publish'),('admin','account.suspend');
