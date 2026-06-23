import mondaySdk from 'monday-sdk-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const monday = mondaySdk() as any;

export function initMonday() {
  return monday;
}

export async function apiCall<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await monday.api(query, { variables, apiVersion: '2024-10' });
  if (res.errors) {
    throw new Error(res.errors.map((e: { message: string }) => e.message).join(', '));
  }
  return res.data as T;
}

export async function getContext(): Promise<{
  itemId: string;
  boardId: string;
  theme: string;
}> {
  const res = await monday.get('context');
  return res.data;
}

export function listen(
  type: string,
  callback: (data: unknown) => void,
): void {
  monday.listen(type, callback);
}

export { monday };
