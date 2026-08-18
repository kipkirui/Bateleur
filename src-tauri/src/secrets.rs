use keyring::credential::CredentialPersistence;
use keyring::Entry;

/// Service name for IMAP passwords. Staff keys use `bateleur.staff`.
const SERVICE: &str = "bateleur.imap";
const STAFF_SERVICE: &str = "bateleur.staff";
const STAFF_USER: &str = "byok";
/// Windows CredWrite blob is 2560 bytes. keyring stores passwords as UTF-16,
/// so the max is 1280 code units. Stay under that per entry.
const CHUNK_MAX: usize = 1200;
const CHUNK_MARK: &str = "bateleur.chunks:";
const CHUNK_PARTS: usize = 16;

pub fn save_password(address: &str, password: &str) -> Result<(), String> {
    ensure_persistent_store()?;
    if utf16_len(password) <= CHUNK_MAX {
        entry(address)?.set_password(password).map_err(err)?;
        clear_parts(address, 0)?;
    } else {
        let chunks = split_utf16(password, CHUNK_MAX);
        if chunks.len() > CHUNK_PARTS {
            return Err("That secret is too large for the OS keychain.".into());
        }
        entry(address)?
            .set_password(&format!("{CHUNK_MARK}{}", chunks.len()))
            .map_err(err)?;
        for (index, chunk) in chunks.iter().enumerate() {
            part_entry(address, index)?
                .set_password(chunk)
                .map_err(err)?;
        }
        clear_parts(address, chunks.len())?;
    }
    // Open a *new* entry for the read-back. keyring's mock store keeps the secret
    // on the Entry object (EntryOnly), so round-tripping the same handle cannot
    // tell us the OS keychain actually persisted anything.
    let readback = load_password(address)?;
    if readback != password {
        return Err("Password did not round-trip through the OS keychain.".into());
    }
    Ok(())
}

pub fn load_password(address: &str) -> Result<String, String> {
    match entry(address)?.get_password() {
        Ok(raw) => join_if_chunked(address, &raw),
        Err(keyring::Error::NoEntry) => match legacy_entry(address)?.get_password() {
            Ok(password) => Ok(password),
            Err(keyring::Error::NoEntry) => Err(
                "No password in the OS keychain for this account. Add the mailbox again from Settings."
                    .into(),
            ),
            Err(other) => Err(err(other)),
        },
        Err(other) => Err(err(other)),
    }
}

pub fn delete_password(address: &str) -> Result<(), String> {
    let _ = clear_parts(address, 0);
    if let Ok(item) = entry(address) {
        let _ = item.delete_credential();
    }
    if let Ok(item) = legacy_entry(address) {
        let _ = item.delete_credential();
    }
    Ok(())
}

pub fn save_staff_key(key: &str) -> Result<(), String> {
    ensure_persistent_store()?;
    staff_entry()?.set_password(key).map_err(err)?;
    let readback = staff_entry()?.get_password().map_err(err)?;
    if readback != key {
        return Err("Staff key did not round-trip through the OS keychain.".into());
    }
    Ok(())
}

pub fn load_staff_key() -> Result<String, String> {
    match staff_entry()?.get_password() {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => {
            Err("Staff has no key. Hire staff and paste one.".into())
        }
        Err(other) => Err(err(other)),
    }
}

pub fn staff_key_present() -> bool {
    matches!(staff_entry().and_then(|e| e.get_password().map_err(err)), Ok(key) if !key.is_empty())
}

pub fn delete_staff_key() -> Result<(), String> {
    if let Ok(item) = staff_entry() {
        let _ = item.delete_credential();
    }
    Ok(())
}

fn staff_entry() -> Result<Entry, String> {
    Entry::new(STAFF_SERVICE, STAFF_USER).map_err(err)
}

fn ensure_persistent_store() -> Result<(), String> {
    match keyring::default::default_credential_builder().persistence() {
        CredentialPersistence::EntryOnly | CredentialPersistence::ProcessOnly => Err(
            "This build cannot store passwords in the OS keychain. Rebuild with the platform keyring feature enabled."
                .into(),
        ),
        _ => Ok(()),
    }
}

fn entry(address: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &user_key(address)).map_err(err)
}

fn part_entry(address: &str, index: usize) -> Result<Entry, String> {
    Entry::new(SERVICE, &format!("{}.p{index}", user_key(address))).map_err(err)
}

fn join_if_chunked(address: &str, raw: &str) -> Result<String, String> {
    let Some(count) = chunk_count(raw) else {
        return Ok(raw.to_string());
    };
    let mut out = String::new();
    for index in 0..count {
        match part_entry(address, index)?.get_password() {
            Ok(part) => out.push_str(&part),
            Err(keyring::Error::NoEntry) => {
                return Err("The OS keychain is missing part of this mailbox secret. Sign in again from Settings.".into());
            }
            Err(other) => return Err(err(other)),
        }
    }
    Ok(out)
}

fn chunk_count(raw: &str) -> Option<usize> {
    let rest = raw.strip_prefix(CHUNK_MARK)?;
    let n: usize = rest.parse().ok()?;
    if n == 0 || n > CHUNK_PARTS {
        return None;
    }
    Some(n)
}

fn split_utf16(value: &str, max: usize) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    let mut len = 0;
    for ch in value.chars() {
        let n = ch.len_utf16();
        if len + n > max && !buf.is_empty() {
            out.push(std::mem::take(&mut buf));
            len = 0;
        }
        buf.push(ch);
        len += n;
    }
    if !buf.is_empty() {
        out.push(buf);
    }
    out
}

fn clear_parts(address: &str, from: usize) -> Result<(), String> {
    for index in from..CHUNK_PARTS {
        if let Ok(item) = part_entry(address, index) {
            let _ = item.delete_credential();
        }
    }
    Ok(())
}

fn utf16_len(value: &str) -> usize {
    value.encode_utf16().count()
}

/// Builds from before the Windows target-name fix used service `bateleur`
/// and user `imap:{address}`, which maps to a target containing `:`.
fn legacy_entry(address: &str) -> Result<Entry, String> {
    Entry::new("bateleur", &format!("imap:{address}")).map_err(err)
}

fn user_key(address: &str) -> String {
    // Windows generic credentials are identified only by target name, which
    // keyring builds as `{user}.{service}`. `:` is reserved in that string;
    // `@` can make Windows treat the target as a UPN.
    address.replace('@', "_at_").replace([':', '/', '\\'], "_")
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keychain_round_trips_across_entries() {
        let address = "keychain-test@bateleur.example";
        let password = "not-a-real-secret";
        let _ = delete_password(address);
        save_password(address, password).expect("save to OS keychain");
        let loaded = load_password(address).expect("load from a new entry");
        assert_eq!(loaded, password);
        delete_password(address).expect("cleanup test credential");
    }

    #[test]
    fn keychain_round_trips_over_windows_blob_limit() {
        let address = "keychain-chunk-test@bateleur.example";
        let password = "m".repeat(3000);
        assert!(utf16_len(&password) > 2560);
        let _ = delete_password(address);
        save_password(address, &password).expect("save chunked secret");
        let loaded = load_password(address).expect("load chunked secret");
        assert_eq!(loaded, password);
        delete_password(address).expect("cleanup chunked credential");
    }

    #[test]
    fn utf16_chunks_join() {
        let raw = "é".repeat(2000);
        let parts = split_utf16(&raw, 100);
        assert!(parts.len() > 1);
        assert!(parts.iter().all(|p| utf16_len(p) <= 100));
        assert_eq!(parts.concat(), raw);
    }
}
