# Store Credentials Checklist (Play Store + Apple)

Projeto mobile: `mobile/`

## Android (Play Store)

1. Keystore ja configurado localmente para build:
   - `mobile/credentials/android-upload-keystore.jks`
   - `mobile/credentials.json`
2. Para submit automatico no Google Play, adicione:
   - `mobile/credentials/google-play-service-account.json`
3. O profile `submit.production.android` em `mobile/eas.json` ja aponta para esse arquivo.

## iOS (App Store Connect)

1. Adicione em `mobile/credentials/`:
   - `AuthKey_XXXXXXXXXX.p8`
2. Edite `mobile/eas.json` e substitua:
   - `YOUR_ASC_KEY_ID`
   - `YOUR_ASC_ISSUER_ID`
3. O profile `submit.production.ios` ficara pronto para `eas submit`.

## Comandos

Builds:

```bash
cd mobile
npx eas-cli build --platform android --profile production
npx eas-cli build --platform ios --profile production
```

Submit:

```bash
cd mobile
npx eas-cli submit --platform android --profile production
npx eas-cli submit --platform ios --profile production
```
