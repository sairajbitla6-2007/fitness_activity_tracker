import { api } from './api';
import { listPending, removePending } from './offline-queue';

const syncsInFlight = new Map();

export async function syncPendingActivity(userId) {
  if (syncsInFlight.has(userId)) return syncsInFlight.get(userId);
  const sync = (async () => {
    let pending = await listPending(userId);
    let syncedCount = 0;
    for (const entry of pending) {
      try {
        if (entry.type === 'steps') {
          await api.saveDailySteps(entry.localDate, entry.steps);
        } else if (entry.type === 'workout') {
          await api.createWorkout(entry.payload);
        } else if (entry.type === 'workout-change') {
          if (entry.operation === 'update') {
            try {
              await api.updateWorkout(entry.workoutId, entry.payload);
            } catch (error) {
              if (error.status !== 404) throw error;
            }
          } else if (entry.operation === 'delete') {
            try {
              await api.deleteWorkout(entry.workoutId);
            } catch (error) {
              if (error.status !== 404) throw error;
            }
          } else {
            throw new Error('Unsupported pending workout change.');
          }
        }
        await removePending(userId, entry.id);
        syncedCount += 1;
      } catch (error) {
        pending = await listPending(userId);
        return { pending, syncedCount, error };
      }
    }
    return { pending: await listPending(userId), syncedCount, error: null };
  })().finally(() => {
    syncsInFlight.delete(userId);
  });
  syncsInFlight.set(userId, sync);
  return sync;
}
