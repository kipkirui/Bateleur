#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Classification {
    pub feed: &'static str,
    pub category: Option<&'static str>,
    pub reason: &'static str,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Strength {
    Low,
    High,
}

struct Rule {
    needles: &'static [&'static str],
    category: &'static str,
    reason: &'static str,
    strength: Strength,
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
        strength: Strength::High,
    },
    Rule {
        needles: &["payment due", "overdue", "invoice #"],
        category: "Invoice",
        reason: "Contains an invoice or payment-due phrase",
        strength: Strength::High,
    },
    Rule {
        needles: &["invoice"],
        category: "Invoice",
        reason: "An invoice phrase matched without a due-date signal",
        strength: Strength::Low,
    },
    Rule {
        needles: &["your receipt", "order receipt", "payment receipt"],
        category: "Receipt",
        reason: "Contains a receipt phrase",
        strength: Strength::High,
    },
    Rule {
        needles: &["receipt"],
        category: "Receipt",
        reason: "A receipt phrase matched without a stronger action signal",
        strength: Strength::Low,
    },
    Rule {
        needles: &["wire transfer"],
        category: "Wire",
        reason: "Contains a wire-transfer phrase",
        strength: Strength::High,
    },
    Rule {
        needles: &["please reply", "needs your", "action required"],
        category: "Please reply",
        reason: "Contains a please-reply or action-required phrase",
        strength: Strength::High,
    },
    Rule {
        needles: &["confirm your", "verify your"],
        category: "Please reply",
        reason: "A confirm/verify phrase matched without a stronger action signal",
        strength: Strength::Low,
    },
    Rule {
        needles: &["rsvp"],
        category: "RSVP",
        reason: "An RSVP phrase matched without a calendar part",
        strength: Strength::Low,
    },
    Rule {
        needles: &[
            "invitation",
            "invited you",
            "you're invited",
            "you are invited",
            "calendar invite",
            "you have been invited",
        ],
        category: "Invite",
        reason: "An invite phrase matched without a calendar part",
        strength: Strength::Low,
    },
    Rule {
        needles: &["sign-off", "sign off"],
        category: "Sign-off",
        reason: "A sign-off phrase matched without a stronger action signal",
        strength: Strength::Low,
    },
    Rule {
        needles: &["password"],
        category: "Password",
        reason: "A password phrase matched without a 2FA signal",
        strength: Strength::Low,
    },
    Rule {
        needles: &["kyc"],
        category: "KYC",
        reason: "Contains a KYC phrase",
        strength: Strength::High,
    },
];

const READING: Classification = Classification {
    feed: "reading",
    category: None,
    reason: "No action phrase matched",
};

pub fn classify_mail(subject: &str, preview: &str, from_email: &str) -> Classification {
    let blob = format!("{subject} {preview} {from_email}").to_lowercase();
    let mut best: Option<(&Rule, Strength)> = None;
    for rule in RULES {
        if !rule.needles.iter().any(|needle| blob.contains(needle)) {
            continue;
        }
        match best {
            None => best = Some((rule, rule.strength)),
            Some((_, strength)) if rule.strength > strength => best = Some((rule, rule.strength)),
            Some(_) => {}
        }
    }
    match best {
        Some((rule, Strength::High)) => Classification {
            feed: "action",
            category: Some(rule.category),
            reason: rule.reason,
        },
        Some((rule, Strength::Low)) => Classification {
            feed: "uncertain",
            category: Some(rule.category),
            reason: rule.reason,
        },
        None => READING,
    }
}

pub fn classify_feed(subject: &str, preview: &str, from_email: &str) -> &'static str {
    classify_mail(subject, preview, from_email).feed
}

/// Codes and identity checks stay Action unless the editor Guess-again. Staff triage skips these on batch.
pub fn keep_local_action(category: Option<&str>) -> bool {
    matches!(category, Some("2FA" | "Password" | "KYC"))
}

pub fn with_calendar(class: Classification, has_calendar: bool) -> Classification {
    if !has_calendar || keep_local_action(class.category) {
        return class;
    }
    Classification {
        feed: "action",
        category: Some("Invite"),
        reason: "This letter includes a calendar invite",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invoice_is_action() {
        let c = classify_mail("Invoice #12", "Payment due Friday", "ap@acme.test");
        assert_eq!(c.feed, "action");
        assert_eq!(c.category, Some("Invoice"));
        assert!(c.reason.contains("invoice") || c.reason.contains("payment"));
    }

    #[test]
    fn bare_invoice_is_uncertain() {
        let c = classify_mail("Invoice tips this week", "How to bill clients", "news@example.com");
        assert_eq!(c.feed, "uncertain");
        assert_eq!(c.category, Some("Invoice"));
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
        assert_eq!(c.feed, "action");
        assert!(keep_local_action(c.category));
    }

    #[test]
    fn password_without_2fa_is_uncertain() {
        let c = classify_mail("Password hygiene", "Tips for a stronger password", "news@x.test");
        assert_eq!(c.feed, "uncertain");
        assert_eq!(c.category, Some("Password"));
    }

    #[test]
    fn marketing_invite_is_uncertain() {
        let c = classify_mail("You're invited", "Join our webinar", "hello@brand.test");
        assert_eq!(c.feed, "uncertain");
        assert_eq!(c.category, Some("Invite"));
    }

    #[test]
    fn please_reply_stays_action() {
        let c = classify_mail("Spec review", "Please reply by Friday", "sam@work.test");
        assert_eq!(c.feed, "action");
        assert_eq!(c.category, Some("Please reply"));
    }

    #[test]
    fn invoice_can_be_retried() {
        assert!(!keep_local_action(Some("Invoice")));
        assert!(!keep_local_action(None));
    }

    #[test]
    fn calendar_part_is_action_invite() {
        let reading = classify_mail("Lunch", "See you there", "sam@x.test");
        let class = with_calendar(reading, true);
        assert_eq!(class.feed, "action");
        assert_eq!(class.category, Some("Invite"));
        let twofa = classify_mail("Your verification code", "Use 12", "a@b.test");
        assert_eq!(with_calendar(twofa, true).category, Some("2FA"));
        let invite_phrase = classify_mail("You're invited", "Join us", "a@b.test");
        let class = with_calendar(invite_phrase, true);
        assert_eq!(class.feed, "action");
        assert_eq!(class.category, Some("Invite"));
    }
}
