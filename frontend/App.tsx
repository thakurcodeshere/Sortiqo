import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, Switch, SafeAreaView, ActivityIndicator, Pressable, Platform, TouchableOpacity } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

// Task 1: Mount the browser environment handler required for Expo Auth Handshakes
WebBrowser.maybeCompleteAuthSession();

interface Sender {
  id: string;
  name: string;
  domain: string;
  emailCount: number;
  category: 'ORGANIZATION' | 'SERVICE';
  isUnsubscribed: boolean;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [senders, setSenders] = useState<Sender[]>([]);

  // --------------------------------------------------------------------------
  // TASK 1 CONSTRAINT: TAKE PERMISSION FROM USER
  // --------------------------------------------------------------------------
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: 'ENTER_YOUR_CLIENT_ID_HERE.apps.googleusercontent.com',
    iosClientId: 'ENTER_YOUR_IOS_ID_HERE.apps.googleusercontent.com',
    androidClientId: 'ENTER_YOUR_ANDROID_ID_HERE.apps.googleusercontent.com',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly', 
      'https://www.googleapis.com/auth/gmail.modify'
    ],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      if (authentication?.accessToken) {
        setIsAuthenticated(true);
        setLoading(true);
        
        console.log("Token securely generated. Starting backend execution.");
        triggerLiveBackendIngestion(authentication.accessToken);
      }
    }
  }, [response]);

  // TASK 2 IMPLEMENTATION: Hit the Express API which executes our gmail.ts integration
  const triggerLiveBackendIngestion = async (token: string) => {
    try {
      // 1. Dispatch AccessToken to Backend -> Triggers 'googleapis' integration (Task 2)
      await fetch('http://localhost:3000/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token, userId: 'demo_user' })
      });

      // 2. Fetch the newly populated Sender Sequence Table (Task 4)
      const res = await fetch('http://localhost:3000/api/senders?limit=100');
      const data = await res.json();
      
      setSenders(data.senders || []);
    } catch (e) {
      console.error("Backend Connection Error:", e);
      // Fallback for UI demonstration if node server is offline
      setSenders([
        { id: 'err', name: 'Backend Engine Offline', domain: 'localhost:3000', emailCount: 0, category: 'SERVICE', isUnsubscribed: false }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async (id: string, currentlyUnsubscribed: boolean) => {
    // Optimistic UI state mapping 
    setSenders(prev => prev.map(s => s.id === id ? { ...s, isUnsubscribed: !currentlyUnsubscribed } : s));
    
    // TASK 5 IMPLEMENTATION: Dispatch the background BullMQ worker
    try {
      await fetch(`http://localhost:3000/api/senders/${id}/unsubscribe`, { method: 'POST' });
    } catch(e) {
      console.error("Failed to queue unsubscribe task", e);
    }
  };

  // UI STATE: Task 1 - Requesting Permission Display
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.glowOrb1} />
        <View style={styles.glowOrb2} />
        <View style={styles.glowOrb3} />

        <View style={styles.authCenter}>
          <Text style={styles.title}>SORTIQO</Text>
          <Text style={styles.subtitle}>Supercharge your inbox density.</Text>
          
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>Inbox Access Permission</Text>
            <Text style={styles.authDesc}>
              Sortiqo needs authorization to securely scan your read emails. We utilize live OAuth 2.0 via Google to organize senders and execute fast, 1-click unsubscribes.
            </Text>
            
            {loading ? (
              <View style={styles.loadingWrapper}>
                <ActivityIndicator size="large" color="#00E5FF" />
                <Text style={styles.authWaitText}>Authenticating with Google OAuth...</Text>
              </View>
            ) : (
              <View style={{ width: '100%', gap: 12 }}>
                <TouchableOpacity activeOpacity={0.8} style={styles.connectButton} disabled={!request} onPress={() => promptAsync()}>
                  <Text style={styles.connectButtonText}>Grant Google Access</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.8} style={[styles.connectButton, { backgroundColor: 'rgba(0, 229, 255, 0.05)', borderWidth: 1, borderColor: '#00E5FF', paddingVertical: 12 }]} onPress={() => { setLoading(true); triggerLiveBackendIngestion('MOCK_GMAIL_ACCESS_TOKEN_XYZ123'); setIsAuthenticated(true); }}>
                  <Text style={[styles.connectButtonText, { color: '#00E5FF', fontSize: 14 }]}>Skip Google Web Popup (Staging Bypass)</Text>
                </TouchableOpacity>
              </View>
            )}
            
            <Text style={styles.authDisclaimer}>
              Data Privacy Guaranteed: We strictly query standard protocol metadata headers via the Gmail API.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // UI STATE: Task 2 to Task 5 - Active Authenticated Dashboard
  const renderItem = ({ item }: { item: Sender }) => (
    <Pressable style={({ hovered }: any) => [
      styles.card,
      hovered && styles.cardHovered,
      item.isUnsubscribed && styles.cardUnsub
    ]}>
      <View style={styles.leftCol}>
        <Text style={[styles.senderName, item.isUnsubscribed && styles.textMuted]}>{item.name}</Text>
        <Text style={[styles.senderDomain, item.isUnsubscribed && styles.textMuted]}>
          {item.domain}  •  <Text style={item.category === 'SERVICE' ? styles.catService : styles.catOrg}>{item.category}</Text>
        </Text>
      </View>
      
      <View style={styles.centerCol}>
        <View style={[styles.badge, item.isUnsubscribed && styles.badgeMuted]}>
          <Text style={[styles.badgeText, item.isUnsubscribed && styles.badgeTextMuted]}>
            {item.emailCount}
          </Text>
        </View>
      </View>
      
      <View style={styles.rightCol}>
        <Switch
          value={item.isUnsubscribed}
          onValueChange={() => handleUnsubscribe(item.id, item.isUnsubscribed)}
          trackColor={{ false: 'rgba(255,255,255,0.08)', true: '#FF007A' }}
            thumbColor={item.isUnsubscribed ? '#ffffff' : '#A0A0AB'}
            ios_backgroundColor="rgba(255,255,255,0.08)"
            // @ts-ignore
            style={Platform.OS === 'web' ? { cursor: 'pointer', transform: [{ scale: 1.2 }] } : { transform: [{ scale: 1.2 }] }}
        />
        <Text style={[styles.switchLabel, item.isUnsubscribed ? styles.labelUnsub : styles.labelSub]}>
          {item.isUnsubscribed ? 'T R A S H' : 'A C T I V E'}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.glowOrb1} />
      <View style={styles.glowOrb2} />
      <View style={styles.glowOrb3} />
      
      <View style={styles.header}>
        <Text style={styles.title}>SORTIQO</Text>
        <Text style={styles.subtitle}>Your Inbox, Mastered.</Text>
      </View>
      
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#00E5FF" />
          <Text style={styles.loaderText}>Ingesting Genuine Read Emails...</Text>
        </View>
      ) : (
        <FlatList
          data={senders}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#060608', 
    overflow: 'hidden'
  },
  glowOrb1: {
    position: 'absolute',
    top: -150,
    left: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: '#00E5FF',
    opacity: 0.12,
    // @ts-ignore
    filter: 'blur(80px)',
  },
  glowOrb2: {
    position: 'absolute',
    bottom: -200,
    right: -150,
    width: 600,
    height: 600,
    borderRadius: 300,
    backgroundColor: '#FF007A',
    opacity: 0.10,
    // @ts-ignore
    filter: 'blur(120px)',
  },
  glowOrb3: {
    position: 'absolute',
    top: '40%',
    left: '30%',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#7000FF',
    opacity: 0.08,
    // @ts-ignore
    filter: 'blur(90px)',
  },
  
  // -- Auth Screen Stylings --
  authCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10
  },
  authCard: {
    marginTop: 40,
    paddingVertical: 40,
    paddingHorizontal: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    // @ts-ignore
    backdropFilter: 'blur(30px)',
    maxWidth: 500,
    width: '100%',
    alignItems: 'center'
  },
  authTitle: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '800',
    marginBottom: 16
  },
  authDesc: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30
  },
  authWaitText: {
    marginTop: 20,
    color: '#00E5FF',
    fontWeight: '700',
    letterSpacing: 1
  },
  loadingWrapper: {
    paddingVertical: 10,
    alignItems: 'center'
  },
  connectButton: {
    backgroundColor: '#00E5FF',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 40,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
    width: '100%',
    alignItems: 'center'
  },
  connectButtonText: {
    color: '#060608',
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 0.5
  },
  authDisclaimer: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 30,
    lineHeight: 18
  },

  // -- Main Screen Stylings --
  header: { 
    padding: 30, 
    paddingTop: 80, 
    alignItems: 'center',
    marginBottom: 30,
    zIndex: 10
  },
  title: { 
    fontSize: 56, 
    fontWeight: '900', 
    color: '#FFFFFF',
    letterSpacing: -2,
    textShadowColor: 'rgba(0, 229, 255, 0.4)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 30,
  },
  subtitle: { 
    fontSize: 16, 
    color: 'rgba(255,255,255,0.6)', 
    marginTop: 12, 
    fontWeight: '500',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10
  },
  loaderText: {
    color: '#00E5FF',
    marginTop: 20,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  list: { 
    paddingHorizontal: 20, 
    paddingBottom: 80,
    maxWidth: 1000,
    alignSelf: 'center',
    width: '100%',
    zIndex: 10
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 30,
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    // @ts-ignore
    backdropFilter: 'blur(24px)',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 30,
    elevation: 8,
    transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' as any,
  },
  cardHovered: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(0, 229, 255, 0.4)',
    transform: [{ translateY: -4 }, { scale: 1.01 }],
    shadowOpacity: 0.15,
  },
  cardUnsub: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    shadowOpacity: 0,
    opacity: 0.6
  },
  leftCol: { 
    flex: 4, 
    paddingRight: 20 
  },
  senderName: { 
    fontSize: 22, 
    fontWeight: '800', 
    color: '#FFFFFF', 
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  textMuted: {
    color: '#4A4A55',
    textDecorationLine: 'line-through',
  },
  senderDomain: { 
    fontSize: 14, 
    color: '#8E8E93', 
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  catService: { color: '#00E5FF', fontWeight: '900' },
  catOrg: { color: '#FF007A', fontWeight: '900' },
  centerCol: { 
    flex: 1.5, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  badge: { 
    backgroundColor: 'rgba(0, 229, 255, 0.05)', 
    paddingHorizontal: 20, 
    paddingVertical: 8, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: 'rgba(0, 229, 255, 0.4)',
  },
  badgeMuted: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  badgeText: { 
    color: '#00E5FF', 
    fontWeight: '900', 
    fontSize: 16,
    letterSpacing: 1
  },
  badgeTextMuted: {
    color: '#4A4A55',
  },
  rightCol: { 
    flex: 1.5, 
    alignItems: 'flex-end', 
    justifyContent: 'center',
    minWidth: 120
  },
  switchLabel: {
    marginTop: 12,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  labelSub: { color: '#00E5FF', opacity: 0.8 },
  labelUnsub: { color: '#FF007A', opacity: 0.8 }
});
