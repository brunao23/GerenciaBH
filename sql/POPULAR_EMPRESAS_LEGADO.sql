-- 🚨 POPULAR TABELA DE EMPRESAS COM UNIDADES LEGADO
-- Execute para que Vox BH, SP, etc apareçam no Admin

INSERT INTO public.empresas (nome, schema_name, status, created_at)
VALUES
('Vox Belo Horizonte', 'vox_bh', 'ativo', NOW()),
('Vox Espírito Santo', 'vox_es', 'ativo', NOW()),
('Vox Maceió', 'vox_maceio', 'ativo', NOW()),
('Vox Marília', 'vox_marilia', 'ativo', NOW()),
('Vox Piauí', 'vox_piaui', 'ativo', NOW()),
('Vox São Paulo', 'vox_sp', 'ativo', NOW()),
('Vox Rio de Janeiro', 'vox_rio', 'ativo', NOW()),
('Bia Vox', 'bia_vox', 'ativo', NOW()),
('Colégio Progresso', 'colegio_progresso', 'ativo', NOW())
ON CONFLICT (schema_name) DO UPDATE SET status = 'ativo';

-- Cria credenciais vazias para cada empresa, para permitir edição futura
INSERT INTO public.empresa_credenciais (empresa_id, n8n_api_key)
SELECT id, '' 
FROM public.empresas e
WHERE NOT EXISTS (SELECT 1 FROM public.empresa_credenciais ec WHERE ec.empresa_id = e.id);

-- Confirma inserção
SELECT * FROM public.empresas;
