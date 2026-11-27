-- The demo admin exercises the director's release action. Real assignments are plant decisions.
insert into role_action(role_id,action) values
    ('admin','production.read'), ('admin','production.create'), ('admin','production.release'),
    ('regional','production.read');
