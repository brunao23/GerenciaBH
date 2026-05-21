-- Enable per-tenant toggle for automatic first-message dispatch on Meta leads.
ALTER TABLE public.meta_lead_pages
  ADD COLUMN IF NOT EXISTS auto_welcome_enabled BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.meta_lead_pages
SET auto_welcome_enabled = TRUE
WHERE auto_welcome_enabled IS NULL;
