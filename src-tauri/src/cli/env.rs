//! Per-profile environment construction.

use crate::cli::CliKind;
use crate::db::Profile;

/// Environment overrides that isolate and configure a session for `profile`.
///
/// Each profile owns a private config dir so logins/auth stay fully separated:
/// Claude reads `CLAUDE_CONFIG_DIR`, Codex reads `CODEX_HOME`. Optional model /
/// base-url overrides map to the Anthropic env vars Claude honors. The other
/// CLIs expose no verified config-dir env var, so no overrides are applied for
/// them rather than guessing one.
pub fn profile_env(kind: CliKind, profile: &Profile) -> Vec<(String, String)> {
    let mut env = Vec::new();
    match kind {
        CliKind::Claude => {
            env.push(("CLAUDE_CONFIG_DIR".into(), profile.config_dir.clone()));
            if let Some(model) = profile.model.as_deref() {
                env.push(("ANTHROPIC_MODEL".into(), model.to_string()));
            }
            if let Some(base_url) = profile.base_url.as_deref() {
                env.push(("ANTHROPIC_BASE_URL".into(), base_url.to_string()));
            }
        }
        CliKind::Codex => {
            env.push(("CODEX_HOME".into(), profile.config_dir.clone()));
        }
        CliKind::Gemini | CliKind::Opencode | CliKind::Grok => {}
    }
    env
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Profile;

    fn profile() -> Profile {
        Profile {
            id: "p1".into(),
            name: "Work".into(),
            color: "#fff".into(),
            config_dir: "/cfg".into(),
            model: Some("opus".into()),
            base_url: Some("https://proxy".into()),
        }
    }

    #[test]
    fn claude_isolates_and_overrides() {
        let env = profile_env(CliKind::Claude, &profile());
        assert!(env.contains(&("CLAUDE_CONFIG_DIR".into(), "/cfg".into())));
        assert!(env.contains(&("ANTHROPIC_MODEL".into(), "opus".into())));
        assert!(env.contains(&("ANTHROPIC_BASE_URL".into(), "https://proxy".into())));
    }

    #[test]
    fn codex_sets_home_only() {
        let env = profile_env(CliKind::Codex, &profile());
        assert_eq!(env, vec![("CODEX_HOME".to_string(), "/cfg".to_string())]);
    }

    #[test]
    fn others_get_no_overrides() {
        assert!(profile_env(CliKind::Gemini, &profile()).is_empty());
        assert!(profile_env(CliKind::Opencode, &profile()).is_empty());
    }
}
