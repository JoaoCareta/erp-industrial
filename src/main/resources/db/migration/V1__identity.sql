-- Use exact comparison for identifiers, including OIDC issuer and subject.
create table business_group (
    id varchar(255) primary key, name longtext not null
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
create table plant (
    id varchar(255) primary key, group_id varchar(255) not null, name longtext not null,
    unique(group_id,id), unique(group_id,name),
    foreign key(group_id) references business_group(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
create table sector (
    plant_id varchar(255) not null, id varchar(255) not null, name longtext not null,
    primary key(plant_id,id), foreign key(plant_id) references plant(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
create table account (
    id uuid primary key, group_id varchar(255) not null,
    issuer longtext not null, subject longtext not null, name longtext not null,
    active boolean not null default true check(active in (0,1)),
    unique(issuer,subject), unique(group_id,id),
    foreign key(group_id) references business_group(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
create table team_member (
    group_id varchar(255) not null, plant_id varchar(255) not null,
    sector_id varchar(255) not null, account_id uuid not null,
    primary key(plant_id,sector_id,account_id),
    foreign key(group_id,plant_id) references plant(group_id,id),
    foreign key(plant_id,sector_id) references sector(plant_id,id),
    foreign key(group_id,account_id) references account(group_id,id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
create table job_role (
    id varchar(191) primary key, name longtext not null
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
create table role_action (
    role_id varchar(191) not null, action varchar(255) not null,
    primary key(role_id,action), foreign key(role_id) references job_role(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
create table assignment (
    group_id varchar(255) not null, account_id uuid not null, role_id varchar(191) not null,
    plant_id varchar(255), sector_id varchar(255),
    check(sector_id is null or plant_id is not null),
    -- Encode NULL separately from every possible ID so broad grants are unique too.
    plant_scope varchar(256) as (if(plant_id is null,'0',concat('1',plant_id))) persistent,
    sector_scope varchar(256) as (if(sector_id is null,'0',concat('1',sector_id))) persistent,
    unique(account_id,role_id,plant_scope,sector_scope),
    foreign key(role_id) references job_role(id),
    foreign key(group_id,account_id) references account(group_id,id),
    foreign key(group_id,plant_id) references plant(group_id,id),
    foreign key(plant_id,sector_id) references sector(plant_id,id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
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
    id bigint auto_increment primary key, occurred_at datetime(6) not null default (utc_timestamp(6)),
    actor longtext not null, action longtext not null, target longtext not null, result longtext not null,
    reason longtext not null, correlation uuid not null
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_nopad_bin;
insert into job_role values ('leader','Líder'),('manager','Gerente de unidade'),('regional','Gerente regional'),
('admin','Administrador do grupo'),('operator','Operador');
insert into role_action values ('leader','team.read'),('manager','team.read'),('manager','engineering.read'),
('regional','team.read'),('regional','engineering.read'),('admin','team.read'),('admin','engineering.read'),
('admin','engineering.edit'),('admin','engineering.publish'),('admin','account.suspend');
