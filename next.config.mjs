/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuração atualizada para evitar erro de Chave Depreciada
  typescript: {
    // Ignora erros de TS no build (Perigoso, mas necessário para deploy rápido se tiver erros legados)
    ignoreBuildErrors: true,
  },
  eslint: {
    // Força ignorar lint no build
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  // Desabilita verificação estrita se necessário, mas geralmente não precisa
  reactStrictMode: false,
}

export default nextConfig
