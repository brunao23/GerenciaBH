-- Tabela para registrar as unidades ativas no sistema SaaS
CREATE TABLE IF NOT EXISTS public.saas_units (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL, -- Ex: "Vox BH"
    prefix text NOT NULL UNIQUE, -- Ex: "vox_bh" (usado nas tabelas)
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

-- Inserir as unidades existentes para não perder o acesso
INSERT INTO public.saas_units (name, prefix) VALUES 
('Vox BH', 'vox_bh'),
('Vox Maceió', 'vox_maceio'),
('Vox SP', 'vox_sp'),
('Colégio Progresso', 'colegio_progresso')
ON CONFLICT (prefix) DO NOTHING;
