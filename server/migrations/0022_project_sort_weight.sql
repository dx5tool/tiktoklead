-- Where a project sits in a list: lower first, equal weights by name.
-- Existing projects get 0, which keeps today's name order.
ALTER TABLE projects ADD COLUMN sort_weight INT NOT NULL DEFAULT 0 CHECK (sort_weight >= 0);
