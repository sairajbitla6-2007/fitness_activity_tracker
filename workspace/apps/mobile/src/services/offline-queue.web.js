const maximumItems = 20;
const queues = new Map();

function queueFor(userId) {
  if (!queues.has(userId)) queues.set(userId, []);
  return queues.get(userId);
}

export async function listPending(userId) {
  return [...queueFor(userId)].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function enqueuePending(userId, entry) {
  const queue = queueFor(userId);
  const existingIndex = queue.findIndex((item) => item.id === entry.id);
  if (existingIndex < 0 && queue.length >= maximumItems) {
    throw new Error('Your offline queue is full. Reconnect to sync pending activity before adding more.');
  }
  if (existingIndex < 0) queue.push(entry);
  else queue[existingIndex] = entry;
  return entry;
}

export async function removePending(userId, entryId) {
  const queue = queueFor(userId);
  queues.set(userId, queue.filter((entry) => entry.id !== entryId));
}
