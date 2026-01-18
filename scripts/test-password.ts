import bcrypt from 'bcryptjs'

const password = 'mudar123'
const hashFromDB = '$2b$10$6xRT.d6ggFrPyyQZImXfSe.NVS1lWDKJBDPfRaQj/.67x2NYOE.Z.'

async function testPassword() {
    console.log('='.repeat(50))
    console.log('TESTE DE SENHA')
    console.log('='.repeat(50))
    console.log('')
    console.log('Senha testada:', password)
    console.log('Hash do banco:', hashFromDB)
    console.log('')

    const isValid = await bcrypt.compare(password, hashFromDB)

    console.log('Resultado:', isValid ? '✅ SENHA VÁLIDA' : '❌ SENHA INVÁLIDA')
    console.log('')

    if (isValid) {
        console.log('✅ A senha "mudar123" está correta!')
        console.log('✅ O problema pode estar no banco de dados')
        console.log('')
        console.log('Execute no Supabase:')
        console.log('  verificar_e_atualizar_senhas.sql')
    } else {
        console.log('❌ Hash incorreto!')
        console.log('')
        console.log('Gerando novo hash...')
        const newHash = await bcrypt.hash(password, 10)
        console.log('Novo hash:', newHash)
    }

    console.log('')
    console.log('='.repeat(50))
}

testPassword()
