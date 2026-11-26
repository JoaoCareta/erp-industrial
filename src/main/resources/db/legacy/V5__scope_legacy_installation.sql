-- Only the explicitly selected single-group demo has a known ownership map.
do $$
begin
    if exists (select from item) and '${legacyCatalogGroup}' <> 'mundo-eduk' then
        raise exception 'Confirme o grupo de origem do catálogo antes da atualização';
    end if;
    if exists (select from account where id::text not in
        ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003')
        or issuer <> '${issuer}' or subject <> id::text)
        or exists (select from sector where id not in ('corte','pintura')) then
        raise exception 'Contas ou setores sem mapeamento de grupo e unidade';
    end if;
end $$;
create schema legacy_access;
alter table sector set schema legacy_access;
alter table account set schema legacy_access;
alter table entitlement set schema legacy_access;
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
insert into job_role values ('leader','Líder'),('manager','Gerente de unidade'),('regional','Gerente regional'),
('admin','Administrador do grupo'),('operator','Operador');
insert into role_action values ('leader','team.read'),('manager','team.read'),('manager','engineering.read'),
('regional','team.read'),('regional','engineering.read'),('admin','team.read'),('admin','engineering.read'),
('admin','engineering.edit'),('admin','engineering.publish'),('admin','account.suspend');

insert into business_group select 'mundo-eduk','Mundo Eduk'
where exists(select from legacy_access.account) or exists(select from legacy_access.sector) or exists(select from item);
insert into plant select 'eduk',id,'Mundo Eduk' from business_group;
insert into sector select 'eduk',id,name from legacy_access.sector;
insert into account select id,'mundo-eduk',issuer,subject,name,active from legacy_access.account;
insert into team_member select 'mundo-eduk','eduk',sector_id,id from legacy_access.account where sector_id is not null;

-- Only map exact grants. A partial or additional grant requires an explicit decision.
insert into assignment
select 'mundo-eduk',a.id,'leader','eduk','corte' from account a
where a.id='00000000-0000-4000-8000-000000000001' and exists (
    select from legacy_access.entitlement where account_id=a.id and action='team.read' and scope='corte');
insert into assignment
select 'mundo-eduk',a.id,'admin',null,null from account a
where a.id='00000000-0000-4000-8000-000000000002' and
    (select count(*) from legacy_access.entitlement where account_id=a.id and scope='*'
        and action in ('team.read','engineering.read','engineering.edit','engineering.publish'))=4;
do $$
begin
    if exists(select from legacy_access.entitlement e where not exists(
        select from assignment a join role_action r on r.role_id=a.role_id
        where a.account_id=e.account_id and r.action=e.action
          and coalesce(a.sector_id,'*')=e.scope)) then
        raise exception 'Concessão antiga sem mapeamento exato';
    end if;
end $$;
delete from role_action where role_id='admin' and action='account.suspend';
drop table legacy_access.entitlement, legacy_access.account, legacy_access.sector;
drop schema legacy_access;

alter table item add column group_id text references business_group;
update item set group_id='mundo-eduk' where group_id is null;
alter table item alter column group_id set not null;
alter table item drop constraint item_kind_code_key, drop constraint item_category_id_fkey, drop constraint item_unit_id_fkey;
alter table item add unique(group_id,kind,code), add unique(group_id,id);
alter table item add foreign key(group_id,category_id) references item(group_id,id),
                 add foreign key(group_id,unit_id) references item(group_id,id);
