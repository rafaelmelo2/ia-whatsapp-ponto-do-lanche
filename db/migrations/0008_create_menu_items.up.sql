-- Menu items: cardápio interno (CRUD). Só usado quando tenant.cardapio_source =
-- 'internal'; tenants com fonte externa usam catalog_api_url.
CREATE TABLE menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  base_price numeric(10, 2) NOT NULL,
  category text,
  active boolean NOT NULL DEFAULT true,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_items_tenant_id ON menu_items (tenant_id);
CREATE INDEX idx_menu_items_active ON menu_items (tenant_id, active);
CREATE INDEX idx_menu_items_category ON menu_items (tenant_id, category);
