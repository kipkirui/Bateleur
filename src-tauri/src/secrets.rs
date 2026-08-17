use keyring::credential::CredentialPersistence;
use keyring::Entry;

/// Service name for IMAP passwords. Kept distinct from a future SMTP/AI key.
const SERVICE: &str = "bateleur.imap";

pub fn save_password(address: &str, password: &str) -> Result<(), String> {
    ensure_persistent_store()?;
    entry(address)?.set_password(password).map_err(err)?;
    // Open a *new* entry for the read-back. keyring's mock store keeps the secret
    // on the Entry object (EntryOnly), so round-tripping the same handle cannot
    // tell us the OS keychain actually persisted anything.
    let readback = entry(address)?.get_password().map_err(err)?;
    if readback != password {
        return Err("Password did not round-trip through the OS keychain.".into());
    }
    Ok(())
}

pub fn load_password(address: &str) -> Result<String, String> {
    match entry(address)?.get_password() {
        Ok(password) => Ok(password),
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
    if let Ok(item) = entry(address) {
        let _ = item.delete_credential();
    }
    if let Ok(item) = legacy_entry(address) {
        let _ = item.delete_credential();
    }
    Ok(())
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
        let _ = entry(address).and_then(|e| e.delete_credential().map_err(err));
        save_password(address, password).expect("save to OS keychain");
        let loaded = load_password(address).expect("load from a new entry");
        assert_eq!(loaded, password);
        entry(address)
            .unwrap()
            .delete_credential()
            .expect("cleanup test credential");
    }
}
