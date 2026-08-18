#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Classification {
    pub feed: &'static str,
    pub category: Option<&'static str>,
    pub reason: &'static str,
}

struct Rule {
    needles: &'static [&'static str],
    category: &'static str,
    reason: &'static str,
}

const RULES: &[Rule] = &[
    Rule {
        needles: &[
            "verification code",
            "security code",
            "authentication code",
            "one-time",
            "otp",
            "2fa",
        ],
        category: "2FA",
        reason: "Contains a verification or 2FA phrase",
    },
    Rule {
        needles: &["invoice", "payment due", "overdue"],
        category: "Invoice",
        reason: "Contains an invoice or payment-due phrase",
    },
    Rule {
        needles: &["receipt"],
        category: "Receipt",
        reason: "Contains a receipt phrase",
    },
    Rule {
        needles: &["wire transfer"],
        category: "Wire",
        reason: "Contains a wire-transfer phrase",
    },
    Rule {
        needles: &["please reply", "needs your", "action required", "confirm your", "verify your"],
        category: "Please reply",
        reason: "Contains a please-reply or action-required phrase",
    },
    Rule {
        needles: &["rsvp"],
        category: "RSVP",
        reason: "Contains an RSVP phrase",
    },
    Rule {
        needles: &["sign-off", "sign off"],
        category: "Sign-off",
        reason: "Contains a sign-off phrase",
    },
    Rule {
        needles: &["password"],
        category: "Password",
        reason: "Contains a password phrase",
    },
    Rule {
        needles: &["kyc"],
        category: "KYC",
        reason: "Contains a KYC phrase",
    },
];

const READING: Classification = Classification {
    feed: "reading",
    category: None,
    reason: "No action phrase matched",
};

pub fn classify_mail(subject: &str, preview: &str, from_email: &str) -> Classification {
    let blob = format!("{subject} {preview} {from_email}").to_lowercase();
    for rule in RULES {
        if rule.needles.iter().any(|needle| blob.contains(needle)) {
            return Classification {
                feed: "action",
                category: Some(rule.category),
                reason: rule.reason,
            };
        }
    }
    READING
}

pub fn classify_feed(subject: &str, preview: &str, from_email: &str) -> &'static str {
    classify_mail(subject, preview, from_email).feed
}

/// Codes and identity checks stay Action unless the editor Guess-again. Staff triage skips these on batch.
pub fn keep_local_action(category: Option<&str>) -> bool {
    matches!(category, Some("2FA" | "Password" | "KYC"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invoice_is_action() {
        let c = classify_mail("Invoice #12", "Payment due Friday", "ap@acme.test");
        assert_eq!(c.feed, "action");
        assert_eq!(c.category, Some("Invoice"));
        assert!(c.reason.contains("invoice"));
    }

    #[test]
    fn newsletter_is_reading() {
        let c = classify_mail("This week in birds", "A long FYI", "news@example.com");
        assert_eq!(c.feed, "reading");
        assert_eq!(c.category, None);
    }

    #[test]
    fn two_factor_beats_generic() {
        let c = classify_mail("Your verification code", "Use 482191", "noreply@x.test");
        assert_eq!(c.category, Some("2FA"));
        assert!(keep_local_action(c.category));
    }

    #[test]
    fn invoice_can_be_retried() {
        assert!(!keep_local_action(Some("Invoice")));
        assert!(!keep_local_action(None));
    }
}
