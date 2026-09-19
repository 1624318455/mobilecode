import * as SecureStore from "expo-secure-store";

const TOKEN_PREFIX = "dsh-device-token-";
const CA_PREFIX = "dsh-ca-";

function tokenKey(ref: string): string {
  return `${TOKEN_PREFIX}${ref}`;
}

function caKey(ref: string): string {
  return `${CA_PREFIX}${ref}`;
}

export async function saveDeviceToken(
  ref: string,
  token: string,
): Promise<void> {
  await SecureStore.setItemAsync(tokenKey(ref), token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getDeviceToken(ref: string): Promise<string | null> {
  return SecureStore.getItemAsync(tokenKey(ref));
}

export async function deleteDeviceToken(ref: string): Promise<void> {
  await SecureStore.deleteItemAsync(tokenKey(ref));
}

export async function saveCa(ref: string, pem: string): Promise<void> {
  await SecureStore.setItemAsync(caKey(ref), pem, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getCa(ref: string): Promise<string | null> {
  return SecureStore.getItemAsync(caKey(ref));
}

export async function deleteCa(ref: string): Promise<void> {
  await SecureStore.deleteItemAsync(caKey(ref));
}

export async function clearSecureForServer(ref: string): Promise<void> {
  await deleteDeviceToken(ref);
  await deleteCa(ref);
}
