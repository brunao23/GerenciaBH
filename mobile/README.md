# GerenciaBH Mobile (Expo)

App mobile baseado em Expo/React Native, usando o painel web da plataforma dentro de um shell nativo com:

- carregamento via `WebView`
- deteccao de offline
- recarga manual
- suporte a botao voltar (Android)
- abertura de links externos fora do app

## 1) Requisitos

- Node.js 20+
- npm
- Expo Go (Android/iOS) para testes rapidos

## 2) Configuracao

1. Crie um `.env` local a partir de `.env.example`.
2. Ajuste `EXPO_PUBLIC_WEB_APP_URL` para sua URL oficial do painel.

Exemplo:

```env
EXPO_PUBLIC_WEB_APP_URL=https://gerencia.vox.geniallabs.com.br/login
```

## 3) Rodar local

```bash
cd mobile
npm install
npm run start
```

Atalhos:

- `a` abre Android
- `i` abre iOS (macOS)
- `w` abre web

## 4) Build para loja (EAS)

```bash
cd mobile
npx expo login
npx eas build --platform android --profile production
npx eas build --platform ios --profile production
```

## 4.1) Credenciais de publicacao (Play Store + Apple)

Arquivos esperados em `mobile/credentials/`:

- `android-upload-keystore.jks` (assinatura Android)
- `google-play-service-account.json` (Play Console API)
- `AuthKey_XXXXXXXXXX.p8` (App Store Connect API Key)

Configuracao de submit ja pronta em `mobile/eas.json`:

- Android: `serviceAccountKeyPath` + track `production`
- iOS: `ascApiKeyPath`, `ascApiKeyId`, `ascApiKeyIssuerId`

Substitua os placeholders do iOS antes do submit.

Antes de build de producao, revise no `mobile/app.json`:

- `android.package`
- `ios.bundleIdentifier`
- icones/splash

## 5) Observacoes

- Sessao/autenticacao continuam no backend atual (Next.js).
- O app mobile nao exige duplicar APIs.
- Para recursos nativos adicionais (push, camera, biometria), evolua o shell com novos modulos Expo.
