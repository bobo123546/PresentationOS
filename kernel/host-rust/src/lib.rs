pub fn pres_version() -> &'static str {
    "0.0.0"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_semver() {
        assert!(pres_version().starts_with("0."));
    }
}
