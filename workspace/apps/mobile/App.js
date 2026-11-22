import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api, isRetryableApiError } from './src/services/api';
import { enqueuePending, listPending, removePending } from './src/services/offline-queue';
import { syncPendingActivity } from './src/services/offline-sync';
import * as healthConnect from './src/services/health-connect';
import { clearTokens, readTokens } from './src/services/secure-session';

const C = {
  ink: '#17231F', muted: '#718079', green: '#235B48', pale: '#E8F2EC',
  canvas: '#F6F7F3', white: '#FFFFFF', line: '#E7EBE6', red: '#A83E35', gold: '#9C7435',
};
const activityTypes = ['walking', 'running', 'cycling', 'strength', 'yoga', 'other'];

function createRecordId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function mergePendingItems(items, entry) {
  const withoutMatching = items.filter((item) => item.id !== entry.id
    && !(entry.type === 'steps' && item.type === 'steps' && item.localDate === entry.localDate));
  return [...withoutMatching, entry].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function stepSourceLabel(source) {
  return ({ manual: 'Manual entry', health_connect: 'Health Connect' })[source] || source;
}

function Button({ title, onPress, secondary = false, danger = false, disabled = false, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        danger && styles.dangerButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
        style,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText, danger && styles.dangerButtonText]}>{title}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize = 'sentences', multiline = false }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98A39C"
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
      />
    </View>
  );
}

function AuthScreen({ onAuthenticated, initialResetToken, onResetComplete }) {
  const [mode, setMode] = useState(initialResetToken ? 'reset' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState(initialResetToken || '');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const registering = mode === 'register';
  const requestingReset = mode === 'forgot';
  const resettingPassword = mode === 'reset';

  useEffect(() => {
    if (!initialResetToken) return;
    setResetToken(initialResetToken);
    setPassword('');
    setConfirmPassword('');
    setMode('reset');
  }, [initialResetToken]);

  async function submit() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (requestingReset) {
        await api.requestPasswordReset(email.trim());
        setNotice('If an account uses that email, reset instructions will be sent.');
        return;
      }
      if (resettingPassword) {
        if (password !== confirmPassword) {
          setError('The passwords do not match.');
          return;
        }
        await api.resetPassword({ token: resetToken.trim(), password });
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setResetToken('');
        onResetComplete();
        setNotice('Password updated. Sign in with your new password.');
        return;
      }
      const payload = { email: email.trim(), password };
      let user;
      if (registering) {
        let timeZone = 'UTC';
        try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_error) { /* keep UTC */ }
        user = await api.register({ ...payload, displayName: displayName.trim() || null, timeZone });
      } else {
        user = await api.login(payload);
      }
      onAuthenticated(user);
    } catch (requestError) {
      setError(requestError.message || 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.canvas} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.authPage} keyboardShouldPersistTaps="handled">
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>F</Text></View>
          <Text style={styles.eyebrow}>FITNESS ACTIVITY TRACKER</Text>
          <Text style={styles.authTitle}>{registering ? 'Start with one step.' : requestingReset ? 'Reset your password.' : resettingPassword ? 'Choose a new password.' : 'Welcome back.'}</Text>
          <Text style={styles.authSubtitle}>
            {registering ? 'Create your account to keep your activity in one place.' : requestingReset ? 'Enter your account email and we’ll send a reset code.' : resettingPassword ? 'Paste the code from your email and choose a new password.' : 'Sign in to see your activity and keep building your routine.'}
          </Text>

          <View style={styles.formCard}>
            {registering ? <Field label="Name (optional)" value={displayName} onChangeText={setDisplayName} placeholder="How should we address you?" /> : null}
            {!resettingPassword ? <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" /> : null}
            {resettingPassword ? <Field label="Reset code" value={resetToken} onChangeText={setResetToken} placeholder="Paste the reset code from your email" autoCapitalize="none" /> : null}
            {!requestingReset ? <Field label={resettingPassword ? 'New password' : 'Password'} value={password} onChangeText={setPassword} placeholder="At least 12 characters" secureTextEntry autoCapitalize="none" /> : null}
            {resettingPassword ? <Field label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Enter the new password again" secureTextEntry autoCapitalize="none" /> : null}
            {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
            {notice ? <Text accessibilityLiveRegion="polite" style={styles.resetNotice}>{notice}</Text> : null}
            <Button title={busy ? 'Please wait…' : registering ? 'Create account' : requestingReset ? 'Send reset code' : resettingPassword ? 'Update password' : 'Sign in'} disabled={busy} onPress={submit} style={styles.submitButton} />
            {requestingReset ? (
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setMode('reset'); setResetToken(''); setError(''); setNotice(''); }} style={styles.modeSwitch}>
                <Text style={styles.modeSwitchText}>I have a reset code</Text>
              </Pressable>
            ) : null}
            {!registering && mode === 'login' ? (
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setMode('forgot'); setError(''); setNotice(''); }} style={styles.modeSwitch}>
                <Text style={styles.modeSwitchText}>Forgot password?</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                if (resettingPassword) { setResetToken(''); onResetComplete(); }
                setMode(registering || requestingReset || resettingPassword ? 'login' : 'register');
                setError('');
                setNotice('');
              }}
              style={styles.modeSwitch}
            >
              <Text style={styles.modeSwitchText}>{registering ? 'Already have an account? Sign in' : mode === 'login' ? 'New here? Create an account' : 'Back to sign in'}</Text>
            </Pressable>
          </View>
          <Text style={styles.privacyNote}>Your account data is stored securely and belongs to you.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SessionRecovery({ error, onRetry, onSignOut }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.recoveryPage}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>F</Text></View>
        <Text style={styles.authTitle}>Can’t reconnect yet.</Text>
        <Text style={styles.authSubtitle}>{error}</Text>
        <Button title="Try again" onPress={onRetry} style={styles.submitButton} />
        <Button title="Sign out on this device" secondary onPress={onSignOut} style={styles.recoverySignOut} />
      </View>
    </SafeAreaView>
  );
}

function SectionTitle({ title, detail }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

function EmptyCard({ title, body, icon = '+' }) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>{icon}</Text></View>
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyBody}>{body}</Text>
      </View>
    </View>
  );
}

function workoutInputDateTime(value, timeZone) {
  const date = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

function parseWorkoutInputDateTime(value, timeZone) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  if (year < 1900 || year > 9999) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date(candidate));
      const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
      const observed = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
      candidate += target - observed;
    }
  } catch (_error) {
    return null;
  }
  const formatted = workoutInputDateTime(new Date(candidate), timeZone);
  return formatted === `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    ? new Date(candidate).toISOString()
    : null;
}

function WorkoutForm({ workout, userId, timeZone, unitPreference, onCancel, onSaved }) {
  const [activityType, setActivityType] = useState(workout?.activityType || 'walking');
  const [startedAtLocal, setStartedAtLocal] = useState(workoutInputDateTime(workout?.startedAt, timeZone));
  const [durationMinutes, setDurationMinutes] = useState(String(workout ? Math.max(1, Math.round(workout.durationSeconds / 60)) : 30));
  const distanceFactor = unitPreference === 'imperial' ? 1609.344 : 1000;
  const distanceUnit = unitPreference === 'imperial' ? 'mi' : 'km';
  const distanceLimit = unitPreference === 'imperial' ? 621.371 : 1000;
  const [distanceValue, setDistanceValue] = useState(workout?.distanceMeters == null ? '' : String(workout.distanceMeters / distanceFactor));
  const [notes, setNotes] = useState(workout?.notes || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const minutes = Number(durationMinutes);
    const distance = distanceValue.trim() ? Number(distanceValue) : null;
    const startedAt = parseWorkoutInputDateTime(startedAtLocal, timeZone);
    if (!startedAt) {
      setError('Enter a valid local date and time as YYYY-MM-DD HH:mm.');
      return;
    }
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      setError('Enter a duration between 1 minute and 24 hours.');
      return;
    }
    if (distance !== null && (!Number.isFinite(distance) || distance < 0 || distance > distanceLimit)) {
      setError(`Enter a distance from 0 to ${distanceLimit.toLocaleString()} ${distanceUnit}, or leave it blank.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        activityType,
        startedAt,
        durationSeconds: minutes * 60,
        distanceMeters: distance === null ? null : Math.round(distance * distanceFactor),
        notes: notes.trim() || null,
      };
      if (workout?.pendingCreateId) {
        const pendingItem = {
          id: workout.pendingCreateId,
          type: 'workout',
          payload: { ...payload, id: workout.id },
          createdAt: new Date().toISOString(),
        };
        await enqueuePending(userId, pendingItem);
        onSaved({ pendingItem });
        return;
      } else if (workout) {
        try {
          await api.updateWorkout(workout.id, payload);
        } catch (requestError) {
          if (!isRetryableApiError(requestError)) throw requestError;
          const pendingItem = {
            id: `workout-change-${workout.id}`,
            type: 'workout-change',
            workoutId: workout.id,
            operation: 'update',
            payload,
            createdAt: new Date().toISOString(),
          };
          await enqueuePending(userId, pendingItem);
          onSaved({ pendingItem });
          return;
        }
      } else {
        payload.id = createRecordId();
        try {
          await api.createWorkout(payload);
        } catch (requestError) {
          if (!isRetryableApiError(requestError)) throw requestError;
          const pendingItem = { id: payload.id, type: 'workout', payload, createdAt: new Date().toISOString() };
          await enqueuePending(userId, pendingItem);
          onSaved({ pendingItem });
          return;
        }
      }
      onSaved();
    } catch (requestError) {
      setError(requestError.message || 'Could not save this workout.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>{workout ? 'Edit workout' : 'Log a completed workout'}</Text>
      <Text style={styles.formHint}>Times use {timeZone || 'UTC'} and are stored as UTC.</Text>
      <Text style={styles.fieldLabel}>Activity</Text>
      <View style={styles.activityChips}>
        {activityTypes.map((type) => (
          <Pressable key={type} onPress={() => setActivityType(type)} style={[styles.chip, activityType === type && styles.chipSelected]}>
            <Text style={[styles.chipText, activityType === type && styles.chipTextSelected]}>{type[0].toUpperCase() + type.slice(1)}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="Started at (profile time)" value={startedAtLocal} onChangeText={setStartedAtLocal} placeholder="YYYY-MM-DD HH:mm" autoCapitalize="none" />
      <View style={styles.twoColumns}>
        <View style={styles.column}>
          <Field label="Duration (minutes)" value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="number-pad" />
        </View>
        <View style={styles.column}>
          <Field label={`Distance (${distanceUnit}, optional)`} value={distanceValue} onChangeText={setDistanceValue} keyboardType="decimal-pad" placeholder="0.0" />
        </View>
      </View>
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="How did it feel?" multiline />
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      <View style={styles.formActions}>
        <Button title="Cancel" secondary onPress={onCancel} style={styles.actionButton} />
        <Button title={busy ? 'Saving…' : workout ? 'Save changes' : 'Save workout'} disabled={busy} onPress={save} style={styles.actionButton} />
      </View>
    </View>
  );
}

function localDateInZone(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch (_error) {
    return new Date().toISOString().slice(0, 10);
  }
}

const goalTypes = [
  { value: 'daily_steps', label: 'Daily steps', unit: 'steps', max: 1000000 },
  { value: 'weekly_workouts', label: 'Weekly workouts', unit: 'workouts', max: 100 },
  { value: 'weekly_workout_minutes', label: 'Workout minutes', unit: 'min / week', max: 10080 },
];

function StepsForm({ initialSteps, localDate, userId, timeZone, onCancel, onSaved }) {
  const [value, setValue] = useState(String(initialSteps ?? 0));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const steps = Number(value);
    if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(steps) || steps > 1000000) {
      setError('Enter a whole number from 0 to 1,000,000.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const pendingItem = {
        id: `steps-${localDate}`,
        type: 'steps',
        localDate,
        steps,
        createdAt: new Date().toISOString(),
      };
      const existingQueue = await listPending(userId);
      const alreadyPending = existingQueue.some((item) => item.id === pendingItem.id);
      if (alreadyPending) await enqueuePending(userId, pendingItem);
      try {
        await api.saveDailySteps(localDate, steps);
      } catch (requestError) {
        if (!isRetryableApiError(requestError)) throw requestError;
        await enqueuePending(userId, pendingItem);
        onSaved({ pendingItem });
        return;
      }
      if (alreadyPending) {
        try {
          await removePending(userId, pendingItem.id);
        } catch (_error) {
          onSaved({ pendingItem });
          return;
        }
      }
      onSaved();
    } catch (requestError) {
      setError(requestError.message || 'Could not save this day’s steps.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>{localDate === localDateInZone(timeZone) ? 'Today’s steps' : `Steps for ${formatStepDate(localDate)}`}</Text>
      <Text style={styles.formHint}>Enter your daily total. A manual total takes precedence over Health Connect for this day.</Text>
      <Field label="Step count" value={value} onChangeText={setValue} keyboardType="number-pad" />
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      <View style={styles.formActions}>
        <Button title="Cancel" secondary onPress={onCancel} style={styles.actionButton} />
        <Button title={busy ? 'Saving…' : 'Save steps'} disabled={busy} onPress={save} style={styles.actionButton} />
      </View>
    </View>
  );
}

function formatStepDate(localDate) {
  const date = new Date(`${localDate}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) ? localDate : date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function shiftLocalDate(localDate, days) {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function StepHistoryCard({ rows, range, loading, error, onRangeChange, onEdit, onRetry }) {
  return (
    <View style={styles.stepHistoryCard}>
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>Daily step history</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} accessibilityLabel="Refresh step history">
          <Text style={styles.goalActionText}>Refresh</Text>
        </Pressable>
      </View>
      <View style={styles.activityChips}>
        {[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }].map((option) => (
          <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: range === option.value }} onPress={() => onRangeChange(option.value)} style={[styles.chip, range === option.value && styles.chipSelected]}>
            <Text style={[styles.chipText, range === option.value && styles.chipTextSelected]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <View><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Button title="Try again" secondary onPress={onRetry} /></View> : null}
      {loading ? <ActivityIndicator color={C.green} style={styles.loader} /> : !error && rows.length ? rows.map((row, index) => (
        <View key={row.localDate} style={[styles.stepHistoryRow, index === rows.length - 1 && styles.stepHistoryLastRow]}>
          <View style={styles.historyDayCopy}>
            <Text style={styles.historyDay}>{row.label}</Text>
            <Text style={styles.workoutMeta}>{row.pending ? 'Waiting to sync' : row.sources?.length ? row.sources.map(stepSourceLabel).join(' · ') : 'Recorded total'}</Text>
          </View>
          <Text style={styles.historySteps}>{Number(row.steps).toLocaleString()} steps</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit steps for ${row.label}`} onPress={() => onEdit(row)} style={styles.rowAction}>
            <Text style={styles.goalActionText}>Edit</Text>
          </Pressable>
        </View>
      )) : !error ? <Text style={styles.historyEmpty}>No step totals recorded for this period yet.</Text> : null}
    </View>
  );
}

function GoalForm({ goal, localDate, onCancel, onSaved }) {
  const [goalType, setGoalType] = useState(goal?.goalType || 'daily_steps');
  const [targetValue, setTargetValue] = useState(String(goal?.targetValue || ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedType = goalTypes.find((item) => item.value === goalType) || goalTypes[0];

  async function save() {
    const target = Number(targetValue);
    if (!/^\d+$/.test(targetValue.trim()) || !Number.isInteger(target) || target < 1 || target > selectedType.max) {
      setError(`Enter a whole number from 1 to ${selectedType.max}.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (goal) await api.updateGoal(goal.id, { targetValue: target });
      else await api.createGoal({ goalType, targetValue: target, startsOn: localDate });
      onSaved();
    } catch (requestError) {
      setError(requestError.message || 'Could not save this goal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>{goal ? 'Update goal' : 'Set a goal'}</Text>
      {goal ? <Text style={styles.formHint}>{selectedType.label}</Text> : (
        <View style={styles.activityChips}>
          {goalTypes.map((type) => (
            <Pressable key={type.value} onPress={() => setGoalType(type.value)} style={[styles.chip, goalType === type.value && styles.chipSelected]}>
              <Text style={[styles.chipText, goalType === type.value && styles.chipTextSelected]}>{type.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Field label={`Target (${selectedType.unit})`} value={targetValue} onChangeText={setTargetValue} keyboardType="number-pad" />
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      <View style={styles.formActions}>
        <Button title="Cancel" secondary onPress={onCancel} style={styles.actionButton} />
        <Button title={busy ? 'Saving…' : goal ? 'Update goal' : 'Save goal'} disabled={busy} onPress={save} style={styles.actionButton} />
      </View>
    </View>
  );
}

function GoalRow({ goal, onEdit, onToggle }) {
  const type = goalTypes.find((item) => item.value === goal.goalType) || goalTypes[0];
  const progress = Number(goal.progress || 0);
  const percent = goal.targetValue > 0 ? Math.min(100, (progress / goal.targetValue) * 100) : 0;
  return (
    <View style={styles.goalRow}>
      <View style={styles.goalRowTop}>
        <View style={styles.goalCopy}>
          <Text style={styles.goalName}>{type.label}</Text>
          <Text style={styles.workoutMeta}>{progress.toLocaleString()} of {goal.targetValue.toLocaleString()} {type.unit}</Text>
        </View>
        {goal.isComplete ? <Text style={styles.goalComplete}>Done</Text> : null}
      </View>
      <View style={styles.progressTrackLight}><View style={[styles.progressFillLight, { width: `${percent}%` }]} /></View>
      <View style={styles.goalActions}>
        <Pressable accessibilityRole="button" onPress={() => onEdit(goal)}><Text style={styles.goalActionText}>Edit target</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => onToggle(goal)}><Text style={styles.goalActionText}>{goal.isActive ? 'Pause' : 'Resume'}</Text></Pressable>
      </View>
    </View>
  );
}

function WorkoutRow({ workout, timeZone, unitPreference, onEdit, onDelete, pending = false }) {
  const started = new Date(workout.startedAt);
  const dateText = Number.isNaN(started.valueOf()) ? 'Workout' : started.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone || undefined });
  const distanceFactor = unitPreference === 'imperial' ? 1609.344 : 1000;
  const distanceUnit = unitPreference === 'imperial' ? 'mi' : 'km';
  const distanceText = workout.distanceMeters === null ? '' : ` · ${(workout.distanceMeters / distanceFactor).toFixed(1)} ${distanceUnit}`;

  return (
    <View style={styles.workoutRow}>
      <View style={styles.workoutTypeMark}><Text style={styles.workoutTypeInitial}>{workout.activityType.slice(0, 1).toUpperCase()}</Text></View>
      <View style={styles.workoutCopy}>
        <Text style={styles.workoutType}>{workout.activityType[0].toUpperCase() + workout.activityType.slice(1)}</Text>
        <Text style={styles.workoutMeta}>{dateText}</Text>
        <Text style={styles.workoutMeta}>{Math.round(workout.durationSeconds / 60)} min{distanceText}</Text>
        {workout.notes ? <Text style={styles.workoutNote}>{workout.notes}</Text> : null}
        {pending ? <Text style={styles.pendingStatus}>Waiting to sync</Text> : null}
      </View>
      <View style={styles.workoutActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit workout" onPress={() => onEdit(workout)} style={styles.rowAction}>
          <Text style={styles.goalActionText}>Edit</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Delete workout" onPress={() => onDelete(workout)} style={styles.rowAction}>
          <Text style={styles.deleteButtonText}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PendingWorkoutRow({ entry, timeZone, unitPreference, onEdit, onDelete }) {
  const workout = entry.payload;
  const started = new Date(workout.startedAt);
  const dateText = Number.isNaN(started.valueOf()) ? 'Workout' : started.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone || undefined });
  const factor = unitPreference === 'imperial' ? 1609.344 : 1000;
  const unit = unitPreference === 'imperial' ? 'mi' : 'km';
  const distance = workout.distanceMeters == null ? '' : ` · ${(workout.distanceMeters / factor).toFixed(1)} ${unit}`;
  return (
    <View style={styles.workoutRow}>
      <View style={styles.workoutTypeMark}><Text style={styles.workoutTypeInitial}>{workout.activityType.slice(0, 1).toUpperCase()}</Text></View>
      <View style={styles.workoutCopy}>
        <Text style={styles.workoutType}>{workout.activityType[0].toUpperCase() + workout.activityType.slice(1)}</Text>
        <Text style={styles.workoutMeta}>{dateText}</Text>
        <Text style={styles.workoutMeta}>{Math.round(workout.durationSeconds / 60)} min{distance}</Text>
        <Text style={styles.pendingStatus}>Waiting to sync</Text>
      </View>
      <View style={styles.workoutActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit pending workout" onPress={() => onEdit({ ...workout, pendingCreateId: entry.id })} style={styles.rowAction}>
          <Text style={styles.goalActionText}>Edit</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Remove pending workout" onPress={() => onDelete({ ...workout, pendingCreateId: entry.id })} style={styles.rowAction}>
          <Text style={styles.deleteButtonText}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ProgressSummaryCard({ summary, loading, error }) {
  if (loading) return <ActivityIndicator color={C.green} style={styles.loader} />;
  if (error) return <Text accessibilityRole="alert" style={styles.errorBanner}>{error}</Text>;
  if (!summary) return null;
  const days = summary.daily || [];
  const highestSteps = Math.max(1, ...days.map((day) => Number(day.steps || 0)));
  return (
    <View style={styles.progressSummaryCard}>
      <Text style={styles.summaryEyebrow}>STEPS BY DAY</Text>
      <View style={styles.weekChart}>
        {days.map((day) => {
          const height = Math.max(4, (Number(day.steps || 0) / highestSteps) * 52);
          return (
            <View key={day.localDate} style={styles.weekColumn}>
              <Text style={styles.weekValue}>{day.steps ? Number(day.steps).toLocaleString() : ' '}</Text>
              <View style={styles.weekBarTrack}><View style={[styles.weekBar, { height }]} /></View>
              <Text style={styles.weekDate}>{day.localDate.slice(8, 10)}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.summaryMetrics}>
        <View style={styles.summaryMetric}><Text style={styles.summaryValue}>{summary.totals.workoutCount}</Text><Text style={styles.summaryLabel}>workouts</Text></View>
        <View style={styles.summaryMetric}><Text style={styles.summaryValue}>{summary.totals.workoutMinutes}</Text><Text style={styles.summaryLabel}>minutes</Text></View>
        <View style={styles.summaryMetric}><Text style={styles.summaryValue}>{summary.totals.steps.toLocaleString()}</Text><Text style={styles.summaryLabel}>steps</Text></View>
      </View>
    </View>
  );
}

function PendingSyncCard({ items, error, syncing, onRetry }) {
  if (!items.length && !error) return null;
  return (
    <View style={styles.pendingCard}>
      <View style={styles.pendingCopy}>
        <Text style={styles.pendingTitle}>{items.length ? `${items.length} item${items.length === 1 ? '' : 's'} waiting to sync` : 'Pending activity needs attention'}</Text>
        <Text style={styles.pendingDetail}>
          {Platform.OS === 'web' ? 'This browser preview keeps pending items in memory only.' : 'Your pending activity is stored securely on this device.'}
        </Text>
        {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      </View>
      <Button title={syncing ? 'Syncing…' : 'Retry sync'} disabled={syncing} secondary onPress={onRetry} style={styles.pendingButton} />
    </View>
  );
}

function HealthConnectSettings({ user, onSynced }) {
  const [status, setStatus] = useState({ available: false, connected: false, message: 'Checking Health Connect…' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshStatus = useCallback(async () => {
    setStatus(await healthConnect.getHealthConnectStatus(user.id));
  }, [user.id]);

  useEffect(() => {
    refreshStatus();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refreshStatus();
    });
    return () => subscription.remove();
  }, [refreshStatus]);

  async function syncRecentSteps() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const to = localDateInZone(user.timeZone);
      const from = shiftLocalDate(to, -6);
      const entries = await healthConnect.readDailySteps(user.id, user.timeZone || 'UTC', from, to);
      await api.syncHealthConnectSteps(entries);
      setNotice(`Synced Health Connect totals for ${entries.length} days.`);
      onSynced();
      await refreshStatus();
    } catch (requestError) {
      setError(requestError.message || 'Could not sync Health Connect steps.');
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  async function connectAndSync() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const granted = await healthConnect.connectHealthConnect(user.id);
      await refreshStatus();
      if (!granted) {
        setError('Read access was not granted. You can keep entering steps manually.');
        return;
      }
      const to = localDateInZone(user.timeZone);
      const entries = await healthConnect.readDailySteps(user.id, user.timeZone || 'UTC', shiftLocalDate(to, -6), to);
      await api.syncHealthConnectSteps(entries);
      setNotice(`Connected and synced ${entries.length} days of step totals.`);
      onSynced();
    } catch (requestError) {
      setError(requestError.message || 'Could not connect to Health Connect.');
    } finally {
      await refreshStatus();
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await healthConnect.disconnectHealthConnect(user.id);
      await api.clearHealthConnectSteps();
      setNotice('Step sync is off in this app and imported totals were removed. Use Manage access to revoke Health Connect permission.');
      onSynced();
    } catch (requestError) {
      setError(requestError.message || 'Could not disconnect Health Connect.');
    } finally {
      await refreshStatus();
      setBusy(false);
    }
  }

  return (
    <View style={styles.healthCard}>
      <Text style={styles.healthTitle}>Health Connect</Text>
      <Text style={styles.healthCopy}>Android only. Reads daily step totals when you connect and sync manually. Totals are saved to your account; manual entries take precedence when both sources have a total for the same date.</Text>
      {!status.available || status.message ? <Text style={styles.healthStatus}>{status.message}</Text> : (
        <Text style={styles.healthStatus}>{status.connected ? 'Step access is connected.' : 'Not connected.'}</Text>
      )}
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.profileSaved}>{notice}</Text> : null}
      {status.available && !status.connected ? (
        <Button title={busy ? 'Connecting…' : 'Connect Health Connect'} disabled={busy} onPress={connectAndSync} />
      ) : null}
      {status.available ? (
        <View style={styles.healthActions}>
          {status.connected ? <Button title={busy ? 'Syncing…' : 'Sync last 7 days'} disabled={busy} onPress={syncRecentSteps} style={styles.healthAction} /> : null}
          <Button title="Manage access" secondary disabled={busy} onPress={() => healthConnect.openHealthConnectSettingsScreen().catch((requestError) => setError(requestError.message))} style={styles.healthAction} />
          {status.connected ? <Button title={busy ? 'Turning off…' : 'Turn off sync and remove imported totals'} danger disabled={busy} onPress={disconnect} style={styles.healthAction} /> : status.disabled ? <Button title={busy ? 'Removing…' : 'Remove imported totals'} danger disabled={busy} onPress={disconnect} style={styles.healthAction} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function ProfileSettings({ user, onSaved, onDeleted, onActivityUpdated }) {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [timeZone, setTimeZone] = useState(user.timeZone || 'UTC');
  const [unitPreference, setUnitPreference] = useState(user.unitPreference || 'metric');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportReady, setExportReady] = useState(false);
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function save() {
    const nextTimeZone = timeZone.trim();
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: nextTimeZone });
    } catch (_error) {
      setError('Enter a valid time zone, such as Asia/Kolkata or America/Los_Angeles.');
      return;
    }
    if (displayName.trim().length > 100) {
      setError('Name must be at most 100 characters.');
      return;
    }
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const profile = await api.updateProfile({
        displayName: displayName.trim() || null,
        timeZone: nextTimeZone,
        unitPreference,
      });
      onSaved(profile);
      setSaved(true);
    } catch (requestError) {
      setError(requestError.message || 'Could not save your preferences.');
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    setExporting(true);
    setExportError('');
    setExportReady(false);
    try {
      const data = await api.exportMyData();
      const pendingSyncItems = await listPending(user.id);
      const json = JSON.stringify({ ...data, pendingSyncItems }, null, 2);
      if (Platform.OS === 'web') {
        const file = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'fitness-activity-tracker-export.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const result = await Share.share({ title: 'Fitness Activity Tracker data', message: json });
        if (result.action !== Share.sharedAction) return;
      }
      setExportReady(true);
    } catch (requestError) {
      setExportError(requestError.message || 'Could not prepare your data export.');
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    if (!deletePassword) {
      setDeleteError('Enter your current password to continue.');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await api.deleteAccount(deletePassword);
      setDeletePassword('');
      await onDeleted();
    } catch (requestError) {
      setDeleteError(requestError.message || 'Could not delete your account.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={styles.profileCard}>
      <Text style={styles.profileLabel}>ACCOUNT</Text>
      <Text style={styles.profileEmail}>{user.email}</Text>
      <View style={styles.profileFields}>
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Optional" />
        <Field label="Time zone" value={timeZone} onChangeText={setTimeZone} placeholder="Asia/Kolkata" autoCapitalize="none" />
        <Text style={styles.fieldLabel}>Distance units</Text>
        <View style={styles.activityChips}>
          {[
            { value: 'metric', label: 'Metric · km' },
            { value: 'imperial', label: 'Imperial · mi' },
          ].map((unit) => (
            <Pressable key={unit.value} accessibilityRole="button" accessibilityState={{ selected: unitPreference === unit.value }} onPress={() => setUnitPreference(unit.value)} style={[styles.chip, unitPreference === unit.value && styles.chipSelected]}>
              <Text style={[styles.chipText, unitPreference === unit.value && styles.chipTextSelected]}>{unit.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      {saved ? <Text accessibilityLiveRegion="polite" style={styles.profileSaved}>Preferences saved.</Text> : null}
      <Button title={busy ? 'Saving…' : 'Save preferences'} disabled={busy} onPress={save} style={styles.profileSaveButton} />
      <Text style={styles.exportHint}>Export your profile, workouts, step records, goals, and any activity waiting to sync. Mobile opens the share sheet; web downloads a JSON file.</Text>
      {exportError ? <Text accessibilityRole="alert" style={styles.errorText}>{exportError}</Text> : null}
      {exportReady ? <Text accessibilityLiveRegion="polite" style={styles.profileSaved}>Your export is ready.</Text> : null}
      <Button title={exporting ? 'Preparing export…' : 'Export my data'} disabled={exporting} secondary onPress={exportData} style={styles.exportButton} />
      <HealthConnectSettings user={user} onSynced={onActivityUpdated} />
      {showDeleteForm ? (
        <View style={styles.deleteAccountPanel}>
          <Text style={styles.deleteAccountTitle}>Permanently delete this account?</Text>
          <Text style={styles.deleteAccountCopy}>This removes your profile, workouts, step records, goals, and active sessions from the database. Export your data first if you want to keep a copy.</Text>
          <Field label="Current password" value={deletePassword} onChangeText={setDeletePassword} placeholder="Current password" secureTextEntry autoCapitalize="none" />
          {deleteError ? <Text accessibilityRole="alert" style={styles.errorText}>{deleteError}</Text> : null}
          <View style={styles.formActions}>
            <Button title="Cancel" secondary disabled={deleting} onPress={() => { setShowDeleteForm(false); setDeletePassword(''); setDeleteError(''); }} style={styles.actionButton} />
            <Button title={deleting ? 'Deleting…' : 'Permanently delete'} danger disabled={deleting} onPress={deleteAccount} style={styles.actionButton} />
          </View>
        </View>
      ) : <Button title="Delete account" danger onPress={() => { setShowDeleteForm(true); setDeleteError(''); }} style={styles.deleteAccountButton} />}
    </View>
  );
}

function MainApp({ user, onSignOut, onProfileUpdated }) {
  const [tab, setTab] = useState('Today');
  const [workouts, setWorkouts] = useState([]);
  const [recentWorkout, setRecentWorkout] = useState(null);
  const [workoutPeriod, setWorkoutPeriod] = useState('all');
  const [workoutTypeFilter, setWorkoutTypeFilter] = useState('all');
  const [hasMoreWorkouts, setHasMoreWorkouts] = useState(false);
  const [loadingMoreWorkouts, setLoadingMoreWorkouts] = useState(false);
  const [loadingRecentWorkout, setLoadingRecentWorkout] = useState(true);
  const [dailySteps, setDailySteps] = useState(0);
  const [dailyStepSources, setDailyStepSources] = useState([]);
  const [goals, setGoals] = useState([]);
  const [progressSummary, setProgressSummary] = useState(null);
  const [pendingItems, setPendingItems] = useState([]);
  const [workoutError, setWorkoutError] = useState('');
  const [stepsError, setStepsError] = useState('');
  const [goalsError, setGoalsError] = useState('');
  const [progressError, setProgressError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [loadingWorkouts, setLoadingWorkouts] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [syncingPending, setSyncingPending] = useState(false);
  const [showWorkoutForm, setShowWorkoutForm] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [showStepsForm, setShowStepsForm] = useState(false);
  const [stepsHistoryOpen, setStepsHistoryOpen] = useState(false);
  const [stepsHistoryRange, setStepsHistoryRange] = useState(7);
  const [stepsHistory, setStepsHistory] = useState([]);
  const [stepsHistoryLoading, setStepsHistoryLoading] = useState(false);
  const [stepsHistoryError, setStepsHistoryError] = useState('');
  const [selectedStepsDate, setSelectedStepsDate] = useState(null);
  const [selectedStepsInitial, setSelectedStepsInitial] = useState(0);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const localDate = localDateInZone(user.timeZone);
  const workoutFilterQuery = useMemo(() => {
    const params = new URLSearchParams({ limit: '25', offset: '0' });
    if (workoutTypeFilter !== 'all') params.set('activityType', workoutTypeFilter);
    if (workoutPeriod !== 'all') {
      const days = Number(workoutPeriod);
      params.set('from', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
      params.set('to', new Date().toISOString());
    }
    return params.toString();
  }, [refreshKey, workoutPeriod, workoutTypeFilter]);
  const workoutFilterQueryRef = useRef(workoutFilterQuery);
  workoutFilterQueryRef.current = workoutFilterQuery;

  const syncPendingNow = useCallback(async () => {
    setSyncingPending(true);
    try {
      const localPending = await listPending(user.id);
      setPendingItems(localPending);
      const result = await syncPendingActivity(user.id);
      setPendingItems(result.pending);
      setSyncError(result.error?.message || '');
      if (result.syncedCount) setRefreshKey((value) => value + 1);
    } catch (error) {
      setSyncError(error.message || 'Could not read pending activity from secure storage.');
    } finally {
      setSyncingPending(false);
    }
  }, [user.id]);

  useEffect(() => {
    syncPendingNow();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') syncPendingNow();
    });
    return () => subscription.remove();
  }, [syncPendingNow]);

  useEffect(() => {
    let active = true;
    setStepsError('');
    api.listDailySteps(localDate, localDate).then((result) => {
      if (active) {
        setDailySteps(result.data?.[0]?.steps || 0);
        setDailyStepSources(result.data?.[0]?.sources || []);
      }
    }).catch((error) => {
      if (active) setStepsError(error.message || 'Could not load today’s steps.');
    });
    setGoalsError('');
    api.listGoals().then((result) => {
      if (active) setGoals(result.data || []);
    }).catch((error) => {
      if (active) setGoalsError(error.message || 'Could not load your goals.');
    });
    setLoadingProgress(true);
    setProgressError('');
    api.getProgressSummary().then((result) => {
      if (active) setProgressSummary(result);
    }).catch((error) => {
      if (active) setProgressError(error.message || 'Could not load your weekly summary.');
    }).finally(() => {
      if (active) setLoadingProgress(false);
    });
    return () => { active = false; };
  }, [refreshKey, localDate]);

  useEffect(() => {
    if (!stepsHistoryOpen) return undefined;
    let active = true;
    const from = shiftLocalDate(localDate, -(stepsHistoryRange - 1));
    setStepsHistoryLoading(true);
    setStepsHistoryError('');
    api.listDailySteps(from, localDate).then((result) => {
      if (active) setStepsHistory(result.data || []);
    }).catch((error) => {
      if (active) setStepsHistoryError(error.message || 'Could not load step history.');
    }).finally(() => {
      if (active) setStepsHistoryLoading(false);
    });
    return () => { active = false; };
  }, [stepsHistoryOpen, stepsHistoryRange, refreshKey, localDate]);

  useEffect(() => {
    let active = true;
    setLoadingRecentWorkout(true);
    api.listWorkouts('limit=1&offset=0').then((result) => {
      if (active) setRecentWorkout(result.data?.[0] || null);
    }).catch((error) => {
      if (active) setWorkoutError(error.message || 'Could not load workouts.');
    }).finally(() => {
      if (active) setLoadingRecentWorkout(false);
    });
    return () => { active = false; };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;
    setLoadingWorkouts(true);
    setWorkoutError('');
    setWorkouts([]);
    setHasMoreWorkouts(false);
    api.listWorkouts(workoutFilterQuery).then((result) => {
      if (!active) return;
      const data = result.data || [];
      setWorkouts(data);
      setHasMoreWorkouts(data.length === 25);
    }).catch((error) => {
      if (active) setWorkoutError(error.message || 'Could not load workouts.');
    }).finally(() => {
      if (active) setLoadingWorkouts(false);
    });
    return () => { active = false; };
  }, [workoutFilterQuery]);

  async function loadMoreWorkouts() {
    if (loadingMoreWorkouts || !hasMoreWorkouts) return;
    const params = new URLSearchParams(workoutFilterQuery);
    params.set('offset', String(workouts.length));
    setLoadingMoreWorkouts(true);
    setWorkoutError('');
    try {
      const result = await api.listWorkouts(params.toString());
      if (workoutFilterQueryRef.current !== workoutFilterQuery) return;
      const data = result.data || [];
      setWorkouts((current) => [...current, ...data]);
      setHasMoreWorkouts(data.length === 25);
    } catch (error) {
      setWorkoutError(error.message || 'Could not load more workouts.');
    } finally {
      setLoadingMoreWorkouts(false);
    }
  }

  const displayName = user.displayName || user.email.split('@')[0];

  async function removeWorkout(workout) {
    const confirmDelete = async () => {
      try {
        if (workout.pendingCreateId) {
          await removePending(user.id, workout.pendingCreateId);
          setPendingItems((items) => items.filter((item) => item.id !== workout.pendingCreateId));
          return;
        }
        await api.deleteWorkout(workout.id);
        const queuedChangeId = `workout-change-${workout.id}`;
        if (pendingItems.some((item) => item.id === queuedChangeId)) {
          await removePending(user.id, queuedChangeId);
          setPendingItems((items) => items.filter((item) => item.id !== queuedChangeId));
        }
        setRefreshKey((value) => value + 1);
      } catch (error) {
        if (!workout.pendingCreateId && isRetryableApiError(error)) {
          const pendingItem = {
            id: `workout-change-${workout.id}`,
            type: 'workout-change',
            workoutId: workout.id,
            operation: 'delete',
            createdAt: new Date().toISOString(),
          };
          try {
            await enqueuePending(user.id, pendingItem);
            setPendingItems((items) => mergePendingItems(items, pendingItem));
            return;
          } catch (queueError) {
            setWorkoutError(queueError.message || 'Could not queue this workout deletion.');
            return;
          }
        }
        setWorkoutError(error.message || 'Could not delete this workout.');
      }
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('Delete this workout?')) await confirmDelete();
    } else {
      Alert.alert('Delete workout?', 'This removes the workout from your activity history.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      ]);
    }
  }

  function savedWorkout(result = {}) {
    setShowWorkoutForm(false);
    setEditingWorkout(null);
    if (result.pendingItem) setPendingItems((items) => mergePendingItems(items, result.pendingItem));
    else setRefreshKey((value) => value + 1);
    setTab('Workouts');
  }

  function editWorkout(workout) {
    const pendingCreate = pendingItems.find((item) => item.type === 'workout' && item.payload?.id === workout.id);
    setEditingWorkout(pendingCreate ? { ...workout, pendingCreateId: pendingCreate.id } : workout);
    setShowWorkoutForm(true);
    setTab('Workouts');
  }

  async function finishAccountDeletion() {
    try {
      const localPending = await listPending(user.id);
      await Promise.all(localPending.map((item) => removePending(user.id, item.id)));
    } catch (_error) {
      // The account is already deleted on the server; still clear the local session.
    }
    await onSignOut();
  }

  function savedSteps(result = {}) {
    setShowStepsForm(false);
    if (result.pendingItem) {
      if (result.pendingItem.localDate === localDate) setDailySteps(result.pendingItem.steps);
      setPendingItems((items) => mergePendingItems(items, result.pendingItem));
      setProgressSummary((summary) => {
        if (!summary || result.pendingItem.localDate < summary.from || result.pendingItem.localDate > summary.to) return summary;
        const day = summary.daily.find((item) => item.localDate === result.pendingItem.localDate);
        const previousSteps = day?.steps || 0;
        const daily = day
          ? summary.daily.map((item) => item.localDate === result.pendingItem.localDate ? { ...item, steps: result.pendingItem.steps } : item)
          : [...summary.daily, { localDate: result.pendingItem.localDate, steps: result.pendingItem.steps, workoutCount: 0, workoutMinutes: 0 }];
        return { ...summary, daily, totals: { ...summary.totals, steps: summary.totals.steps - previousSteps + result.pendingItem.steps } };
      });
    } else {
      setRefreshKey((value) => value + 1);
    }
  }

  function savedGoal() {
    setShowGoalForm(false);
    setEditingGoal(null);
    setRefreshKey((value) => value + 1);
  }

  async function toggleGoal(goal) {
    try {
      await api.updateGoal(goal.id, { isActive: !goal.isActive });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setGoalsError(error.message || 'Could not update this goal.');
    }
  }

  const dailyGoal = goals.find((goal) => goal.goalType === 'daily_steps' && goal.isActive && goal.startsOn <= localDate && (!goal.endsOn || goal.endsOn >= localDate));
  const pendingWorkouts = pendingItems.filter((item) => item.type === 'workout');
  const pendingWorkoutChanges = new Map(pendingItems.filter((item) => item.type === 'workout-change').map((item) => [item.workoutId, item]));
  const latestWorkoutCandidates = [
    ...(recentWorkout ? [recentWorkout] : []),
    ...pendingWorkouts.map((item) => ({ ...item.payload, pendingSync: true })),
    ...[...pendingWorkoutChanges.values()]
      .filter((item) => item.operation === 'update')
      .map((item) => ({ ...item.payload, id: item.workoutId, pendingSync: true })),
  ].filter((workout) => pendingWorkoutChanges.get(workout.id)?.operation !== 'delete');
  const latestWorkout = latestWorkoutCandidates.sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0] || null;
  const pendingTodaySteps = pendingItems.find((item) => item.type === 'steps' && item.localDate === localDate);
  const displayedDailySteps = pendingTodaySteps?.steps ?? dailySteps;
  const displayedStepSources = pendingTodaySteps ? ['manual'] : dailyStepSources;
  const dailyPercent = dailyGoal ? Math.min(100, (displayedDailySteps / dailyGoal.targetValue) * 100) : 0;
  const workoutFilters = new URLSearchParams(workoutFilterQuery);
  const pendingFrom = workoutFilters.has('from') ? Date.parse(workoutFilters.get('from')) : -Infinity;
  const pendingTo = workoutFilters.has('to') ? Date.parse(workoutFilters.get('to')) : Infinity;
  const visiblePendingWorkouts = pendingWorkouts.filter((item) => {
    const { activityType, startedAt } = item.payload || {};
    const startedAtMs = Date.parse(startedAt);
    return (workoutTypeFilter === 'all' || activityType === workoutTypeFilter)
      && startedAtMs >= pendingFrom && startedAtMs <= pendingTo;
  });
  const savedWorkoutById = new Map(workouts.map((workout) => [workout.id, workout]));
  pendingWorkoutChanges.forEach((change) => {
    if (change.operation === 'update' && !savedWorkoutById.has(change.workoutId)) {
      savedWorkoutById.set(change.workoutId, {
        id: change.workoutId,
        source: 'manual',
        createdAt: change.createdAt,
        updatedAt: change.createdAt,
        ...change.payload,
        pendingSync: true,
      });
    }
  });
  const visibleSavedWorkouts = [...savedWorkoutById.values()].map((workout) => {
    const change = pendingWorkoutChanges.get(workout.id);
    return change?.operation === 'update' ? { ...workout, ...change.payload, pendingSync: true } : workout;
  }).filter((workout) => {
    const change = pendingWorkoutChanges.get(workout.id);
    if (change?.operation === 'delete') return false;
    const startedAtMs = Date.parse(workout.startedAt);
    return (workoutTypeFilter === 'all' || workout.activityType === workoutTypeFilter)
      && startedAtMs >= pendingFrom && startedAtMs <= pendingTo;
  }).sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
  const historyFrom = shiftLocalDate(localDate, -(stepsHistoryRange - 1));
  const historyByDate = new Map(stepsHistory.map((row) => [row.localDate, row]));
  pendingItems.filter((item) => item.type === 'steps' && item.localDate >= historyFrom && item.localDate <= localDate).forEach((item) => {
    historyByDate.set(item.localDate, { ...historyByDate.get(item.localDate), localDate: item.localDate, steps: item.steps, pending: true, sources: ['manual'] });
  });
  const stepHistoryRows = [...historyByDate.values()]
    .sort((left, right) => right.localDate.localeCompare(left.localDate))
    .map((row) => ({ ...row, label: formatStepDate(row.localDate) }));

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.canvas} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>FITNESS ACTIVITY TRACKER</Text>
            <Text style={styles.greeting}>Hi, {displayName}.</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>{displayName[0]?.toUpperCase() || 'F'}</Text></View>
        </View>
        <PendingSyncCard items={pendingItems} error={syncError} syncing={syncingPending} onRetry={syncPendingNow} />

        {tab === 'Today' ? (
          <>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>TODAY</Text>
              <View style={styles.dateRule} />
              <Text style={styles.dateHint}>{new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', timeZone: user.timeZone || 'UTC' })}</Text>
            </View>
            <View style={styles.stepsCard}>
              <View style={styles.cardTopLine}>
                <View><Text style={styles.cardEyebrow}>DAILY MOVEMENT</Text><Text style={styles.cardTitle}>Steps</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Update today’s steps" onPress={() => { setSelectedStepsDate(localDate); setSelectedStepsInitial(displayedDailySteps); setShowStepsForm((value) => !value); }} style={styles.stepIcon}><Text style={styles.stepIconText}>＋</Text></Pressable>
              </View>
              <View style={styles.stepValueRow}><Text style={styles.stepValue}>{displayedDailySteps.toLocaleString()}</Text><Text style={styles.stepUnit}>steps</Text></View>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${dailyPercent}%` }]} /></View>
              <Text style={styles.cardFootnote}>{dailyGoal ? `${displayedDailySteps.toLocaleString()} of ${dailyGoal.targetValue.toLocaleString()} steps today` : 'Set a daily steps goal to track your progress.'}</Text>
              {displayedStepSources.length ? <Text style={styles.stepSourceLabel}>Source: {displayedStepSources.map(stepSourceLabel).join(' · ')}</Text> : null}
            </View>
            {stepsError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{stepsError}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: stepsHistoryOpen }} onPress={() => setStepsHistoryOpen((value) => !value)} style={styles.historyToggle}>
              <Text style={styles.historyToggleText}>{stepsHistoryOpen ? 'Hide step history' : 'View step history'}</Text>
              <Text style={styles.historyToggleMark}>{stepsHistoryOpen ? '−' : '+'}</Text>
            </Pressable>
            {stepsHistoryOpen ? <StepHistoryCard rows={stepHistoryRows} range={stepsHistoryRange} loading={stepsHistoryLoading} error={stepsHistoryError} onRangeChange={setStepsHistoryRange} onRetry={() => setRefreshKey((value) => value + 1)} onEdit={(row) => { setSelectedStepsDate(row.localDate); setSelectedStepsInitial(row.steps); setShowStepsForm(true); }} /> : null}
            {showStepsForm ? <StepsForm key={`${selectedStepsDate || localDate}-${selectedStepsInitial}`} localDate={selectedStepsDate || localDate} userId={user.id} timeZone={user.timeZone} initialSteps={selectedStepsDate ? selectedStepsInitial : dailySteps} onCancel={() => setShowStepsForm(false)} onSaved={savedSteps} /> : null}
            <SectionTitle title="Your activity" detail="Recent" />
            {workoutError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{workoutError}</Text> : null}
            {loadingRecentWorkout ? <ActivityIndicator color={C.green} style={styles.loader} /> : latestWorkout ? (
              <View style={styles.activityCard}><WorkoutRow workout={latestWorkout} timeZone={user.timeZone} unitPreference={user.unitPreference} onEdit={editWorkout} onDelete={removeWorkout} /></View>
            ) : (
              <View style={styles.activityCard}><EmptyCard title="No workouts yet" body="Log your first workout to start building your history." /></View>
            )}
            <SectionTitle title="This week" detail={progressSummary ? `${progressSummary.from} – ${progressSummary.to}` : 'Monday to today'} />
            <ProgressSummaryCard summary={progressSummary} loading={loadingProgress} error={progressError} />
            <SectionTitle title="Your goals" detail="Build a steady rhythm" />
            {goalsError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{goalsError}</Text> : null}
            {goals.filter((goal) => goal.isActive).length ? (
              <View style={styles.listCard}>{goals.filter((goal) => goal.isActive).map((goal) => <GoalRow key={goal.id} goal={goal} onEdit={(value) => { setEditingGoal(value); setShowGoalForm(true); setTab('Goals'); }} onToggle={toggleGoal} />)}</View>
            ) : <View style={styles.activityCard}><EmptyCard icon="◎" title="No active goals" body="Set a simple goal to make your progress visible." /></View>}
          </>
        ) : null}

        {tab === 'Workouts' ? (
          <>
            <View style={styles.pageTitleRow}>
              <View><Text style={styles.pageTitle}>Workouts</Text><Text style={styles.pageSubtitle}>Your saved activity history</Text></View>
              <Button title="+ Log" onPress={() => { if (showWorkoutForm) { setShowWorkoutForm(false); setEditingWorkout(null); } else { setEditingWorkout(null); setShowWorkoutForm(true); } }} style={styles.logButton} />
            </View>
            <Text style={styles.filterLabel}>TIME PERIOD</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {[
                { value: 'all', label: 'All time' },
                { value: '7', label: 'Past 7 days' },
                { value: '30', label: 'Past 30 days' },
              ].map((period) => (
                <Pressable key={period.value} accessibilityRole="button" accessibilityState={{ selected: workoutPeriod === period.value }} onPress={() => setWorkoutPeriod(period.value)} style={[styles.chip, workoutPeriod === period.value && styles.chipSelected]}>
                  <Text style={[styles.chipText, workoutPeriod === period.value && styles.chipTextSelected]}>{period.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.filterLabel}>ACTIVITY TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {[{ value: 'all', label: 'All types' }, ...activityTypes.map((type) => ({ value: type, label: type[0].toUpperCase() + type.slice(1) }))].map((type) => (
                <Pressable key={type.value} accessibilityRole="button" accessibilityState={{ selected: workoutTypeFilter === type.value }} onPress={() => setWorkoutTypeFilter(type.value)} style={[styles.chip, workoutTypeFilter === type.value && styles.chipSelected]}>
                  <Text style={[styles.chipText, workoutTypeFilter === type.value && styles.chipTextSelected]}>{type.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {showWorkoutForm ? <WorkoutForm key={editingWorkout?.id || 'new-workout'} workout={editingWorkout} userId={user.id} timeZone={user.timeZone} unitPreference={user.unitPreference} onCancel={() => { setShowWorkoutForm(false); setEditingWorkout(null); }} onSaved={savedWorkout} /> : null}
            {workoutError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{workoutError}</Text> : null}
            {loadingWorkouts ? <ActivityIndicator color={C.green} style={styles.loader} /> : visibleSavedWorkouts.length || visiblePendingWorkouts.length ? (
              <View style={styles.listCard}>
                {visiblePendingWorkouts.map((item) => <PendingWorkoutRow key={item.id} entry={item} timeZone={user.timeZone} unitPreference={user.unitPreference} onEdit={editWorkout} onDelete={removeWorkout} />)}
                {visibleSavedWorkouts.map((workout) => <WorkoutRow key={workout.id} workout={workout} pending={Boolean(workout.pendingSync)} timeZone={user.timeZone} unitPreference={user.unitPreference} onEdit={editWorkout} onDelete={removeWorkout} />)}
              </View>
            ) : !workoutError ? (
              <View style={styles.activityCard}><EmptyCard title="No matching workouts" body="Try another time period or activity type, or log a workout to start your history." /></View>
            ) : null}
            {hasMoreWorkouts ? <Button title={loadingMoreWorkouts ? 'Loading…' : 'Load more workouts'} disabled={loadingMoreWorkouts} secondary onPress={loadMoreWorkouts} style={styles.loadMoreButton} /> : null}
          </>
        ) : null}

        {tab === 'Goals' ? (
          <>
            <View style={styles.pageTitleRow}>
              <View><Text style={styles.pageTitle}>Goals</Text><Text style={styles.pageSubtitle}>Pick a small target and build from there.</Text></View>
              <Button title="+ Add" onPress={() => { setEditingGoal(null); setShowGoalForm((value) => !value); }} style={styles.logButton} />
            </View>
            {showGoalForm ? <GoalForm goal={editingGoal} localDate={localDate} onCancel={() => { setShowGoalForm(false); setEditingGoal(null); }} onSaved={savedGoal} /> : null}
            {goalsError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{goalsError}</Text> : null}
            {goals.length ? <View style={styles.listCard}>{goals.map((goal) => <GoalRow key={goal.id} goal={goal} onEdit={(value) => { setEditingGoal(value); setShowGoalForm(true); }} onToggle={toggleGoal} />)}</View> : !goalsError ? <View style={styles.activityCard}><EmptyCard icon="◎" title="No goals yet" body="Create a daily step or weekly workout target to get started." /></View> : null}
          </>
        ) : null}

        {tab === 'Profile' ? (
          <>
            <Text style={styles.pageTitle}>Profile</Text>
            <ProfileSettings user={user} onSaved={onProfileUpdated} onDeleted={finishAccountDeletion} onActivityUpdated={() => setRefreshKey((value) => value + 1)} />
            <Button title="Sign out" secondary onPress={onSignOut} style={styles.signOutButton} />
          </>
        ) : null}

        <Text style={styles.footer}>Small steps count. Keep showing up.</Text>
      </ScrollView>
      <View style={styles.tabBar}>
        {['Today', 'Workouts', 'Goals', 'Profile'].map((item) => (
          <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => { setShowWorkoutForm(false); setEditingWorkout(null); setShowStepsForm(false); setShowGoalForm(false); setEditingGoal(null); setTab(item); }} style={styles.tabItem}>
            <Text style={[styles.tabIcon, tab === item && styles.tabSelected]}>{({ Today: '⌂', Workouts: '◷', Goals: '◎', Profile: '○' })[item]}</Text>
            <Text style={[styles.tabLabel, tab === item && styles.tabSelected]}>{item}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

function AppContent() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [hasStoredSession, setHasStoredSession] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [passwordResetToken, setPasswordResetToken] = useState('');
  const resetLinkSeen = useRef(false);

  useEffect(() => {
    function handleResetLink(url) {
      if (!url?.startsWith('fitness-tracker://reset-password')) return;
      const token = url.match(/[?&]token=([A-Za-z0-9_-]+)/)?.[1] || '';
      if (!token) return;
      resetLinkSeen.current = true;
      void clearTokens().catch(() => {}).finally(() => {
        setUser(null);
        setHasStoredSession(false);
        setSessionError('');
        setPasswordResetToken(token);
        setCheckingSession(false);
      });
    }
    Linking.getInitialURL().then(handleResetLink).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => handleResetLink(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let active = true;
    async function restore() {
      setCheckingSession(true);
      setSessionError('');
      try {
        const tokens = await readTokens();
        if (resetLinkSeen.current) return;
        if (!tokens) {
          if (active) { setHasStoredSession(false); setUser(null); }
          return;
        }
        if (active) setHasStoredSession(true);
        const profile = await api.me();
        if (active && !resetLinkSeen.current) setUser(profile);
      } catch (error) {
        if (error.status === 401) {
          await clearTokens();
          if (active) { setHasStoredSession(false); setUser(null); }
        } else if (active) {
          setSessionError(error.message || 'Could not restore your session.');
        }
      } finally {
        if (active && !resetLinkSeen.current) setCheckingSession(false);
      }
    }
    restore();
    return () => { active = false; };
  }, [retryKey]);

  async function signOut() {
    try { await api.logout(); } catch (_error) { await clearTokens(); }
    setUser(null);
    setHasStoredSession(false);
    setSessionError('');
  }

  if (checkingSession) {
    return <SafeAreaView style={[styles.safeArea, styles.loadingScreen]}><ActivityIndicator color={C.green} size="large" /><Text style={styles.loadingText}>Getting things ready…</Text></SafeAreaView>;
  }
  if (sessionError && hasStoredSession) {
    return <SessionRecovery error={sessionError} onRetry={() => setRetryKey((value) => value + 1)} onSignOut={signOut} />;
  }
  if (!user) return <AuthScreen
    initialResetToken={passwordResetToken}
    onResetComplete={() => setPasswordResetToken('')}
    onAuthenticated={(nextUser) => { resetLinkSeen.current = false; setUser(nextUser); setHasStoredSession(true); }}
  />;
  return <MainApp key={user.id} user={user} onSignOut={signOut} onProfileUpdated={setUser} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: C.canvas },
  page: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 26 },
  authPage: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 32 },
  recoveryPage: { flex: 1, justifyContent: 'center', paddingHorizontal: 26 },
  loadingScreen: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: C.muted, marginTop: 12, fontSize: 13 },
  brandMark: { width: 48, height: 48, borderRadius: 17, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  brandMarkText: { color: C.white, fontSize: 20, fontWeight: '800' },
  eyebrow: { color: C.green, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  authTitle: { color: C.ink, fontSize: 30, fontWeight: '700', letterSpacing: -0.8, marginTop: 8 },
  authSubtitle: { color: C.muted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 23 },
  formCard: { backgroundColor: C.white, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 18, marginBottom: 20 },
  fieldGroup: { marginBottom: 13 },
  fieldLabel: { color: C.ink, fontSize: 11, fontWeight: '700', marginBottom: 7 },
  input: { borderWidth: 1, borderColor: C.line, backgroundColor: '#FCFDFC', borderRadius: 11, minHeight: 46, paddingHorizontal: 12, color: C.ink, fontSize: 14 },
  multilineInput: { minHeight: 80, paddingTop: 11, textAlignVertical: 'top' },
  button: { minHeight: 45, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.green },
  secondaryButton: { backgroundColor: C.white, borderColor: C.line, borderWidth: 1 },
  disabledButton: { opacity: 0.55 },
  dangerButton: { backgroundColor: C.red },
  dangerButtonText: { color: C.white },
  pressedButton: { opacity: 0.82 },
  buttonText: { color: C.white, fontSize: 13, fontWeight: '700' },
  secondaryButtonText: { color: C.green },
  submitButton: { marginTop: 2 },
  modeSwitch: { alignItems: 'center', paddingTop: 16 },
  modeSwitchText: { color: C.green, fontSize: 12, fontWeight: '700' },
  resetNotice: { color: C.green, backgroundColor: C.pale, borderRadius: 10, padding: 11, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  privacyNote: { color: C.muted, fontSize: 11, textAlign: 'center', paddingHorizontal: 20 },
  errorText: { color: C.red, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  errorBanner: { color: C.red, backgroundColor: '#FBEDEA', borderRadius: 12, padding: 12, fontSize: 12, marginBottom: 12 },
  recoverySignOut: { marginTop: 10 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { color: C.ink, fontSize: 25, fontWeight: '700', marginTop: 7, letterSpacing: -0.7 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.green, fontSize: 16, fontWeight: '800' },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 27, marginBottom: 13 },
  dateLabel: { color: C.ink, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  dateRule: { height: 1, flex: 1, backgroundColor: C.line, marginHorizontal: 12 },
  dateHint: { color: C.muted, fontSize: 11 },
  stepsCard: { backgroundColor: C.green, borderRadius: 22, padding: 21, minHeight: 215 },
  historyToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3, paddingVertical: 13 },
  historyToggleText: { color: C.green, fontSize: 12, fontWeight: '700' },
  historyToggleMark: { color: C.green, fontSize: 18, fontWeight: '500' },
  stepHistoryCard: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 9 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  historyTitle: { color: C.ink, fontSize: 14, fontWeight: '700' },
  stepHistoryRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 12 },
  stepHistoryLastRow: { borderBottomWidth: 0 },
  historyDayCopy: { flex: 1 },
  historyDay: { color: C.ink, fontSize: 12, fontWeight: '700' },
  historySteps: { color: C.ink, fontSize: 11, fontWeight: '700', marginRight: 7 },
  historyEmpty: { color: C.muted, fontSize: 11, lineHeight: 16, paddingVertical: 8 },
  cardTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardEyebrow: { color: '#C0D8CB', fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  cardTitle: { color: C.white, fontSize: 20, fontWeight: '700', marginTop: 4 },
  stepIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: '#FFFFFF1E', alignItems: 'center', justifyContent: 'center' },
  stepIconText: { color: C.white, fontSize: 22 },
  stepValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 15 },
  stepValue: { color: C.white, fontSize: 42, fontWeight: '700', letterSpacing: -1.5 },
  stepUnit: { color: '#C0D8CB', fontSize: 13, marginLeft: 8 },
  progressTrack: { height: 6, backgroundColor: '#FFFFFF28', borderRadius: 8, marginTop: 13, overflow: 'hidden' },
  progressFill: { width: '0%', height: '100%', backgroundColor: '#CDE9D6', borderRadius: 8 },
  progressTrackLight: { height: 6, backgroundColor: '#E9EFEA', borderRadius: 8, marginTop: 10, overflow: 'hidden' },
  progressFillLight: { height: '100%', backgroundColor: C.green, borderRadius: 8 },
  cardFootnote: { color: '#D4E4DA', fontSize: 11, lineHeight: 16, marginTop: 11 },
  stepSourceLabel: { color: '#D4E4DA', fontSize: 10, marginTop: 5 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 12 },
  sectionTitle: { color: C.ink, fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  sectionDetail: { color: C.muted, fontSize: 11 },
  activityCard: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, marginBottom: 10 },
  emptyCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  emptyIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  emptyIconText: { color: C.green, fontSize: 22 },
  emptyCopy: { flex: 1, marginLeft: 12 },
  emptyTitle: { color: C.ink, fontSize: 13, fontWeight: '700' },
  emptyBody: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  pageTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5, marginBottom: 19 },
  pageTitle: { color: C.ink, fontSize: 27, fontWeight: '700', letterSpacing: -0.8, marginTop: 4 },
  pageSubtitle: { color: C.muted, fontSize: 12, marginTop: 5, marginBottom: 16 },
  filterLabel: { color: C.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginTop: 4, marginBottom: 8 },
  filterRow: { gap: 7, paddingBottom: 13 },
  loadMoreButton: { marginTop: 12, marginBottom: 8 },
  logButton: { paddingHorizontal: 15 },
  formTitle: { color: C.ink, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  formHint: { color: C.muted, fontSize: 11, lineHeight: 16, marginBottom: 17 },
  activityChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  chip: { borderRadius: 20, borderWidth: 1, borderColor: C.line, paddingVertical: 8, paddingHorizontal: 11 },
  chipSelected: { backgroundColor: C.pale, borderColor: '#B9D4C3' },
  chipText: { color: C.muted, fontSize: 11, fontWeight: '600' },
  chipTextSelected: { color: C.green },
  twoColumns: { flexDirection: 'row', gap: 10 },
  column: { flex: 1 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  actionButton: { flex: 1 },
  listCard: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, marginBottom: 10 },
  workoutRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: C.line },
  workoutActions: { alignItems: 'center', marginLeft: 8 },
  rowAction: { minWidth: 36, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  pendingCard: { backgroundColor: C.pale, borderRadius: 16, borderWidth: 1, borderColor: '#C9DDD0', padding: 14, marginTop: 18, marginBottom: 4 },
  pendingCopy: { marginBottom: 10 },
  pendingTitle: { color: C.green, fontSize: 13, fontWeight: '800' },
  pendingDetail: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  pendingButton: { minHeight: 38, alignSelf: 'flex-start' },
  pendingStatus: { color: C.gold, fontSize: 10, fontWeight: '700', marginTop: 4 },
  workoutTypeMark: { width: 40, height: 40, borderRadius: 14, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  workoutTypeInitial: { color: C.green, fontSize: 15, fontWeight: '800' },
  workoutCopy: { flex: 1, marginLeft: 12 },
  workoutType: { color: C.ink, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  workoutMeta: { color: C.muted, fontSize: 11, marginTop: 3 },
  workoutNote: { color: C.ink, fontSize: 11, marginTop: 6 },
  goalRow: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: C.line },
  goalRowTop: { flexDirection: 'row', alignItems: 'center' },
  goalCopy: { flex: 1 },
  goalName: { color: C.ink, fontSize: 13, fontWeight: '700' },
  goalComplete: { color: C.green, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  goalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, paddingTop: 10 },
  goalActionText: { color: C.green, fontSize: 11, fontWeight: '700' },
  progressSummaryCard: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 10 },
  summaryEyebrow: { color: C.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  weekChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', minHeight: 84, marginTop: 12 },
  weekColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  weekValue: { color: C.muted, fontSize: 8, height: 13 },
  weekBarTrack: { height: 54, width: '56%', alignItems: 'center', justifyContent: 'flex-end', backgroundColor: '#F0F3EF', borderRadius: 6, overflow: 'hidden' },
  weekBar: { width: '100%', backgroundColor: C.green, borderRadius: 6 },
  weekDate: { color: C.muted, fontSize: 9, marginTop: 5 },
  summaryMetrics: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, marginTop: 14, paddingTop: 12 },
  summaryMetric: { flex: 1, alignItems: 'center' },
  summaryValue: { color: C.ink, fontSize: 17, fontWeight: '700' },
  summaryLabel: { color: C.muted, fontSize: 9, marginTop: 3 },
  deleteButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  deleteButtonText: { color: C.muted, fontSize: 23 },
  loader: { paddingVertical: 25 },
  goalPlaceholder: { marginTop: 19 },
  profileCard: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 18, marginTop: 14 },
  profileLabel: { color: C.green, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  profileEmail: { color: C.ink, fontSize: 15, fontWeight: '700', marginTop: 9 },
  profileFields: { marginTop: 17 },
  profileSaved: { color: C.green, fontSize: 12, fontWeight: '600', marginTop: 2, marginBottom: 10 },
  profileSaveButton: { marginTop: 2 },
  exportHint: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 20, marginBottom: 10 },
  exportButton: { marginBottom: 2 },
  healthCard: { backgroundColor: C.pale, borderWidth: 1, borderColor: '#C9DDD0', borderRadius: 14, padding: 14, marginTop: 20 },
  healthTitle: { color: C.green, fontSize: 14, fontWeight: '800' },
  healthCopy: { color: C.ink, fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 10 },
  healthStatus: { color: C.muted, fontSize: 11, lineHeight: 16, marginBottom: 10 },
  healthActions: { gap: 8 },
  healthAction: { width: '100%' },
  deleteAccountButton: { marginTop: 18 },
  deleteAccountPanel: { backgroundColor: '#FBEDEA', borderWidth: 1, borderColor: '#E8C5BF', borderRadius: 14, padding: 14, marginTop: 18 },
  deleteAccountTitle: { color: C.red, fontSize: 14, fontWeight: '800' },
  deleteAccountCopy: { color: C.ink, fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 12 },
  profileMeta: { color: C.muted, fontSize: 12, marginTop: 6 },
  signOutButton: { marginTop: 15 },
  footer: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 24, marginBottom: 8 },
  tabBar: { flexDirection: 'row', backgroundColor: C.white, borderTopColor: C.line, borderTopWidth: 1, paddingTop: 9, paddingBottom: Platform.OS === 'ios' ? 17 : 9 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  tabIcon: { color: C.muted, fontSize: 18, lineHeight: 21 },
  tabLabel: { color: C.muted, fontSize: 9, marginTop: 2 },
  tabSelected: { color: C.green, fontWeight: '800' },
});
