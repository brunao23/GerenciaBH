import bcrypt from 'bcryptjs'

async function generateHash() {
    const password = 'mudar123'
    const hash = await bcrypt.hash(password, 10)
    console.log('Senha:', password)
    console.log('Hash:', hash)

    // Testar verificação
    const isValid = await bcrypt.compare(password, hash)
    console.log('Verificação:', isValid ? 'OK' : 'FALHOU')
}

generateHash()
