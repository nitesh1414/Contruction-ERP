import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { errMsg } from '../api/client';
import { Button, ErrorText, Field, Input } from '../components/UI';
import { colors } from '../theme';
import { API_URL } from '../config';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.hero}>
        <View style={styles.logoMark}>
          <Text style={{ fontSize: 34 }}>🏗️</Text>
        </View>
        <Text style={styles.title}>Construction ERP</Text>
        <Text style={styles.subtitle}>Site progress, workforce & quality — in your pocket</Text>
      </View>

      <View style={styles.form}>
        <ErrorText message={error} />
        <Field label="Email" required>
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </Field>
        <Field label="Password" required>
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
          />
        </Field>
        <Button title="Sign In" onPress={submit} loading={busy} />
        <Text style={styles.apiHint}>Server: {API_URL}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy, justifyContent: 'center', padding: 24 },
  hero: { alignItems: 'center', marginBottom: 30 },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 25, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  subtitle: { fontSize: 13, color: '#9fb0c7', marginTop: 6, textAlign: 'center' },
  form: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
  },
  apiHint: { textAlign: 'center', color: colors.textFaint, fontSize: 11, marginTop: 14 },
});
