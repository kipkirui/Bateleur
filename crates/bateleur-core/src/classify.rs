const ACTION: &[&str] = &[
    "verification code",
    "security code",
    "authentication code",
    "one-time",
    "otp",
    "2fa",
    "invoice",
    "receipt",
    "payment due",
    "overdue",
    "password",
    "confirm your",
    "verify your",
    "sign-off",
    "sign off",
    "action required",
    "please reply",
    "needs your",
    "rsvp",
    "wire transfer",
    "kyc",
];

pub fn classify_feed(subject: &str, preview: &str, from_email: &str) -> &'static str {
    let blob = format!("{subject} {preview} {from_email}").to_lowercase();
    if ACTION.iter().any(|needle| blob.contains(needle)) {
        "action"
    } else {
        "reading"
    }
}
