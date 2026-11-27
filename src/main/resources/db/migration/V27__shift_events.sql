-- Read model. Access to each event follows the source module grant and the factory scope.
create view shift_event as
select plant_id,'production.read' as grant_name,'order' as kind,id as source_id,id as order_id,
    product_name as label,created_at as occurred_at,1 as quantity,'OS' as unit,null as commercial_date from production_order
union all
select r.plant_id,'production.read','stage',r.request_id,r.order_id,
    concat(o.product_name,' · ',json_unquote(json_extract(o.pieces,concat('$[',r.piece_index,'].name'))),' · ',
        json_unquote(json_extract(o.pieces,concat('$[',r.piece_index,'].steps[',r.step_index,']')))),
    r.occurred_at,r.quantity,'peças',null from production_stage_report r join production_order o on o.plant_id=r.plant_id and o.id=r.order_id
union all
select r.plant_id,'production.read','finished',r.request_id,r.order_id,o.product_name,r.received_at,r.quantity,'kits',null
    from finished_kit_receipt r join production_order o on o.plant_id=r.plant_id and o.id=r.order_id
union all
select c.plant_id,'production.read','finished',c.id,c.order_id,concat(o.product_name,' · ',c.reason),coalesce(c.resolved_at,c.created_at),
    c.counted-c.prior,'kits',null from kit_correction c join production_order o on o.plant_id=c.plant_id and o.id=c.order_id where c.state='applied'
union all
select s.plant_id,'sales.read','sale',s.request_id,null,concat(i.name,' · ',s.channel),s.created_at,s.quantity,'kits',s.sale_date
    from product_sale s join item i on i.id=s.product_id
union all
select p.plant_id,'purchases.read','purchase',p.id,null,concat(i.name,' · ',p.supplier),p.created_at,p.amount,'R$',p.purchase_date
    from material_purchase p join item i on i.id=p.material_id
union all
select p.plant_id,'purchases.read','purchase',s.request_id,null,concat('Estorno · ',i.name,' · ',p.supplier),s.occurred_at,-p.amount,'R$',null
    from material_purchase p join item i on i.id=p.material_id join stock_movement s on s.plant_id=p.plant_id and s.source_id=p.movement_id;
