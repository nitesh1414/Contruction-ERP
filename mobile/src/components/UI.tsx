import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, STATUS_COLORS } from '../theme';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 10, marginTop: 6 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Badge({ status, label }: { status: string; label?: string }) {
  const palette = STATUS_COLORS[status] || { bg: colors.border, fg: colors.textSoft };
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>{(label || status).replace(/_/g, ' ')}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
}) {
  const bg =
    variant === 'primary' ? colors.brand : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.navy : 'transparent';
  const fg = variant === 'ghost' ? colors.brand : '#fff';
  return (
    <TouchableOpacity
      style={[
        styles.button,
        small && { paddingVertical: 7, paddingHorizontal: 12 },
        { backgroundColor: bg, borderWidth: variant === 'ghost' ? 1 : 0, borderColor: colors.brand },
        (disabled || loading) && { opacity: 0.55 },
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : <Text style={[styles.buttonText, { color: fg }, small && { fontSize: 13 }]}>{title}</Text>}
    </TouchableOpacity>
  );
}

export function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

export function Input(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={colors.textFaint} {...props} style={[styles.input, props.style]} />;
}

interface PickerOption {
  value: string | number;
  label: string;
}

/** Simple modal-based picker (no native dependency needed). */
export function PickerField({
  value,
  options,
  onChange,
  placeholder = 'Select…',
}: {
  value: string | number | null;
  options: PickerOption[];
  onChange: (value: string | number | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => String(o.value) === String(value));
  return (
    <>
      <TouchableOpacity style={styles.pickerButton} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Text style={{ color: selected ? colors.text : colors.textFaint, fontSize: 14, flex: 1 }} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={{ color: colors.textFaint }}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.pickerSheet}>
              <ScrollView style={{ maxHeight: 380 }}>
                <TouchableOpacity
                  style={styles.pickerOption}
                  onPress={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Text style={{ color: colors.textFaint, fontSize: 14 }}>— None —</Text>
                </TouchableOpacity>
                {options.map((o) => (
                  <TouchableOpacity
                    key={String(o.value)}
                    style={[styles.pickerOption, String(o.value) === String(value) && { backgroundColor: colors.brandSoft }]}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 14 }}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 44 }}>
      <Text style={{ fontSize: 34, marginBottom: 8 }}>🗂️</Text>
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSoft }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: 13, color: colors.textFaint, marginTop: 4, textAlign: 'center' }}>{subtitle}</Text> : null}
    </View>
  );
}

export function StatTile({ label, value, accent, onPress }: { label: string; value: string | number; accent?: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.statTile} onPress={onPress} disabled={!onPress} activeOpacity={0.85}>
      <Text style={[styles.statValue, { color: accent || colors.navy }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 10 }}>{message}</Text>;
}

export function LoadingBlock() {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center' }}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  sectionSubtitle: { fontSize: 12.5, color: colors.textFaint, marginTop: 2 },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 14.5, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSoft, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(15,27,45,0.45)', justifyContent: 'center', padding: 28 },
  pickerSheet: { backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden' },
  pickerOption: { paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  statTile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: colors.textFaint, marginTop: 3, textAlign: 'center' },
});
