insert into sector values ('corte','Corte'),('pintura','Pintura');
insert into account (id, issuer, subject, name, sector_id) values
('00000000-0000-4000-8000-000000000001','${issuer}','00000000-0000-4000-8000-000000000001','Ana','corte'),
('00000000-0000-4000-8000-000000000002','${issuer}','00000000-0000-4000-8000-000000000002','Administrador',null),
('00000000-0000-4000-8000-000000000003','${issuer}','00000000-0000-4000-8000-000000000003','Bia','pintura');
insert into entitlement values ('00000000-0000-4000-8000-000000000001','team.read','corte');
insert into entitlement select '00000000-0000-4000-8000-000000000002'::uuid, action, '*' from
unnest(array['account.suspend','engineering.read','engineering.edit','engineering.publish','team.read']) as action;
