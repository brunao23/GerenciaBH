# Mobile com Emergent.sh + Base Expo

Este projeto foi preparado com uma base mobile em `mobile/` (Expo + React Native).

## Como usar junto com Emergent

1. Mantenha este repositorio no GitHub.
2. No Emergent, use o fluxo de projeto conectado ao GitHub.
3. Direcione o agente para evoluir o app dentro da pasta `mobile/`.
4. Teste rapidamente no Expo Go e depois gere builds com EAS.

## Prompt sugerido para Emergent

```txt
Evolua o app da pasta mobile/ para producao.
Objetivo:
- manter WebView apontando para EXPO_PUBLIC_WEB_APP_URL
- adicionar push notifications por tenant
- adicionar login biometrico opcional
- criar fallback offline com cache local
- preparar release Android e iOS
Nao alterar backend sem criar rotas/migrations compativeis.
```

## Referencias oficiais usadas

- Tutorial oficial Emergent (menciona criacao de app mobile com React Native e Expo): https://www.emergent.sh/tutorial
- Help Center Emergent: https://help.emergent.sh/
- Expo docs (overview): https://docs.expo.dev/
- Expo docs (EAS Build): https://docs.expo.dev/build/introduction/
- Expo docs (app config): https://docs.expo.dev/workflow/configuration/
- React Native WebView: https://github.com/react-native-webview/react-native-webview
