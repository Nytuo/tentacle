use keyring::Entry;

const SERVICE: &str = "tentacle";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| format!("Keychain unavailable: {e}"))
}

pub fn read(key: &str) -> Result<Option<String>, String> {
    match entry(key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Keychain read failed: {e}")),
    }
}

pub fn write(key: &str, value: &str) -> Result<(), String> {
    entry(key)?
        .set_password(value)
        .map_err(|e| format!("Keychain write failed: {e}"))
}

pub fn delete(key: &str) -> Result<(), String> {
    match entry(key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Keychain delete failed: {e}")),
    }
}

#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
    if value.is_empty() {
        return delete(&key);
    }
    write(&key, &value)
}

#[tauri::command]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
    read(&key)
}

#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), String> {
    delete(&key)
}

#[tauri::command]
pub fn secret_has(key: String) -> Result<bool, String> {
    Ok(read(&key)?.is_some())
}
