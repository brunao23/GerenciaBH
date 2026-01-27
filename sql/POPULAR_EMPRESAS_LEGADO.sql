-- 🚨 POPULAR TABELA DE EMPRESAS COM UNIDADES LEGADO
-- Execute para que Vox BH, SP, etc apareçam no Admin

INSERT INTO public.empresas (nome, schema, ativo, created_at)
VALUES
('Vox Belo Horizonte', 'vox_bh', true, NOW()),
('Vox Espírito Santo', 'vox_es', true, NOW()),
('Vox Maceió', 'vox_maceio', true, NOW()),
('Vox Marília', 'vox_marilia', true, NOW()),
('Vox Piauí', 'vox_piaui', true, NOW()),
('Vox São Paulo', 'vox_sp', true, NOW()),
('Vox Rio de Janeiro', 'vox_rio', true, NOW()),
('Bia Vox', 'bia_vox', true, NOW()),
('Colégio Progresso', 'colegio_progresso', true, NOW())
ON CONFLICT (schema) DO UPDATE SET ativo = true;

-- Cria credenciais vazias para cada empresa, para permitir edição futura
INSERT INTO public.empresa_credenciais (empresa_id)
SELECT id
FROM public.empresas e
WHERE NOT EXISTS (SELECT 1 FROM public.empresa_credenciais ec WHERE ec.empresa_id = e.id);

-- Confirma inserção
SELECT * FROM public.empresas;
