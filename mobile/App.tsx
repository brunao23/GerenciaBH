import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { WebView, WebViewNavigation } from "react-native-webview";

const DEFAULT_WEB_APP_URL = "https://gerencia.vox.geniallabs.com.br/login";

function resolveAppUrl(): string {
  const raw = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim();
  if (!raw) return DEFAULT_WEB_APP_URL;
  try {
    const parsed = new URL(raw);
    return parsed.toString();
  } catch {
    return DEFAULT_WEB_APP_URL;
  }
}

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const appUrl = useMemo(() => resolveAppUrl(), []);
  const baseHost = useMemo(() => new URL(appUrl).host, [appUrl]);

  const [canGoBack, setCanGoBack] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const nextConnected = Boolean(state.isInternetReachable ?? state.isConnected);
      setIsConnected(nextConnected);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const backAction = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => subscription.remove();
  }, [canGoBack]);

  const handleNavigationChange = (state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
  };

  const handleRetry = () => {
    setLoadError(null);
    setReloadKey((value) => value + 1);
  };

  if (!isConnected) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.centered}>
          <Text style={styles.title}>Sem conexao</Text>
          <Text style={styles.subtitle}>Conecte a internet para abrir o painel.</Text>
          <Pressable style={styles.primaryButton} onPress={handleRetry}>
            <Text style={styles.primaryButtonText}>Tentar novamente</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Text style={styles.brand}>GerenciaBH Mobile</Text>
        <Pressable style={styles.reloadButton} onPress={handleRetry}>
          <Text style={styles.reloadText}>Recarregar</Text>
        </Pressable>
      </View>

      {loadError ? (
        <View style={styles.centered}>
          <Text style={styles.title}>Falha ao carregar</Text>
          <Text style={styles.subtitle}>{loadError}</Text>
          <Pressable style={styles.primaryButton} onPress={handleRetry}>
            <Text style={styles.primaryButtonText}>Reabrir app</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          key={reloadKey}
          ref={webViewRef}
          source={{ uri: appUrl }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#f5b700" />
              <Text style={styles.loadingText}>Carregando plataforma...</Text>
            </View>
          )}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          onNavigationStateChange={handleNavigationChange}
          onHttpError={(event) => {
            setLoadError(`Erro HTTP ${event.nativeEvent.statusCode}`);
          }}
          onError={(event) => {
            const description = event.nativeEvent.description || "Nao foi possivel abrir a plataforma.";
            setLoadError(description);
          }}
          onShouldStartLoadWithRequest={(request) => {
            if (!request.url) return false;
            try {
              const parsed = new URL(request.url);
              const allowedProtocol = parsed.protocol === "http:" || parsed.protocol === "https:";
              if (!allowedProtocol) {
                Linking.openURL(request.url).catch(() => undefined);
                return false;
              }
              const isInternal = parsed.host === baseHost;
              if (isInternal) return true;
              Linking.openURL(request.url).catch(() => undefined);
              return false;
            } catch {
              return false;
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#090d14",
  },
  topBar: {
    height: 54,
    borderBottomWidth: 1,
    borderBottomColor: "#1c2433",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    backgroundColor: "#0f1724",
  },
  brand: {
    color: "#e6edf7",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  reloadButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#f5b700",
  },
  reloadText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#090d14",
  },
  loadingText: {
    marginTop: 10,
    color: "#c8d1df",
    fontSize: 14,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#090d14",
  },
  title: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 18,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: "#f5b700",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
});
